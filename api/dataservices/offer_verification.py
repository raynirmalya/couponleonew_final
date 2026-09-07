"""Evidence-backed offer status. Public reads never contact a merchant or write data.

Only the local operator CLI writes reviews. A feed flag or an automatic listing
check can never authorize a checkout badge. Evidence lives outside the web root.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from functools import lru_cache
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit

UTC = timezone.utc
CHECKOUT_VALIDITY = timedelta(hours=24)
MERCHANT_VALIDITY = timedelta(days=7)
MAX_EVIDENCE_BYTES = 5 * 1024 * 1024
FINGERPRINT_FIELDS = ('id', 'storeId', 'storeSlug', 'title', 'description', 'code',
                      'discountText', 'type', 'expiresAt', 'ctaUrl', 'location',
                      'primary_location', 'locations', 'expiryIssue')


def utcnow():
    return datetime.now(UTC)


def timestamp(value):
    return value.astimezone(UTC).isoformat().replace('+00:00', 'Z')


def parse_time(value):
    result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('A timestamp with a timezone is required.')
    return result.astimezone(UTC)


def text(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def offer_key(offer):
    identifier, store = text(offer.get('id')), text(offer.get('storeSlug'))
    return json.dumps([store, identifier], separators=(',', ':')) if identifier and store else ''


def fingerprint(offer):
    # Match the display pipeline's harmless whitespace/banner normalization.
    normalized = {key: text(offer.get(key)) for key in FINGERPRINT_FIELDS}
    normalized['description'] = re.sub(r'[_ -]*\d{2,4}x\d{2,4}$', '', normalized['description'], flags=re.I)
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def expiry_end(value):
    value = text(value)
    if not value:
        return None
    # CouponLeo's feed contract treats expiry dates as inclusive UTC calendar days.
    day = datetime.fromisoformat(value.replace('Z', '+00:00')).date()
    return datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=UTC)


def listing_checks(offer, now=None):
    now = now or utcnow()
    checks = []
    def add(name, state, detail):
        checks.append({'name': name, 'status': state, 'detail': detail})
    add('identity', 'pass' if offer_key(offer) and text(offer.get('title')) else 'fail',
        'Offer and merchant identifiers are present.' if offer_key(offer) and text(offer.get('title')) else 'Offer identification is incomplete.')
    try:
        if offer.get('expiryIssue'):
            raise ValueError('Unusable feed expiry')
        expires = expiry_end(offer.get('expiresAt'))
        state = 'unknown' if expires is None else 'pass' if expires > now else 'fail'
        add('expiry', state, 'Expiry was not supplied by the feed.' if expires is None else
            'The supplied expiry date has not passed.' if state == 'pass' else 'The supplied expiry date has passed.')
    except (ValueError, OverflowError):
        add('expiry', 'fail', 'The supplied expiry date cannot be read.')
    kind = text(offer.get('type'))
    has_code = bool(text(offer.get('code')))
    valid_kind = kind in ('code', 'deal') and (kind != 'code' or has_code)
    mentioned_codes = re.findall(r'(?:use|with|enter|apply)\s+(?:the\s+)?(?:(?:promo|coupon|discount)\s+)?code\s*:?\s+([A-Z0-9][A-Z0-9_-]{2,})',
                                 text(offer.get('title')) + ' ' + text(offer.get('description')), flags=re.I)
    # A feed can misclassify "Use code SAVE10" as a code-free sale.
    code_mismatch = bool(mentioned_codes) and (not has_code or text(offer.get('code')).casefold() not in {code.casefold() for code in mentioned_codes})
    valid_kind = valid_kind and not code_mismatch
    add('code', 'pass' if valid_kind else 'fail',
        'The code field does not match the code described in the offer text.' if code_mismatch else
        'A coupon code is supplied; acceptance at checkout is not established.' if has_code else
        'This is a sale listing with no code to enter.' if valid_kind else 'A code listing is missing its coupon code.')
    try:
        url = urlsplit(text(offer.get('ctaUrl')))
        valid_url = url.scheme in ('http', 'https') and bool(url.hostname) and not url.username and not url.password
    except ValueError:
        valid_url = False
    add('link', 'pass' if valid_url else 'fail',
        'Link format checked; no merchant or affiliate link was opened.' if valid_url else 'The merchant link format needs review.')
    sets = [set(re.findall(r'(\d+(?:\.\d+)?)\s*%', text(offer.get(key)))) for key in ('title', 'description', 'discountText')]
    sets = [values for values in sets if values]
    consistent = len(sets) < 2 or bool(set.intersection(*sets))
    add('discount', 'pass' if consistent else 'fail', 'No conflicting percentage claims detected.' if consistent else 'The offer contains conflicting percentage claims.')
    return checks


def default_database():
    return Path(os.getenv('COUPONLEO_VERIFICATION_DB', '/var/lib/couponleo-verification/reviews.sqlite3'))


@lru_cache(maxsize=128)
def _evidence_digest(path, mtime_ns, size):
    if size > MAX_EVIDENCE_BYTES:
        return ''
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class VerificationStore:
    def __init__(self, database=None):
        self.database = Path(database) if database is not None else default_database()

    def initialize(self):
        self.database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with sqlite3.connect(self.database, timeout=5) as connection:
            connection.execute('''CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT, offer_key TEXT NOT NULL,
                fingerprint TEXT NOT NULL, record TEXT NOT NULL)''')
            connection.execute('CREATE INDEX IF NOT EXISTS reviews_offer ON reviews(offer_key, id DESC)')
        if os.name != 'nt':
            self.database.chmod(0o600)

    def latest(self, offers):
        keys = list({offer_key(offer) for offer in offers if offer_key(offer)})
        if not keys or not self.database.exists():
            return {}
        records = {}
        uri = self.database.resolve().as_uri() + '?mode=ro'
        with sqlite3.connect(uri, uri=True, timeout=0.2) as connection:
            for start in range(0, len(keys), 200):
                batch = keys[start:start + 200]
                placeholders = ','.join('?' for _ in batch)
                rows = connection.execute(f'''SELECT r.offer_key, r.record FROM reviews r JOIN
                    (SELECT MAX(id) id FROM reviews WHERE offer_key IN ({placeholders}) GROUP BY offer_key) latest
                    ON r.id = latest.id''', batch)
                for key, raw in rows:
                    records[key] = json.loads(raw)
        return records

    def evidence_available(self, digest):
        if not re.fullmatch(r'[a-f0-9]{64}', str(digest)):
            return False
        path = self.database.parent / 'evidence' / digest
        try:
            stat = path.stat()
            return _evidence_digest(str(path), stat.st_mtime_ns, stat.st_size) == digest
        except OSError:
            return False

    def record(self, offer, review, evidence=None, now=None):
        """Record an operator-reviewed test, never a result inferred from feed flags."""
        now = now or utcnow()
        key = offer_key(offer)
        if not key:
            raise ValueError('An offer ID and merchant slug are required.')
        status = review.get('status')
        if status not in ('checkout_passed', 'checkout_failed', 'merchant_confirmed', 'revoked'):
            raise ValueError('Choose checkout_passed, checkout_failed, merchant_confirmed, or revoked.')
        checked = parse_time(review.get('checkedAt', ''))
        if checked > now + timedelta(minutes=5):
            raise ValueError('A test cannot be dated in the future.')
        required = ['reviewer', 'summary'] + ([] if status == 'revoked' else ['country', 'conditions'])
        for name in required:
            if not isinstance(review.get(name), str) or not 2 <= len(review[name].strip()) <= 600:
                raise ValueError(f'{name} must contain 2–600 characters.')
        if status in ('checkout_passed', 'merchant_confirmed'):
            if any(check['status'] == 'fail' for check in listing_checks(offer, now)):
                raise ValueError('Resolve failed listing checks before recording a successful review.')
            if not evidence:
                raise ValueError('A private evidence file is required for a successful review.')
            if review.get('attested') is not True:
                raise ValueError('The operator must attest that they reviewed real evidence for this exact offer.')
        measurement = None
        if status == 'checkout_passed':
            cart = review.get('cart', {})
            if not isinstance(cart, dict):
                raise ValueError('Checkout cart evidence is required.')
            try:
                before, after = Decimal(str(cart['before'])), Decimal(str(cart['after']))
                if not before.is_finite() or not after.is_finite() or not 0 <= after < before:
                    raise ValueError('The same eligible cart must show a positive discount.')
            except (KeyError, InvalidOperation, TypeError):
                raise ValueError('Valid before and after cart totals are required.') from None
            if not re.fullmatch(r'[A-Z]{3}', str(cart.get('currency', ''))):
                raise ValueError('Use a three-letter currency code.')
            if not text(cart.get('items')) or len(text(cart.get('items'))) > 1000:
                raise ValueError('Describe the eligible cart items without customer details.')
            if text(offer.get('type')) != 'code' or not text(offer.get('code')):
                raise ValueError('Checkout code testing requires a code offer; sales can be merchant-confirmed.')
            if str(cart.get('appliedCode', '')) != str(offer.get('code', '')):
                raise ValueError('The applied code must exactly match the current offer.')
            if cart.get('sameCart') is not True:
                raise ValueError('Confirm both totals are for the same cart, currency, tax, and delivery settings.')
            measurement = {'before': str(before), 'after': str(after), 'currency': cart['currency'], 'items': text(cart['items'])}
        until = checked + (MERCHANT_VALIDITY if status == 'merchant_confirmed' else CHECKOUT_VALIDITY)
        try:
            expires = expiry_end(offer.get('expiresAt'))
            if expires: until = min(until, expires)
        except ValueError:
            pass  # A failure or revocation must remain recordable even for a malformed offer.
        if status in ('checkout_passed', 'merchant_confirmed') and until <= now:
            raise ValueError('This evidence is already stale; run a new test.')
        evidence_hash = ''
        if evidence:
            path = Path(evidence)
            if not path.is_file() or not 1 <= path.stat().st_size <= MAX_EVIDENCE_BYTES:
                raise ValueError('Evidence must be a nonempty file no larger than 5 MiB.')
            payload = path.read_bytes()
            evidence_hash = hashlib.sha256(payload).hexdigest()
        self.initialize()
        if evidence_hash:
            directory = self.database.parent / 'evidence'
            directory.mkdir(exist_ok=True, mode=0o700)
            destination = directory / evidence_hash
            # Content-addressed files are written atomically and never served publicly.
            if not destination.exists():
                import tempfile
                with tempfile.NamedTemporaryFile(dir=directory, delete=False) as handle:
                    handle.write(payload)
                    temporary = Path(handle.name)
                if os.name != 'nt': temporary.chmod(0o600)
                os.replace(temporary, destination)
        record = {'schemaVersion': 1, 'fingerprint': fingerprint(offer), 'status': status,
                  'checkedAt': timestamp(checked), 'validUntil': timestamp(until),
                  'reviewer': review['reviewer'].strip(), 'country': text(review.get('country')),
                  'conditions': text(review.get('conditions')), 'summary': review['summary'].strip(),
                  'evidenceSha256': evidence_hash, 'cart': measurement, 'recordedAt': timestamp(now)}
        with sqlite3.connect(self.database, timeout=5) as connection:
            cursor = connection.execute('INSERT INTO reviews(offer_key, fingerprint, record) VALUES(?,?,?)',
                                        (key, record['fingerprint'], json.dumps(record)))
            identifier = cursor.lastrowid
        return {'reviewId': identifier, 'status': status, 'checkedAt': record['checkedAt'], 'validUntil': record['validUntil']}


def verification_status(offer, record=None, store=None, now=None):
    now = now or utcnow()
    checks = listing_checks(offer, now)
    result = {'schemaVersion': 1, 'offerFingerprint': fingerprint(offer), 'status': 'unverified', 'checkedAt': None, 'validUntil': None,
              'country': '', 'conditions': '', 'summary': 'No current checkout test is recorded.',
              'listingCheckedAt': timestamp(now), 'listingChecks': checks}
    if any(check['status'] == 'fail' for check in checks):
        result.update(status='review_needed', summary='Listing details need review before a checkout claim can be made.')
        return result
    if not record:
        return result
    try:
        if record['status'] == 'revoked':
            result.update(status='revoked', checkedAt=record['checkedAt'], country=record.get('country', ''),
                          summary='A review withdrew this result.')
            return result
        if record['fingerprint'] != fingerprint(offer):
            result.update(status='offer_changed', summary='Offer details changed after the last review; a new test is needed.')
            return result
        checked, until = parse_time(record['checkedAt']), parse_time(record['validUntil'])
        validity = MERCHANT_VALIDITY if record['status'] == 'merchant_confirmed' else CHECKOUT_VALIDITY
        if checked > now + timedelta(minutes=5) or until > checked + validity:
            return result
        if until <= now:
            result.update(status='stale', summary='The last review is out of date; a new test is needed.')
            return result
        if record['status'] == 'checkout_failed':
            result.update(status='checkout_failed', checkedAt=record['checkedAt'], country=record.get('country', ''),
                          summary='The last recorded checkout test did not apply the code.')
            return result
        if not store or not store.evidence_available(record.get('evidenceSha256', '')):
            result.update(status='unverified', summary='Supporting evidence is unavailable; no checkout claim is shown.')
            return result
        if record['status'] not in ('checkout_passed', 'merchant_confirmed'):
            return result
        result.update({name: record[name] for name in ('status', 'checkedAt', 'validUntil', 'country', 'conditions')})
        # Public wording is fixed; private reviewer notes, artifact paths and cart data stay private.
        result['summary'] = 'The code reduced the tested cart total under the conditions shown.' if record['status'] == 'checkout_passed' else 'The merchant confirmed this offer under the conditions shown; CouponLeo has not established checkout success.'
        return result
    except (KeyError, ValueError, TypeError, OverflowError):
        return result


def annotate_offers(items, now=None, store=None):
    now = now or utcnow()
    store = store or VerificationStore()
    try:
        records = store.latest(items)
    except (OSError, sqlite3.Error, ValueError, TypeError):
        # A verification outage must remove the claim, never take shopping offline.
        logging.getLogger(__name__).warning('Offer evidence store unavailable; withholding verification badges.')
        records = {}
    result = []
    for original in items:
        item = dict(original)
        item['verification'] = verification_status(item, records.get(offer_key(item)), store, now)
        item['verified'] = item['verification']['status'] == 'checkout_passed'
        result.append(item)
    return result

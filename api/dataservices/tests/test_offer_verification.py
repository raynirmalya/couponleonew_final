import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from offer_verification import VerificationStore, annotate_offers, fingerprint, listing_checks


class OfferVerificationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.store = VerificationStore(Path(self.directory.name) / 'reviews.sqlite3')
        self.now = datetime(2026, 9, 7, 12, tzinfo=timezone.utc)
        self.offer = {'id': 123, 'storeId': 7, 'storeSlug': 'example', 'title': '10% off', 'description': '10% off eligible items',
                      'code': 'SAVE10', 'discountText': '10% off', 'type': 'code', 'expiresAt': '2026-09-10',
                      'ctaUrl': 'https://merchant.example/offer', 'location': 'India', 'verified': True}
        self.evidence = Path(self.directory.name) / 'checkout-evidence.json'
        # Synthetic evidence is confined to this temporary test database.
        self.evidence.write_text(json.dumps({'fixture': True, 'before': '100', 'after': '90'}))
        self.review = {'status': 'checkout_passed', 'reviewer': 'test operator', 'summary': 'Fixture checkout result',
                       'checkedAt': '2026-09-07T12:00:00Z', 'country': 'India', 'conditions': 'Eligible fixture item; same delivery settings.',
                       'attested': True, 'cart': {'before': '100', 'after': '90', 'currency': 'INR', 'items': 'Fixture item',
                                                  'appliedCode': 'SAVE10', 'sameCart': True}}

    def status(self, offer=None, now=None):
        return annotate_offers([offer or self.offer], now=now or self.now, store=self.store)[0]

    def record(self, review=None, offer=None):
        return self.store.record(offer or self.offer, review or self.review, self.evidence, now=self.now)

    def test_feed_flag_and_automatic_checks_cannot_grant_checkout_badge(self):
        result = self.status()
        self.assertFalse(result['verified'])
        self.assertEqual(result['verification']['status'], 'unverified')
        self.assertTrue(all(check['status'] == 'pass' for check in result['verification']['listingChecks']))
        self.assertFalse(self.store.database.exists(), 'Public reads must not create a database')
        self.assertTrue(self.offer['verified'], 'Do not mutate source data')

    def test_missing_code_bad_link_conflict_and_expiry_are_identified(self):
        for changes in [{'code': ''}, {'ctaUrl': 'javascript:alert(1)'}, {'ctaUrl': 'https://user:secret@example.com'},
                        {'description': '50% off'}, {'expiresAt': '2026-09-06'}, {'expiresAt': 'nonsense'}]:
            with self.subTest(changes=changes):
                result = self.status(dict(self.offer, **changes))
                self.assertFalse(result['verified'])
                self.assertEqual(result['verification']['status'], 'review_needed')

    def test_unknown_expiry_is_disclosed_and_never_invented(self):
        result = self.status(dict(self.offer, expiresAt=''))
        expiry = next(check for check in result['verification']['listingChecks'] if check['name'] == 'expiry')
        self.assertEqual(expiry['status'], 'unknown')
        self.assertFalse(result['verified'])

    def test_code_mentioned_in_a_sale_title_must_match_the_code_field(self):
        for fields in [{'type': 'deal', 'code': '', 'title': 'Use code SAVE10 at checkout.'},
                       {'code': 'OTHER', 'title': 'Save with code SAVE10.'}]:
            with self.subTest(fields=fields):
                result = self.status(dict(self.offer, **fields))
                self.assertEqual(result['verification']['status'], 'review_needed')
        result = self.status(dict(self.offer, title='Use code SAVE10 at checkout.'))
        self.assertNotEqual(result['verification']['status'], 'review_needed')

    def test_reviewed_checkout_evidence_grants_scoped_time_limited_status(self):
        self.record()
        result = self.status()
        self.assertTrue(result['verified'])
        proof = result['verification']
        self.assertEqual(proof['country'], 'India')
        self.assertEqual(proof['validUntil'], '2026-09-08T12:00:00Z')
        self.assertEqual(proof['conditions'], self.review['conditions'])
        raw = json.dumps(proof)
        for private in ['test operator', 'evidenceSha256', 'Fixture checkout result', 'reviews.sqlite3', 'before', 'after']:
            self.assertNotIn(private, raw)

    def test_record_requires_evidence_attestation_and_real_cart_reduction(self):
        cases = [dict(self.review, attested=False), dict(self.review, cart=dict(self.review['cart'], before='90')),
                 dict(self.review, cart=dict(self.review['cart'], appliedCode='OTHER')),
                 dict(self.review, cart=dict(self.review['cart'], sameCart=False)),
                 dict(self.review, cart=dict(self.review['cart'], after='NaN')),
                 dict(self.review, checkedAt='2026-09-09T00:00:00Z'), dict(self.review, country='')]
        for review in cases:
            with self.subTest(review=review):
                with self.assertRaises(ValueError): self.record(review)
        with self.assertRaises(ValueError): self.store.record(self.offer, self.review, now=self.now)
        self.assertFalse(self.status()['verified'])

    def test_sale_cannot_be_passed_off_as_a_tested_coupon_code(self):
        with self.assertRaises(ValueError): self.record(offer=dict(self.offer, type='deal', code=''))

    def test_merchant_confirmation_is_distinct_from_checkout_success(self):
        self.record(dict(self.review, status='merchant_confirmed', cart=None))
        result = self.status()
        self.assertEqual(result['verification']['status'], 'merchant_confirmed')
        self.assertFalse(result['verified'])
        self.assertEqual(result['verification']['validUntil'], '2026-09-11T00:00:00Z')

    def test_any_meaningful_offer_change_requires_a_new_test(self):
        self.record()
        changes = [{'code': 'NEW'}, {'description': 'Different terms'}, {'location': 'Australia'},
                   {'expiresAt': '2026-09-11'}, {'ctaUrl': 'https://merchant.example/different'}, {'title': 'Different offer'}]
        for change in changes:
            with self.subTest(change=change):
                result = self.status(dict(self.offer, **change))
                self.assertFalse(result['verified'])
                self.assertEqual(result['verification']['status'], 'offer_changed')

    def test_banner_size_and_whitespace_do_not_change_offer_identity(self):
        changed = dict(self.offer, description='10%  off eligible items_728x90')
        self.assertEqual(fingerprint(changed), fingerprint(self.offer))

    def test_no_review_can_carry_over_to_another_offer_or_merchant(self):
        self.record()
        self.assertFalse(self.status(dict(self.offer, id=999))['verified'])
        self.assertFalse(self.status(dict(self.offer, storeSlug='different'))['verified'])

    def test_badge_expires_at_review_deadline_and_inclusive_feed_day_boundary(self):
        self.record()
        self.assertTrue(self.status(now=self.now + timedelta(hours=23, minutes=59))['verified'])
        self.assertEqual(self.status(now=self.now + timedelta(hours=24))['verification']['status'], 'stale')
        expiring = dict(self.offer, id=124, expiresAt='2026-09-07')
        self.record(offer=expiring)
        self.assertEqual(self.status(expiring)['verification']['validUntil'], '2026-09-08T00:00:00Z')
        self.assertFalse(self.status(expiring, self.now + timedelta(hours=12))['verified'])

    def test_failure_and_revocation_override_previous_success_without_erasing_history(self):
        self.record()
        self.record(dict(self.review, status='checkout_failed', summary='Code rejected on retest'))
        self.assertEqual(self.status()['verification']['status'], 'checkout_failed')
        self.record()
        self.store.record(self.offer, {'status': 'revoked', 'reviewer': 'test operator', 'summary': 'Offer withdrawn',
                                      'checkedAt': self.review['checkedAt']}, now=self.now)
        self.assertFalse(self.status()['verified'])
        self.assertEqual(self.status()['verification']['status'], 'revoked')
        with sqlite3.connect(self.store.database) as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM reviews').fetchone()[0], 4)

    def test_missing_or_modified_evidence_withholds_badge(self):
        self.record()
        artifact = next((self.store.database.parent / 'evidence').iterdir())
        artifact.write_bytes(b'changed proof')
        self.assertFalse(self.status()['verified'])
        artifact.unlink()
        self.assertFalse(self.status()['verified'])

    def test_old_failure_does_not_describe_a_changed_code_or_remain_current_forever(self):
        self.record(dict(self.review, status='checkout_failed'))
        self.assertEqual(self.status(dict(self.offer, code='NEW'))['verification']['status'], 'offer_changed')
        self.assertEqual(self.status(now=self.now + timedelta(hours=25))['verification']['status'], 'stale')

    def test_corrupt_or_busy_database_never_breaks_offer_browsing(self):
        self.store.database.write_text('not sqlite')
        self.assertFalse(self.status()['verified'])
        with patch.object(self.store, 'latest', side_effect=sqlite3.OperationalError('busy')):
            self.assertEqual(self.status()['title'], self.offer['title'])

    def test_private_evidence_has_restrictive_permissions_on_linux(self):
        import os
        self.record()
        if os.name != 'nt':
            self.assertEqual(self.store.database.stat().st_mode & 0o777, 0o600)
            artifact = next((self.store.database.parent / 'evidence').iterdir())
            self.assertEqual(artifact.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__': unittest.main()

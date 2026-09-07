#!/usr/bin/env python3
"""Operator-only verification workflow. Run over SSH; no public write endpoint.

check: build a review queue from current offers without opening tracking links.
candidate: snapshot one offer for a checkout test.
record: attach a reviewed result to that exact snapshot, after checking it is current.
revoke: immediately withdraw an earlier result on subsequent API reads.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlencode, urlsplit, quote
from urllib.request import Request, urlopen

from offer_verification import VerificationStore, fingerprint, listing_checks, timestamp


def api_get(base, path):
    parsed = urlsplit(base)
    if parsed.hostname not in ('127.0.0.1', 'localhost', 'couponleo.com', 'www.couponleo.com') or parsed.scheme not in ('http', 'https'):
        raise ValueError('Use the local CouponLeo API or its public HTTPS hostname.')
    if parsed.hostname not in ('127.0.0.1', 'localhost') and parsed.scheme != 'https':
        raise ValueError('Public API requests must use HTTPS.')
    request = Request(base.rstrip('/') + path, headers={'Accept': 'application/json', 'Host': 'couponleo.com', 'User-Agent': 'CouponLeo-Offer-Review/1.0'})
    with urlopen(request, timeout=25) as response:
        return json.load(response)


def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + '.next')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    if os.name != 'nt': temporary.chmod(0o600)
    os.replace(temporary, path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', default='http://127.0.0.1:9600/couponleo/api')
    parser.add_argument('--database', default=None)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('init', help='Create the private evidence database.')
    check = sub.add_parser('check', help='Run automatic listing checks and save a review queue.')
    check.add_argument('--store', default='')
    check.add_argument('--limit', type=int, default=50)
    check.add_argument('--page', type=int, default=1)
    check.add_argument('--output', required=True)
    candidate = sub.add_parser('candidate', help='Capture the current offer before testing it.')
    candidate.add_argument('--id', required=True)
    candidate.add_argument('--output', required=True)
    record = sub.add_parser('record', help='Record a real test after reviewing its evidence.')
    record.add_argument('--candidate', required=True)
    record.add_argument('--review', required=True)
    record.add_argument('--evidence')
    revoke = sub.add_parser('revoke', help='Withdraw an earlier result.')
    revoke.add_argument('--id', required=True)
    revoke.add_argument('--reviewer', required=True)
    revoke.add_argument('--reason', required=True)
    args = parser.parse_args(argv)
    store = VerificationStore(args.database)
    if args.command == 'init':
        store.initialize()
        print(json.dumps({'initialized': True, 'database': str(store.database)}))
    elif args.command == 'check':
        if not 1 <= args.limit <= 250 or args.page < 1:
            raise ValueError('Use a limit of 1–250 and a positive page number.')
        query = urlencode({'store': args.store, 'limit': args.limit, 'page': args.page, 'active': 'true'})
        response = api_get(args.api, '/coupons?' + query)
        items = response.get('items', [])
        queue = []
        for item in items:
            checks = listing_checks(item)
            queue.append({'id': item['id'], 'store': item.get('storeSlug'), 'title': item.get('title'),
                          'fingerprint': fingerprint(item), 'checks': checks,
                          'currentStatus': item.get('verification', {}).get('status', 'unverified'),
                          'checkoutTestedByThisRun': False})
        summary = dict(Counter(check['status'] for item in queue for check in item['checks']))
        report = {'checkedAt': timestamp(datetime.now(timezone.utc)), 'scope': {'store': args.store, 'page': args.page},
                  'offersChecked': len(queue), 'checks': summary, 'merchantRequests': 0,
                  'checkoutTests': 0, 'items': queue}
        save_json(args.output, report)
        print(json.dumps({key: value for key, value in report.items() if key != 'items'}))
    elif args.command == 'candidate':
        offer = api_get(args.api, '/coupons/' + quote(str(args.id), safe=''))['data']
        snapshot = {'capturedAt': timestamp(datetime.now(timezone.utc)), 'offerFingerprint': fingerprint(offer), 'offer': offer}
        save_json(args.output, snapshot)
        print(json.dumps({'id': offer['id'], 'store': offer['storeSlug'], 'fingerprint': snapshot['offerFingerprint'], 'saved': args.output}))
    elif args.command == 'record':
        candidate = json.loads(Path(args.candidate).read_text(encoding='utf-8'))
        review = json.loads(Path(args.review).read_text(encoding='utf-8'))
        offer = api_get(args.api, '/coupons/' + quote(str(candidate['offer']['id']), safe=''))['data']
        if fingerprint(offer) != candidate['offerFingerprint'] or fingerprint(candidate['offer']) != candidate['offerFingerprint']:
            raise ValueError('The offer or candidate changed. Capture it again and run a new test.')
        if review.get('offerFingerprint') != candidate['offerFingerprint']:
            raise ValueError('The review must identify the exact candidate offerFingerprint.')
        print(json.dumps(store.record(offer, review, args.evidence)))
    elif args.command == 'revoke':
        offer = api_get(args.api, '/coupons/' + quote(str(args.id), safe=''))['data']
        print(json.dumps(store.record(offer, {'status': 'revoked', 'reviewer': args.reviewer,
             'summary': args.reason, 'checkedAt': timestamp(datetime.now(timezone.utc))})))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError) as error:
        print('Verification was not changed: ' + str(error), file=sys.stderr)
        raise SystemExit(1)

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from flask import Flask
from offer_verification import fingerprint
from routes.coupons import coupons_bp
from verify_offers import main


class VerificationRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = str(Path(self.temp.name) / 'reviews.sqlite3')
        self.offer = {'id': 1, 'storeId': 2, 'storeSlug': 'shop', 'title': 'Save 10%', 'description': 'Save 10%',
                      'discountText': '10%', 'code': 'SAVE', 'type': 'code', 'expiresAt': '2099-01-01',
                      'ctaUrl': 'https://merchant.example', 'verified': True}
        self.env = patch.dict('os.environ', {'COUPONLEO_VERIFICATION_DB': self.db})
        self.env.start(); self.addCleanup(self.env.stop)
        self.repository = patch('routes.coupons.repository')
        self.repo = self.repository.start(); self.addCleanup(self.repository.stop)
        self.repo.get_coupon_live.return_value = self.offer
        self.repo.list_coupons_live.return_value = ([self.offer], 1)
        app = Flask(__name__)
        app.register_blueprint(coupons_bp, url_prefix='/coupons')
        self.client = app.test_client()

    def test_detail_and_list_share_evidence_rules_and_do_not_trust_feed_flag(self):
        listing = self.client.get('/coupons').get_json()['items'][0]
        detail = self.client.get('/coupons/1').get_json()['data']
        self.assertFalse(listing['verified'])
        self.assertFalse(detail['verified'])
        self.assertEqual(listing['verification']['offerFingerprint'], detail['verification']['offerFingerprint'])

    def test_verification_endpoint_is_read_only_and_uncacheable(self):
        response = self.client.get('/coupons/1/verification')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(response.get_json()['data']['status'], 'unverified')
        self.assertEqual(self.client.post('/coupons/1/verification', json={'status': 'checkout_passed'}).status_code, 405)
        self.assertFalse(Path(self.db).exists())

    def test_missing_coupon_returns_404(self):
        self.repo.get_coupon_live.return_value = None
        self.assertEqual(self.client.get('/coupons/missing/verification').status_code, 404)

    def test_cli_refuses_review_when_candidate_changed_since_capture(self):
        candidate = Path(self.temp.name) / 'candidate.json'
        review = Path(self.temp.name) / 'review.json'
        candidate.write_text(json.dumps({'offer': self.offer, 'offerFingerprint': fingerprint(self.offer)}))
        review.write_text('{}')
        with patch('verify_offers.api_get', return_value={'data': dict(self.offer, code='CHANGED')}):
            with self.assertRaisesRegex(ValueError, 'changed'):
                main(['--database', self.db, 'record', '--candidate', str(candidate), '--review', str(review)])
        self.assertFalse(Path(self.db).exists())

    def test_queue_runs_listing_checks_without_writing_verification_records(self):
        output = Path(self.temp.name) / 'queue.json'
        with patch('verify_offers.api_get', return_value={'items': [self.offer]}):
            main(['--database', self.db, 'check', '--store', 'shop', '--output', str(output)])
        report = json.loads(output.read_text())
        self.assertEqual(report['offersChecked'], 1)
        self.assertEqual(report['merchantRequests'], 0)
        self.assertEqual(report['checkoutTests'], 0)
        self.assertFalse(Path(self.db).exists())


if __name__ == '__main__': unittest.main()

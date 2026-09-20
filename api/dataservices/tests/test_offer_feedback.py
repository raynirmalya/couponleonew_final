from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from flask import Flask

from data.offer_feedback_store import OfferFeedbackStore
from routes.coupons import coupons_bp


class OfferFeedbackTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.database = Path(temp.name) / 'feedback.sqlite3'
        store_patch = patch('routes.coupons.feedback_store', OfferFeedbackStore(self.database))
        store_patch.start()
        self.addCleanup(store_patch.stop)
        repository_patch = patch('routes.coupons.repository')
        self.repository = repository_patch.start()
        self.addCleanup(repository_patch.stop)
        self.repository.get_coupon_live.return_value = {
            'id': 7, 'storeSlug': 'shop', 'title': '10% off', 'code': 'SAVE10',
            'type': 'code', 'expiresAt': '2099-01-01', 'ctaUrl': 'https://shop.example',
        }
        app = Flask(__name__)
        app.register_blueprint(coupons_bp, url_prefix='/coupons')
        self.client = app.test_client()

    def test_report_is_private_signal_and_duplicate_is_not_counted_twice(self):
        first = self.client.post('/coupons/7/feedback', json={'outcome': 'did_not_work'})
        again = self.client.post('/coupons/7/feedback', json={'outcome': 'worked'})
        self.assertEqual((first.status_code, again.status_code), (202, 202))
        self.assertTrue(first.get_json()['data']['recorded'])
        self.assertFalse(again.get_json()['data']['recorded'])
        self.assertEqual(first.headers['Cache-Control'], 'no-store')
        with sqlite3.connect(self.database) as connection:
            rows = connection.execute('SELECT outcome, reporter_hash FROM reports').fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], 'did_not_work')
        self.assertNotIn('127.0.0.1', rows[0][1])
        self.assertEqual(self.client.get('/coupons/7/verification').get_json()['data']['status'], 'unverified')

    def test_invalid_or_missing_offer_is_rejected(self):
        self.assertEqual(self.client.post('/coupons/7/feedback', json={'outcome': 'verified'}).status_code, 400)
        self.repository.get_coupon_live.return_value = None
        self.assertEqual(self.client.post('/coupons/7/feedback', json={'outcome': 'worked'}).status_code, 404)


if __name__ == '__main__':
    unittest.main()

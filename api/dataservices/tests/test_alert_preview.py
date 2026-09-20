from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from flask import Flask

from data.newsletter_store import NewsletterSubscriptionStore
from routes.newsletter import newsletter_bp


class AlertPreviewTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.file = Path(temp.name) / 'newsletter.json'
        store_patch = patch('routes.newsletter.newsletter_store', NewsletterSubscriptionStore(str(self.file)))
        store_patch.start()
        self.addCleanup(store_patch.stop)
        repository_patch = patch('routes.newsletter.repository')
        self.repository = repository_patch.start()
        self.addCleanup(repository_patch.stop)
        self.repository.list_coupons_live.return_value = ([{
            'title': 'Save 10% today', 'storeName': 'Shop', 'storeSlug': 'shop',
            'discountText': '10%', 'location': 'India', 'score': 70,
        }], 1)
        self.repository.get_featured_coupons.return_value = []
        app = Flask(__name__)
        app.register_blueprint(newsletter_bp, url_prefix='/newsletter')
        self.client = app.test_client()

    def test_saved_store_produces_in_app_match_without_subscribing(self):
        response = self.client.post('/newsletter/preview', json={
            'country': 'India', 'locale': 'en-US',
            'wishlist': [{'kind': 'store', 'route': '/stores/shop', 'title': 'Shop'}],
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        preview = response.get_json()['data']
        self.assertEqual(preview['deliveryMode'], 'preview_only')
        self.assertEqual(preview['items'][0]['route'], '/stores/shop')
        self.assertTrue(any('wishlist store Shop' in reason for reason in preview['items'][0]['reasons']))
        self.assertFalse(self.file.exists())

    def test_unbounded_wishlist_is_rejected(self):
        response = self.client.post('/newsletter/preview', json={'wishlist': [{}] * 13})
        self.assertEqual(response.status_code, 400)


if __name__ == '__main__':
    unittest.main()

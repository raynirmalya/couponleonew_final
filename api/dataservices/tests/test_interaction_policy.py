import unittest
from unittest.mock import patch

from config import Config
from couponleo import couponleoapi


class InteractionPolicyTests(unittest.TestCase):
    def test_shop_interactions_work_with_catalog_mutations_disabled(self):
        client = couponleoapi.test_client()
        headers = {'Origin': 'https://couponleo.com'}
        with (
            patch.object(Config, 'ENABLE_MUTATIONS', False),
            patch('couponleo._origin_allowed', return_value=True),
            patch('couponleo._host_allowed', return_value=True),
        ):
            preview = client.post(
                f'{Config.API_PREFIX}/newsletter/preview',
                json={'items': []}, headers=headers,
            )
            feedback = client.post(
                f'{Config.API_PREFIX}/coupons/missing/feedback',
                json={'outcome': 'worked'}, headers=headers,
            )
            catalog_write = client.post(
                f'{Config.API_PREFIX}/coupons', json={}, headers=headers,
            )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(feedback.status_code, 404)
        self.assertEqual(catalog_write.status_code, 405)


if __name__ == '__main__':
    unittest.main()

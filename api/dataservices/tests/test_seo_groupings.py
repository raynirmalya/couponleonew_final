import unittest
from unittest.mock import patch

from routes import seo_groupings


class SeoGroupingTests(unittest.TestCase):
    def test_groups_require_real_active_offers_from_several_stores(self):
        coupons = [
            {
                "slug": f"offer-{index}",
                "location": "India",
                "categorySlug": "fashion",
                "storeSlug": f"store-{index % 3}",
                "score": index,
                "expiresAt": "2099-01-01",
            }
            for index in range(12)
        ]
        coupons += [
            {"location": "India", "categorySlug": "fashion", "storeSlug": "expired", "expiresAt": "2000-01-01"},
            {"location": "Global", "categorySlug": "fashion", "storeSlug": "global", "expiresAt": "2099-01-01"},
        ]
        data = {
            "locations": [{"name": "India", "code": "IN"}, {"name": "Global", "code": "GLOBAL"}],
            "categories": [{"name": "Fashion", "slug": "fashion"}],
            "coupons": coupons,
        }
        with patch.object(seo_groupings.repository, "items_view", side_effect=lambda key: tuple(data[key])):
            public, highlights = seo_groupings._build_index()

        self.assertEqual(public["countries"][0]["couponCount"], 12)
        self.assertEqual(public["countries"][0]["storeCount"], 3)
        self.assertEqual(public["groups"][0]["categorySlug"], "fashion")
        self.assertEqual(len(highlights[("india", "fashion")]["items"]), 3)
        self.assertEqual({item["slug"] for item in highlights[("india", "fashion")]["items"]},
                         {"offer-9", "offer-10", "offer-11"})


if __name__ == "__main__":
    unittest.main()

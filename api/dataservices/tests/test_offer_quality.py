import unittest
from datetime import datetime, timezone
from offer_quality import prepare_offers

class OfferQualityTests(unittest.TestCase):
    def test_keeps_unknown_expiry_but_does_not_claim_verification(self):
        original = {"title": "Save on laptops", "verified": True}
        self.assertFalse(prepare_offers([original])[0]["verified"])
        self.assertTrue(original["verified"])
    def test_removes_expired_and_conflicting_offers(self):
        now = datetime(2026,9,6,tzinfo=timezone.utc)
        self.assertEqual(prepare_offers([
            {"title":"10% off", "description":"26% off"},
            {"title":"Expired", "expiresAt":"2026-09-05"}], now), [])
    def test_preserves_tiered_discounts_and_expiry_day(self):
        row={"title":"10% off", "description":"10% off or 15% off orders over 100", "expiresAt":"2026-09-06"}
        self.assertEqual(len(prepare_offers([row],datetime(2026,9,6,23,tzinfo=timezone.utc))),1)
    def test_deduplicates_repeated_feed_rows_but_preserves_markets(self):
        row={"title":"Dress offer", "code":"SAVE", "storeSlug":"store", "location":"India"}
        self.assertEqual(len(prepare_offers([row,dict(row,id=2,discountText="Hot Offer"),dict(row,location="Australia")])),2)

    def test_collapses_banner_variants_of_the_same_offer(self):
        a={"title":"Weekend sale", "description":"Weekend sale", "storeSlug":"shop", "code":""}
        b=dict(a,description="Weekend sale_728x90")
        self.assertEqual(len(prepare_offers([a,b])),1)

if __name__ == '__main__': unittest.main()

import unittest
from unittest.mock import Mock
from data.repository import CouponLeoRepository

class DirectStoreTests(unittest.TestCase):
    def test_unknown_store_uses_bounded_lookup_without_loading_catalog(self):
        repo = CouponLeoRepository(None)
        repo._direct_catalog_mode = Mock(return_value=True)
        repo._fallback_precomputed_store_item = Mock(return_value=None)
        repo._store_row_by_identifier = Mock(return_value=None)
        repo._load_data = Mock(side_effect=AssertionError("Unexpected full catalog load"))
        self.assertIsNone(repo.get_store_live("missing-store"))
        repo._store_row_by_identifier.assert_called_once_with("missing-store")
        repo._load_data.assert_not_called()

    def test_precomputed_store_preserves_fast_existing_store_lookup(self):
        repo = CouponLeoRepository(None)
        item = {"slug": "known-store", "name": "Known"}
        repo._direct_catalog_mode = Mock(return_value=True)
        repo._fallback_precomputed_store_item = Mock(return_value=item)
        repo._store_row_by_identifier = Mock(side_effect=AssertionError("Unnecessary query"))
        self.assertEqual(repo.get_store_live("known-store"), item)
        repo._store_row_by_identifier.assert_not_called()

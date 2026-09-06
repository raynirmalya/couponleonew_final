from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from config import Config
from data.repository import CouponLeoRepository, _clean_text, _write_json_atomically


SUMMARY_DIR = Path(__file__).resolve().parent / "data"


def main() -> None:
    repository = CouponLeoRepository(Config.DATA_FILE or Config.DATA_SNAPSHOT_FILE)
    analytics = {
        "totalCoupons": 0,
        "totalStores": 0,
        "featuredCoupons": 0,
        "liveMarkets": 0,
        "dataSource": "mysql-direct",
        "refreshedAt": datetime.now(UTC).isoformat(),
    }

    connection = repository._connect_mysql()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(1) AS total
                FROM coupons
                WHERE TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')
                  AND (end_date IS NULL OR end_date >= CURDATE())
                """
            )
            analytics["totalCoupons"] = int((cursor.fetchone() or {}).get("total") or 0)

            cursor.execute(
                """
                SELECT COUNT(1) AS total
                FROM (
                    SELECT store
                    FROM coupons
                    WHERE TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')
                      AND (end_date IS NULL OR end_date >= CURDATE())
                    GROUP BY store
                ) grouped
                """
            )
            analytics["totalStores"] = int((cursor.fetchone() or {}).get("total") or 0)

            cursor.execute(
                """
                SELECT COUNT(1) AS total
                FROM coupons
                WHERE TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')
                  AND (end_date IS NULL OR end_date >= CURDATE())
                  AND LOWER(COALESCE(featured, '')) = 'yes'
                """
            )
            analytics["featuredCoupons"] = int((cursor.fetchone() or {}).get("total") or 0)

            cursor.execute("SELECT COUNT(1) AS total FROM locations")
            analytics["liveMarkets"] = int((cursor.fetchone() or {}).get("total") or 0)

            cursor.execute(
                """
                SELECT
                    id,
                    offer_id,
                    title,
                    description,
                    label,
                    code,
                    featured,
                    source,
                    deeplink,
                    affiliate_link,
                    cashback_link,
                    url,
                    image_url,
                    brand_logo,
                    type,
                    store,
                    merchant_home_page,
                    categories,
                    start_date,
                    end_date,
                    status,
                    primary_location,
                    language,
                    rating,
                    standard_categories,
                    locations,
                    token,
                    store_id
                FROM coupons
                WHERE TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')
                  AND (end_date IS NULL OR end_date >= CURDATE())
                  AND LOWER(COALESCE(featured, '')) = 'yes'
                ORDER BY rating DESC, id DESC
                """
            )
            raw_coupons = cursor.fetchall()

            store_names = sorted(
                {
                    _clean_text(row.get("store"))
                    for row in raw_coupons
                    if _clean_text(row.get("store"))
                }
            )
            raw_store_rows = repository._load_store_rows(cursor, store_names)
            location_lookup = repository._load_location_lookup(cursor)
    finally:
        connection.close()

    store_rows_by_name: dict[str, list[dict]] = defaultdict(list)
    for store_row in raw_store_rows:
        store_rows_by_name[_clean_text(store_row.get("name")).lower()].append(store_row)

    featured_coupons: list[dict] = []
    for raw_coupon in raw_coupons:
        store_name = _clean_text(raw_coupon.get("store")) or "Unknown store"
        store_row = repository._select_store_row(store_rows_by_name.get(store_name.lower(), []))
        effective_store_row = store_row or repository._minimal_store_row(store_name, raw_coupon)
        store_payload = repository._build_store_record(store_name, effective_store_row, [raw_coupon], location_lookup)
        coupon_payload = repository._build_coupon_record(raw_coupon, store_payload, location_lookup)
        if coupon_payload is not None:
            featured_coupons.append(coupon_payload)

    _write_json_atomically(SUMMARY_DIR / "featured-coupons-summary.json", featured_coupons)
    _write_json_atomically(SUMMARY_DIR / "analytics-summary.json", analytics)

    print(
        json.dumps(
            {
                "generatedAt": datetime.now(UTC).isoformat(),
                "summaryDirectory": str(SUMMARY_DIR),
                "analytics": analytics,
                "featuredCoupons": len(featured_coupons),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

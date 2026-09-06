from __future__ import annotations

import json
import math
import os
import re
import time
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path
from threading import Lock, Thread
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from config import Config
from data.seed import DEFAULT_DATASET

try:
    import pymysql
    from pymysql.cursors import DictCursor, SSDictCursor
except ImportError:  # pragma: no cover - safe fallback for environments without MySQL support
    pymysql = None
    DictCursor = None
    SSDictCursor = None


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return cleaned or "item"


def _normalize_host(value: str) -> str:
    raw_value = str(value or "").strip().lower()

    if not raw_value:
        return ""

    parsed = urlparse(raw_value if "://" in raw_value else f"https://{raw_value}")
    host = (parsed.netloc or parsed.path.split("/")[0]).strip().lower()
    host = host.rsplit("@", 1)[-1].split(":", 1)[0].strip(".")

    while True:
        for prefix in ("www.", "m.", "mobile.", "shop.", "store."):
            if host.startswith(prefix) and len(host) > len(prefix):
                host = host[len(prefix):]
                break
        else:
            break

    return host


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _lower_text(value: Any) -> str:
    return _clean_text(value).lower()


def _pick_numeric(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _ensure_iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return _clean_text(value)


def _sanitize_http_url(value: Any) -> str:
    raw_value = _clean_text(value)

    if not raw_value:
        return ""

    if raw_value.startswith("http://"):
        raw_value = f"https://{raw_value[len('http://'):]}"

    parsed = urlparse(raw_value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""

    return raw_value


def _normalize_logo_url(value: Any, size: str) -> str:
    raw_value = _clean_text(value)

    if not raw_value:
        return ""

    normalized = raw_value.replace("[size]", size).replace("[format]", "png")
    parsed = urlparse(normalized)

    if parsed.scheme in {"http", "https"} and parsed.netloc:
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        updated = False

        if "size" in query:
            query["size"] = size
            updated = True

        if "format" in query:
            query["format"] = "png"
            updated = True

        if updated:
            normalized = urlunparse(parsed._replace(query=urlencode(query)))

    return _sanitize_http_url(normalized)


def _is_blocked_logo_url(value: Any) -> bool:
    host = _normalize_host(value)
    return bool(host) and host.endswith(".r2.dev")


def _pick_logo_url(*candidates: Any) -> str:
    for candidate in candidates:
        normalized = _sanitize_http_url(candidate)
        if normalized and not _is_blocked_logo_url(normalized):
            return normalized

    return ""


def _split_csv_values(value: Any) -> List[str]:
    raw_value = _clean_text(value)
    if not raw_value:
        return []
    return [part.strip() for part in raw_value.split(",") if part.strip()]


def _title_case_words(value: str) -> str:
    words = re.split(r"[\s_/-]+", value)
    return " ".join(word.capitalize() for word in words if word)


def _unique_texts(values: List[str]) -> List[str]:
    seen: set[str] = set()
    results: List[str] = []

    for value in values:
        cleaned = re.sub(r"\s+", " ", _clean_text(value)).strip()
        if not cleaned:
            continue

        key = cleaned.lower()
        if key in seen:
            continue

        seen.add(key)
        results.append(cleaned)

    return results


def _join_readable_list(values: List[str]) -> str:
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def _first_nonempty_text(*values: Any) -> str:
    for value in values:
        cleaned = _clean_text(value)
        if cleaned:
            return cleaned
    return ""


def _count_phrase(value: Any, singular: str, plural: str) -> str:
    normalized_value = max(0, int(_pick_numeric(value)))
    label = singular if normalized_value == 1 else plural
    return f"{normalized_value} {label}"


def _category_copy(category_name: Any) -> str:
    normalized_category = _clean_text(category_name)
    if not normalized_category or normalized_category.lower() == "other":
        return "shopping"
    return normalized_category.lower()


def _market_copy(location_name: Any) -> str:
    normalized_location = _clean_text(location_name) or "Global"
    if normalized_location.lower() == "global":
        return "across global markets"
    return f"in {normalized_location}"


def _stable_variant(seed: str, options: Sequence[str]) -> str:
    if not options:
        return ""

    normalized_seed = _clean_text(seed).lower() or "couponleo"
    hash_value = 0

    for character in normalized_seed:
        hash_value = ((hash_value * 33) + ord(character)) & 0xFFFFFFFF

    return options[hash_value % len(options)]


def _topic_ideas_for_category(value: Any) -> str:
    normalized = _clean_text(value).lower()

    if not normalized or normalized == "other":
        return "the strongest prices, useful coupon codes, and broad shopping deals"

    heuristics: Sequence[tuple[re.Pattern[str], str]] = (
        (re.compile(r"pet|animal"), "food, treats, care essentials, and everyday pet supplies"),
        (re.compile(r"kitchen|cook|dining"), "cookware, prep tools, storage, and everyday kitchen upgrades"),
        (re.compile(r"camera|photo|video"), "cameras, lenses, accessories, and creator gear"),
        (re.compile(r"computer|laptop|tech|device|software"), "hardware, accessories, upgrades, and digital tools"),
        (re.compile(r"fashion|clothing|footwear|handbag|jewell|beauty|makeup"), "new-season styles, accessories, and personal picks"),
        (re.compile(r"home|furniture|decor|appliance"), "home upgrades, furniture, decor, and practical everyday buys"),
        (re.compile(r"auto|car|motor"), "parts, accessories, maintenance items, and driving essentials"),
        (re.compile(r"toy|game|kids|baby"), "gifts, playtime picks, and family-friendly buys"),
        (re.compile(r"travel|hotel|flight"), "trip planning deals, travel extras, and booking offers"),
        (re.compile(r"health|medical|body|care"), "wellness essentials, personal care items, and routine replenishment"),
        (re.compile(r"gift"), "gift ideas, quick wins, and easy-to-send finds"),
    )

    for pattern, copy in heuristics:
        if pattern.search(normalized):
            return copy

    return f"{normalized} products, brands, and savings styles"


def _store_theme_value(category_name: Any, category_hint: Any) -> str:
    normalized_category = _clean_text(category_name)
    if normalized_category and normalized_category.lower() != "other":
        return normalized_category

    normalized_hint = _clean_text(category_hint)
    if normalized_hint and normalized_hint.lower() not in {"other", "general", "mixed"}:
        return normalized_hint

    return normalized_category


def _store_theme_display(category_name: Any, category_hint: Any) -> str:
    normalized_value = _store_theme_value(category_name, category_hint).lower()
    if not normalized_value:
        return ""

    heuristics: Sequence[tuple[re.Pattern[str], str]] = (
        (re.compile(r"pet|animal"), "Pet Supplies"),
        (re.compile(r"kitchen|cook|dining"), "Kitchen Essentials"),
        (re.compile(r"camera|photo|video"), "Cameras & Creator Gear"),
        (re.compile(r"computer|laptop|tech|device|software|electronic|gadget"), "Electronics"),
        (re.compile(r"fashion|clothing|footwear|handbag|jewell|beauty|makeup"), "Fashion & Beauty"),
        (re.compile(r"home|furniture|decor|appliance"), "Home & Decor"),
        (re.compile(r"auto|car|motor"), "Auto Accessories"),
        (re.compile(r"toy|game|kids|baby"), "Gifts & Family"),
        (re.compile(r"travel|hotel|flight"), "Travel"),
        (re.compile(r"health|medical|body|care"), "Wellness & Care"),
        (re.compile(r"gift"), "Gift Ideas"),
    )

    for pattern, label in heuristics:
        if pattern.search(normalized_value):
            return label

    return _title_case_words(normalized_value)


def _shopping_lane_copy(value: Any) -> str:
    normalized = _clean_text(value).lower()
    if not normalized:
        return "storewide offers"

    heuristics: Sequence[tuple[re.Pattern[str], str]] = (
        (re.compile(r"pet|animal"), "pet supplies"),
        (re.compile(r"kitchen|cook|dining"), "kitchen essentials"),
        (re.compile(r"camera|photo|video"), "camera and creator gear"),
        (re.compile(r"computer|laptop|tech|device|software|electronic|gadget"), "electronics and accessories"),
        (re.compile(r"fashion|clothing|footwear|handbag|jewell|beauty|makeup"), "fashion, beauty, and accessories"),
        (re.compile(r"home|furniture|decor|appliance"), "home and decor"),
        (re.compile(r"auto|car|motor"), "auto accessories and driving essentials"),
        (re.compile(r"toy|game|kids|baby"), "giftable family buys"),
        (re.compile(r"travel|hotel|flight"), "travel bookings and extras"),
        (re.compile(r"health|medical|body|care"), "wellness and personal care"),
        (re.compile(r"gift"), "gift ideas"),
    )

    for pattern, label in heuristics:
        if pattern.search(normalized):
            return label

    return normalized


def _meta_market_audience(location_name: str) -> str:
    return "for global shoppers" if location_name.lower() == "global" else f"for shoppers in {location_name}"


def _store_host_label(store_name: Any, store_url: Any) -> str:
    return _normalize_host(store_url) or _normalize_host(store_name) or _clean_text(store_name) or "couponleo.com"


def _merchant_description(record: Dict[str, Any]) -> str:
    return _first_nonempty_text(
        record.get("websiteDescription"),
        record.get("website_description"),
        record.get("merchantDescription"),
        record.get("merchant_description"),
        record.get("siteDescription"),
        record.get("site_description"),
    )


def _merchant_meta_description(record: Dict[str, Any]) -> str:
    return _first_nonempty_text(
        record.get("websiteMetaDescription"),
        record.get("website_meta_description"),
        record.get("meta_description"),
        record.get("metaDescription"),
        record.get("ogDescription"),
        record.get("og_description"),
    )


def _looks_like_generated_store_copy(value: Any, store_name: str = "") -> bool:
    normalized = _lower_text(value)
    if not normalized:
        return False

    markers = (
        "tracked by couponleo",
        "this route helps shoppers compare",
        "live offers available across",
        "currently has ",
        "listed on couponleo",
        "giving shoppers a quick way to compare active codes",
        "check the latest coupon codes, price drops, and checkout offers in one place",
        "couponleo recognizes ",
        "making it easier to spot coupon codes, price cuts, and limited-time checkout savings before you buy",
        "for shoppers who want to compare discounts before visiting",
        "browse the latest coupon codes, checkout promos, and price-drop offers in one place",
        "use this page to decide whether",
    )

    if any(marker in normalized for marker in markers):
        return True

    normalized_store_name = _clean_text(store_name).lower()
    return bool(normalized_store_name) and normalized.startswith(normalized_store_name) and "couponleo" in normalized


def _looks_like_generated_category_copy(value: Any, category_name: str = "") -> bool:
    normalized = _lower_text(value)
    if not normalized:
        return False

    markers = (
        "shoppers can browse ",
        "in one place, which makes it easier to compare",
        "start here if you want to compare ",
        "couponleo is still tracking",
        "deals are live across ",
        "offers ready for shoppers who want better prices",
        "use this collection to compare ",
    )

    if any(marker in normalized for marker in markers):
        return True

    normalized_category_name = _clean_text(category_name).lower()
    return bool(normalized_category_name) and normalized.startswith(normalized_category_name) and "couponleo" in normalized


def _trim_offer_example(value: Any, limit: int = 92) -> str:
    cleaned = re.sub(r"\s+", " ", _clean_text(value)).strip(" ,.;:-")

    if len(cleaned) < 8:
        return ""

    if len(cleaned) <= limit:
        return cleaned

    shortened = cleaned[: limit - 3].rsplit(" ", 1)[0].strip(" ,.;:-")
    return f"{shortened or cleaned[: limit - 3]}..."


def _collect_offer_examples(raw_coupons: List[Dict[str, Any]], limit: int = 3) -> List[str]:
    examples: List[str] = []
    seen: set[str] = set()

    for raw_coupon in raw_coupons:
        for candidate in (
            raw_coupon.get("description"),
            raw_coupon.get("label"),
            raw_coupon.get("title"),
        ):
            example = _trim_offer_example(candidate)
            if not example:
                continue

            key = example.lower()
            if key in seen:
                continue

            seen.add(key)
            examples.append(example)

            if len(examples) >= limit:
                return examples

    return examples


def _location_name_key(value: Any) -> str:
    return _slugify(_clean_text(value)).upper()


def _write_json_atomically(file_path: Path, payload: Any, *, indent: int | None = None) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = file_path.with_name(f".{file_path.name}.{os.getpid()}.tmp")

    try:
        with temp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=indent)
        temp_path.replace(file_path)
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


class CouponLeoRepository:
    def __init__(self, data_file: str) -> None:
        self._data_file = Path(data_file).expanduser() if data_file else None
        self._snapshot_file = Path(Config.DATA_SNAPSHOT_FILE).expanduser() if Config.DATA_SNAPSHOT_FILE else None
        self._lock = Lock()
        self._refresh_lock = Lock()
        self._data = deepcopy(DEFAULT_DATASET)
        self._data_source = "seed"
        self._refreshed_at = datetime.utcnow().isoformat()
        self._last_refresh_tick = 0.0
        self._refresh_in_progress = False
        self._ranked_items_cache: Dict[str, List[Dict[str, Any]]] = {}
        self._item_lookup_cache: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._search_cache: Dict[tuple, List[Dict[str, Any]]] = {}
        self._store_match_cache: Dict[tuple[str, int], Dict[str, Any]] = {}
        self._featured_coupon_cache: Optional[List[Dict[str, Any]]] = None
        self._analytics_cache: Optional[Dict[str, Any]] = None
        self._direct_query_enabled = os.getenv("COUPONLEO_DIRECT_QUERY_MODE", "true").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        self._prefer_precomputed_summaries = os.getenv(
            "COUPONLEO_PREFER_PRECOMPUTED_SUMMARIES",
            "true",
        ).strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        self._direct_query_cache: Dict[tuple, tuple[float, Any]] = {}
        self._store_schema_ready = False
        self._store_table_column_cache: Optional[set[str]] = None
        self._store_content_table_ready = False

    def ensure_store_schema(self) -> bool:
        if self._store_schema_ready:
            return True

        if not self._db_configured():
            return False

        required_columns = (
            "websiteDescription",
            "websiteMetaDescription",
            "merchantDescription",
            "metaDescription",
        )

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                existing_columns = self._store_table_columns(cursor)

                for column_name in required_columns:
                    if column_name in existing_columns:
                        continue

                    try:
                        cursor.execute(f"ALTER TABLE stores ADD COLUMN {column_name} TEXT NULL")
                        existing_columns.add(column_name)
                    except pymysql.err.OperationalError as error:
                        if error.args and int(error.args[0]) == 1142:
                            self._ensure_store_content_table(cursor)
                            self._store_content_table_ready = True
                            break
                        raise

            connection.commit()
        finally:
            connection.close()

        self._store_table_column_cache = None
        self._store_schema_ready = True
        return True

    def _store_table_columns(self, cursor=None) -> set[str]:
        if self._store_table_column_cache is not None:
            return set(self._store_table_column_cache)

        connection = None
        try:
            if cursor is None:
                connection = self._connect_mysql()
                cursor = connection.cursor()

            cursor.execute("SHOW COLUMNS FROM stores")
            columns = {
                _clean_text(row.get("Field"))
                for row in cursor.fetchall()
                if _clean_text(row.get("Field"))
            }
            self._store_table_column_cache = set(columns)
            return columns
        finally:
            if connection is not None:
                connection.close()

    def _ensure_store_content_table(self, cursor) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS store_content_overrides (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                store_name VARCHAR(255) NOT NULL,
                store_slug VARCHAR(255) NOT NULL,
                websiteDescription TEXT NULL,
                websiteMetaDescription TEXT NULL,
                merchantDescription TEXT NULL,
                metaDescription TEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_store_content_overrides_slug (store_slug),
                KEY idx_store_content_overrides_name (store_name)
            )
            """
        )

    def _store_select_fields(self, cursor=None) -> str:
        columns = self._store_table_columns(cursor)
        base_fields = [
            "id",
            "name",
            "primary_location",
            "important_location",
            "url",
        ]
        optional_fields = [
            "websiteDescription",
            "websiteMetaDescription",
            "merchantDescription",
            "metaDescription",
        ]
        trailing_fields = [
            "added_on",
            "locations",
            "logo_horizontal_url",
            "logo_square_url",
            "authority_tier",
            "category_hint",
            "initial_rank_score",
            "ranking_source",
            "rank_seeded_at",
        ]

        select_fields = [*base_fields]
        for field_name in optional_fields:
            if field_name in columns:
                select_fields.append(field_name)
            else:
                select_fields.append(f"NULL AS {field_name}")
        select_fields.extend(trailing_fields)
        return ",\n                        ".join(select_fields)

    def _merge_store_content_overrides(self, cursor, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not rows:
            return rows

        if not self._store_content_table_ready:
            try:
                cursor.execute("SHOW TABLES LIKE 'store_content_overrides'")
                self._store_content_table_ready = cursor.fetchone() is not None
            except Exception:
                self._store_content_table_ready = False

        if not self._store_content_table_ready:
            return rows

        store_names = sorted({_clean_text(row.get("name")) for row in rows if _clean_text(row.get("name"))})
        store_slugs = sorted({_slugify(_clean_text(row.get("name"))) for row in rows if _clean_text(row.get("name"))})
        if not store_names and not store_slugs:
            return rows

        clauses: List[str] = []
        params: List[str] = []

        if store_names:
            placeholders = ", ".join(["%s"] * len(store_names))
            clauses.append(f"store_name IN ({placeholders})")
            params.extend(store_names)

        if store_slugs:
            placeholders = ", ".join(["%s"] * len(store_slugs))
            clauses.append(f"store_slug IN ({placeholders})")
            params.extend(store_slugs)

        cursor.execute(
            f"""
            SELECT
                store_name,
                store_slug,
                websiteDescription,
                websiteMetaDescription,
                merchantDescription,
                metaDescription
            FROM store_content_overrides
            WHERE {' OR '.join(clauses)}
            """,
            params,
        )
        overrides = cursor.fetchall()
        if not overrides:
            return rows

        by_slug = {
            _clean_text(row.get("store_slug")).lower(): row
            for row in overrides
            if _clean_text(row.get("store_slug"))
        }
        by_name = {
            _clean_text(row.get("store_name")).lower(): row
            for row in overrides
            if _clean_text(row.get("store_name"))
        }

        for row in rows:
            store_name = _clean_text(row.get("name"))
            override = by_slug.get(_slugify(store_name).lower()) or by_name.get(store_name.lower())
            if not override:
                continue

            for field_name in (
                "websiteDescription",
                "websiteMetaDescription",
                "merchantDescription",
                "metaDescription",
            ):
                if _clean_text(override.get(field_name)):
                    row[field_name] = override.get(field_name)

        return rows

    def _merge_store_homepage_content(self, cursor, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not rows:
            return rows

        try:
            cursor.execute("SHOW TABLES LIKE 'store_homepage_content'")
            if cursor.fetchone() is None:
                return rows
        except Exception:
            return rows

        store_names = sorted({_clean_text(row.get("name")) for row in rows if _clean_text(row.get("name"))})
        store_slugs = sorted({_slugify(_clean_text(row.get("name"))) for row in rows if _clean_text(row.get("name"))})
        if not store_names and not store_slugs:
            return rows

        clauses: List[str] = []
        params: List[str] = []

        if store_names:
            placeholders = ", ".join(["%s"] * len(store_names))
            clauses.append(f"store_name IN ({placeholders})")
            params.extend(store_names)

        if store_slugs:
            placeholders = ", ".join(["%s"] * len(store_slugs))
            clauses.append(f"store_slug IN ({placeholders})")
            params.extend(store_slugs)

        cursor.execute(
            f"""
            SELECT
                store_name,
                store_slug,
                title,
                heading,
                description
            FROM store_homepage_content
            WHERE is_active = 1
              AND ({' OR '.join(clauses)})
            """,
            params,
        )
        content_rows = cursor.fetchall()
        if not content_rows:
            return rows

        by_slug = {
            _clean_text(row.get("store_slug")).lower(): row
            for row in content_rows
            if _clean_text(row.get("store_slug"))
        }
        by_name = {
            _clean_text(row.get("store_name")).lower(): row
            for row in content_rows
            if _clean_text(row.get("store_name"))
        }

        for row in rows:
            store_name = _clean_text(row.get("name"))
            content_row = by_slug.get(_slugify(store_name).lower()) or by_name.get(store_name.lower())
            if not content_row:
                continue

            actual_description = _clean_text(content_row.get("description"))
            if actual_description:
                row["websiteDescription"] = row.get("websiteDescription") or actual_description
                row["merchantDescription"] = row.get("merchantDescription") or actual_description
                row["websiteMetaDescription"] = row.get("websiteMetaDescription") or actual_description

        return rows

    def _hydrate_store_copy_rows(self, cursor, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = self._merge_store_homepage_content(cursor, rows)
        return self._merge_store_content_overrides(cursor, rows)

    def _hydrate_store_copy_records(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not rows or not self._db_configured():
            return rows

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                return self._hydrate_store_copy_rows(cursor, rows)
        except Exception:
            return rows
        finally:
            connection.close()

    def _fetch_store_rows(
        self,
        cursor,
        where_sql: str,
        params: Sequence[Any],
        *,
        order_by_sql: str = "",
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        select_fields = self._store_select_fields(cursor)
        query = f"""
            SELECT
                {select_fields}
            FROM stores
            WHERE {where_sql}
        """
        if order_by_sql:
            query += f"\n            ORDER BY {order_by_sql}"
        if limit is not None:
            query += "\n            LIMIT %s"
            effective_params: List[Any] = [*params, int(limit)]
        else:
            effective_params = list(params)

        cursor.execute(query, effective_params)
        return self._hydrate_store_copy_rows(cursor, cursor.fetchall())

    def _enrich_store_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        enriched = deepcopy(record)
        store_name = _clean_text(enriched.get("name")) or "Unknown store"
        category_name = _title_case_words(
            _clean_text(enriched.get("category")) or _clean_text(enriched.get("category_hint"))
        ) or "Store"
        theme_value = _store_theme_value(enriched.get("category"), enriched.get("category_hint"))
        theme_label = _store_theme_display(enriched.get("category"), enriched.get("category_hint"))
        theme_copy = _shopping_lane_copy(theme_value)
        location_name = _clean_text(enriched.get("location") or enriched.get("primary_location")) or "Global"
        coupon_count = max(0, int(_pick_numeric(enriched.get("activeCoupons") or enriched.get("couponCount"))))
        savings = _clean_text(enriched.get("savings"))
        store_url = _sanitize_http_url(enriched.get("url")) or "https://couponleo.com"
        website_host = _store_host_label(store_name, store_url)
        market_copy = _market_copy(location_name)
        featured = bool(enriched.get("featured"))
        merchant_description = _merchant_description(enriched)
        merchant_meta_description = _merchant_meta_description(enriched)
        if _looks_like_generated_store_copy(merchant_description, store_name):
            merchant_description = ""
        if _looks_like_generated_store_copy(merchant_meta_description, store_name):
            merchant_meta_description = ""
        offer_examples = _unique_texts(
            [value for value in (enriched.get("offerExamples") or []) if isinstance(value, str)]
        ) if isinstance(enriched.get("offerExamples"), list) else []
        offer_example_text = _join_readable_list(offer_examples[:2])
        headline_theme = theme_copy if theme_label else "store"
        meta_theme = theme_copy if theme_label else "live"
        generated_headline = (
            f"{coupon_count} live {headline_theme} offers currently visible for {location_name} shoppers."
            if coupon_count > 0
            else f"{store_name} is listed on CouponLeo, but there are no live offers showing right now."
        )

        if coupon_count > 0:
            description = _stable_variant(
                f"{store_name}|{location_name}|{theme_label}|{coupon_count}|intro",
                [
                    f"{website_host} becomes far more interesting once you can see whether today's {headline_theme} feel broad enough to justify the visit.",
                    f"When {website_host} is already in the running, the smarter move is to check whether the current {headline_theme} still look convincing after the first flashy offer.",
                    f"{store_name} is easier to trust when the wider savings picture feels solid instead of leaning on a single attention-grabbing promotion.",
                ],
            )
            follow_up = _stable_variant(
                f"{store_name}|{location_name}|{theme_label}|{coupon_count}|follow-up",
                [
                    f"{_count_phrase(coupon_count, 'live offer', 'live offers')} showing {market_copy} make it easier to tell whether the merchant is genuinely active or simply loud.",
                    f"With {_count_phrase(coupon_count, 'live offer', 'live offers')} in play {market_copy}, the better buying signal comes from consistency, not just spectacle.",
                    f"The current mix of {_count_phrase(coupon_count, 'live offer', 'live offers')} {market_copy} gives you enough evidence to judge whether the store still feels competitive today.",
                ],
            )
            if offer_example_text:
                follow_up += f" Recent examples include {offer_example_text}."
            elif savings:
                follow_up += f" Savings highlights currently point to {savings}."
            elif featured:
                follow_up += " It also stands out in the featured merchant mix when you are comparing similar brands."
        else:
            description = _stable_variant(
                f"{store_name}|{location_name}|{theme_label}|quiet-intro",
                [
                    f"{store_name} is still worth keeping in view when you prefer to compare merchants properly, even if the live deal board is quiet today.",
                    f"{website_host} still works as a useful merchant brief while you wait for a stronger savings cycle to return.",
                    f"Even without a live offer showing right now, the store is easier to judge once the brand, market, and shopping context sit in one place.",
                ],
            )
            follow_up = _stable_variant(
                f"{store_name}|{location_name}|{theme_label}|quiet-follow-up",
                [
                    f"The store link, market context, and category cues stay ready so you can come back quickly when a stronger discount wave reaches {website_host}.",
                    f"That makes it easier to revisit the merchant the moment fresh {headline_theme} start appearing again.",
                    f"Use it as a bookmarkable check-in point rather than a final answer while the offer mix is flat.",
                ],
            )

        keyword_highlights = _unique_texts([
            f"{store_name} coupon codes",
            f"{store_name} promo codes",
            f"{store_name} deals",
            f"{theme_label} discounts" if theme_label else f"{location_name} offers",
        ])

        existing_description = _clean_text(enriched.get("description"))
        existing_paragraphs = _unique_texts(
            [value for value in (enriched.get("seoParagraphs") or []) if isinstance(value, str)]
        ) if isinstance(enriched.get("seoParagraphs"), list) else []
        existing_highlights = _unique_texts(
            [value for value in (enriched.get("keywordHighlights") or []) if isinstance(value, str)]
        ) if isinstance(enriched.get("keywordHighlights"), list) else []
        existing_meta_description = _clean_text(enriched.get("metaDescription"))
        meta_fallback = (
            f"Check {store_name} coupon codes and {meta_theme} deals {_meta_market_audience(location_name)}. "
            f"{_count_phrase(coupon_count, 'live offer', 'live offers')} show whether {website_host} still feels worth the click."
            if coupon_count > 0
            else f"Review {store_name} before you visit. Keep the merchant context, market clues, and fresh savings signals in one place while you wait for stronger activity."
        )
        preferred_description = (
            merchant_description
            or (existing_description if existing_description and not _looks_like_generated_store_copy(existing_description, store_name) else "")
            or description
        )
        preferred_meta_description = (
            merchant_meta_description
            or (existing_meta_description if existing_meta_description and not _looks_like_generated_store_copy(existing_meta_description, store_name) else "")
            or meta_fallback
        )
        preferred_paragraphs = (
            existing_paragraphs
            if any(not _looks_like_generated_store_copy(value, store_name) for value in existing_paragraphs)
            else _unique_texts([preferred_description, follow_up])
        )
        preferred_highlights = (
            existing_highlights
            if existing_highlights and not any(
                _lower_text(value) in {"other deals", "global offers", "store deals"}
                for value in existing_highlights
            )
            else keyword_highlights
        )

        existing_headline = _clean_text(enriched.get("headline"))
        if not existing_headline or "refreshed from couponleo" in _lower_text(existing_headline) or "couponleo recognizes" in _lower_text(existing_headline):
            enriched["headline"] = generated_headline

        enriched["category"] = category_name
        enriched["location"] = location_name
        enriched["url"] = store_url
        enriched["websiteHost"] = _clean_text(enriched.get("websiteHost")) or website_host
        enriched["websiteDescription"] = merchant_description
        enriched["description"] = preferred_description
        enriched["metaDescription"] = preferred_meta_description
        enriched["seoParagraphs"] = preferred_paragraphs
        enriched["keywordHighlights"] = preferred_highlights
        enriched["offerExamples"] = offer_examples
        return enriched

    def _enrich_category_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        enriched = deepcopy(record)
        category_name = _title_case_words(_clean_text(enriched.get("name"))) or "Category"
        coupon_count = max(0, int(_pick_numeric(enriched.get("couponCount"))))
        store_count = max(0, int(_pick_numeric(enriched.get("storeCount"))))
        category_copy = _category_copy(category_name)
        category_ideas = _topic_ideas_for_category(category_name)

        if coupon_count > 0 or store_count > 0:
            if category_name.lower() == "other":
                description = _stable_variant(
                    f"{category_name}|{coupon_count}|{store_count}|intro",
                    [
                        "Other is where mixed-basket deals, niche finds, and awkwardly labeled promotions finally stop looking messy and start looking useful.",
                        "Other works best when the strongest offer refuses to fit one tidy shopping lane and you still want the wider field to stay open.",
                        "Other earns its place when discovery matters more than taxonomy and the next worthwhile saving could come from almost anywhere in the directory.",
                    ],
                )
            else:
                description = _stable_variant(
                    f"{category_name}|{coupon_count}|{store_count}|intro",
                    [
                        f"{category_name} becomes far more useful when you want to compare {category_ideas} before one merchant takes over the shortlist.",
                        f"When the product type is clear but the winning store is not, {category_name} gives the wider field room to prove itself.",
                        f"{category_name} works best as a side-by-side read on {category_ideas}, so the stronger offer mix can earn the next click on merit.",
                    ],
                )
            follow_up = _stable_variant(
                f"{category_name}|{coupon_count}|{store_count}|follow-up",
                [
                    f"{_count_phrase(coupon_count, 'live offer', 'live offers')} from {_count_phrase(store_count, 'store', 'stores')} make it easier to see whether this topic is being pushed by one aggressive merchant or by a genuinely active field.",
                    f"Right now, {_count_phrase(coupon_count, 'live offer', 'live offers')} from {_count_phrase(store_count, 'store', 'stores')} help separate real price pressure from decorative promo copy.",
                    f"The current mix of {_count_phrase(coupon_count, 'live offer', 'live offers')} from {_count_phrase(store_count, 'store', 'stores')} gives you enough range to compare brands before deciding where to buy.",
                ],
            )
        else:
            description = f"{category_name} is still part of the CouponLeo directory, even if the live deal mix is quiet right now."
            follow_up = _stable_variant(
                f"{category_name}|quiet",
                [
                    f"The category hub stays ready so shoppers can return as soon as fresh {category_copy} savings start showing real life again.",
                    "Think of it as a bookmarkable category brief while you wait for stronger brand activity to return.",
                    "The page still helps frame the topic, even while the better deals are temporarily happening somewhere else.",
                ],
            )

        keyword_highlights = _unique_texts([
            f"{category_name} coupon codes",
            f"{category_name} deals",
            f"{category_name} discounts",
            f"{_count_phrase(store_count, 'store', 'stores')} in {category_name}",
        ])

        existing_description = _clean_text(enriched.get("description"))
        existing_paragraphs = _unique_texts(
            [value for value in (enriched.get("seoParagraphs") or []) if isinstance(value, str)]
        ) if isinstance(enriched.get("seoParagraphs"), list) else []
        existing_highlights = _unique_texts(
            [value for value in (enriched.get("keywordHighlights") or []) if isinstance(value, str)]
        ) if isinstance(enriched.get("keywordHighlights"), list) else []
        existing_meta_description = _clean_text(enriched.get("metaDescription"))
        meta_fallback = (
            f"Compare today's {category_name} coupon codes, sale offers, and brand discounts in one place. "
            f"{_count_phrase(coupon_count, 'live offer', 'live offers')} across {_count_phrase(store_count, 'store', 'stores')} show where the stronger options are emerging before you choose where to shop."
            if coupon_count > 0 or store_count > 0
            else f"Keep {category_name} on the radar with a topic page that stays ready for the next stronger wave of deals."
        )
        preferred_description = (
            existing_description if existing_description and not _looks_like_generated_category_copy(existing_description, category_name) else description
        )
        preferred_meta_description = (
            existing_meta_description if existing_meta_description and not _looks_like_generated_category_copy(existing_meta_description, category_name) else meta_fallback
        )
        preferred_paragraphs = (
            existing_paragraphs
            if any(not _looks_like_generated_category_copy(value, category_name) for value in existing_paragraphs)
            else _unique_texts([preferred_description, follow_up])
        )

        enriched["name"] = category_name
        enriched["description"] = preferred_description
        enriched["metaDescription"] = preferred_meta_description
        enriched["seoParagraphs"] = preferred_paragraphs
        enriched["keywordHighlights"] = existing_highlights or keyword_highlights
        return enriched

    def _dataset_file_candidates(self) -> List[tuple[Path, str]]:
        candidates: List[tuple[Path, str]] = []

        for path_value, source_name in (
            (self._data_file, "file"),
            (self._snapshot_file, "snapshot"),
        ):
            if path_value is None:
                continue
            if any(existing_path == path_value for existing_path, _ in candidates):
                continue
            candidates.append((path_value, source_name))

        return candidates

    def _load_dataset_file(self, dataset_path: Path) -> Dict[str, List[Dict[str, Any]]]:
        with dataset_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _fallback_dataset(self) -> tuple[Dict[str, List[Dict[str, Any]]], str]:
        for dataset_path, source_name in self._dataset_file_candidates():
            if dataset_path.is_file():
                return self._load_dataset_file(dataset_path), source_name

        return deepcopy(DEFAULT_DATASET), "seed"

    def _should_reuse_current_data(self, current_data: Dict[str, List[Dict[str, Any]]], current_source: str) -> bool:
        if current_source not in {"mysql", "file", "snapshot"}:
            return False

        return bool(
            current_data.get("coupons")
            or current_data.get("stores")
            or current_data.get("storeDirectory")
            or current_data.get("categories")
            or current_data.get("locations")
        )

    def _write_dataset_file(self, dataset_path: Optional[Path], dataset: Dict[str, List[Dict[str, Any]]]) -> None:
        if dataset_path is None:
            return

        _write_json_atomically(dataset_path, dataset, indent=2)

    def _persist_live_snapshot(self, dataset: Dict[str, List[Dict[str, Any]]]) -> None:
        self._write_dataset_file(self._snapshot_file, dataset)

    def _db_configured(self) -> bool:
        return all(
            [
                Config.MYSQL_HOST,
                Config.MYSQL_PORT,
                Config.MYSQL_DB,
                Config.MYSQL_USER,
                Config.MYSQL_PASSWORD,
            ]
        )

    def _direct_catalog_mode(self) -> bool:
        return self._direct_query_enabled and self._db_configured()

    def _direct_cache_ttl_seconds(self) -> int:
        return max(30, int(Config.DATA_REFRESH_SECONDS))

    def _read_direct_cache(self, key: tuple) -> Any | None:
        cached = self._direct_query_cache.get(key)
        if cached is None:
            return None

        cached_at, payload = cached
        if time.monotonic() - cached_at > self._direct_cache_ttl_seconds():
            self._direct_query_cache.pop(key, None)
            return None

        return deepcopy(payload)

    def _write_direct_cache(self, key: tuple, payload: Any) -> Any:
        self._direct_query_cache[key] = (time.monotonic(), deepcopy(payload))
        return payload

    def _load_precomputed_payload(self, filename: str) -> Any | None:
        summary_path = Path(__file__).resolve().parent / filename
        if not summary_path.is_file():
            return None

        try:
            with summary_path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except (OSError, ValueError, TypeError):
            return None

    def _load_precomputed_summary(self, filename: str) -> Optional[List[Dict[str, Any]]]:
        payload = self._load_precomputed_payload(filename)
        return payload if isinstance(payload, list) else None

    def _fallback_precomputed_analytics(self) -> Optional[Dict[str, Any]]:
        payload = self._load_precomputed_payload("analytics-summary.json")
        return deepcopy(payload) if isinstance(payload, dict) else None

    def _fallback_precomputed_featured_coupon_page(
        self,
        *,
        query: str = "",
        category: str = "",
        store: str = "",
        location: str = "",
        active: Optional[bool] = True,
        page: int = 1,
        limit: int = 48,
    ) -> Optional[tuple[List[Dict[str, Any]], int]]:
        if any((_clean_text(query), _clean_text(category), _clean_text(store), _clean_text(location))):
            return None

        if active is False:
            return None

        precomputed_featured_coupons = self._load_precomputed_summary("featured-coupons-summary.json")
        if precomputed_featured_coupons is None:
            return None

        normalized_page = max(1, int(page or 1))
        normalized_limit = max(1, int(limit or 48))
        start = (normalized_page - 1) * normalized_limit
        total = len(precomputed_featured_coupons)
        return deepcopy(precomputed_featured_coupons[start:start + normalized_limit]), total

    def _fallback_precomputed_store_page(
        self,
        *,
        query: str = "",
        category: str = "",
        location: str = "",
        featured: Optional[bool] = None,
        starts_with: str = "",
        page: int = 1,
        limit: int = 48,
    ) -> Optional[tuple[List[Dict[str, Any]], int]]:
        normalized_page = max(1, int(page or 1))
        normalized_limit = max(1, int(limit or 48))
        has_filters = any(
            (
                _clean_text(query),
                _clean_text(category),
                _clean_text(location),
                _clean_text(starts_with),
            )
        )

        if featured is True and not has_filters:
            precomputed_featured = self._load_precomputed_summary("featured-stores.json")
            if precomputed_featured is not None:
                start = (normalized_page - 1) * normalized_limit
                items = [
                    self._enrich_store_record(item)
                    for item in precomputed_featured[start:start + normalized_limit]
                ]
                return items, len(precomputed_featured)

        precomputed_stores = self._load_precomputed_summary("stores-summary.json")
        if precomputed_stores is None:
            return None

        filtered_items = self._filter_precomputed_store_items(
            precomputed_stores,
            query=query,
            category=category,
            location=location,
            featured=featured,
            starts_with=starts_with,
        )
        total = len(filtered_items)
        start = (normalized_page - 1) * normalized_limit
        items = [
            self._enrich_store_record(item)
            for item in filtered_items[start:start + normalized_limit]
        ]
        return items, total

    def _fallback_precomputed_category_page(
        self,
        *,
        query: str = "",
        location: str = "",
        page: int = 1,
        limit: int = 48,
    ) -> Optional[tuple[List[Dict[str, Any]], int]]:
        if _clean_text(location):
            return None

        precomputed_categories = self._load_precomputed_summary("categories-summary.json")
        if precomputed_categories is None:
            return None

        filtered_items = self._filter_precomputed_category_items(precomputed_categories, query=query)
        total = len(filtered_items)
        normalized_page = max(1, int(page or 1))
        normalized_limit = max(1, int(limit or 48))
        start = (normalized_page - 1) * normalized_limit
        items = [
            self._enrich_category_record(item)
            for item in filtered_items[start:start + normalized_limit]
        ]
        return items, total

    def _fallback_precomputed_category_item(self, identifier: str) -> Optional[Dict[str, Any]]:
        target = _clean_text(identifier).lower()
        if not target:
            return None

        precomputed_categories = self._load_precomputed_summary("categories-summary.json")
        if precomputed_categories is None:
            return None

        for item in precomputed_categories:
            if target in {
                _clean_text(item.get("id")).lower(),
                _clean_text(item.get("slug")).lower(),
                _clean_text(item.get("name")).lower(),
            }:
                return self._enrich_category_record(item)

        return None

    def _fallback_precomputed_store_item(self, identifier: str) -> Optional[Dict[str, Any]]:
        target = _clean_text(identifier).lower()
        if not target:
            return None

        target_host = _normalize_host(target)
        candidate_sources = [
            self._load_precomputed_summary("featured-stores.json") or [],
            self._load_precomputed_summary("stores-summary.json") or [],
        ]
        seen_keys: set[str] = set()

        for items in candidate_sources:
            for item in items:
                item_key = _clean_text(item.get("slug")).lower() or _clean_text(item.get("id")).lower()
                if item_key and item_key in seen_keys:
                    continue
                if item_key:
                    seen_keys.add(item_key)

                candidates = {
                    _clean_text(item.get("id")).lower(),
                    _clean_text(item.get("slug")).lower(),
                    _clean_text(item.get("name")).lower(),
                    _normalize_host(item.get("url")),
                }

                for domain_key in ("domains", "matchDomains"):
                    raw_domains = item.get(domain_key)
                    if isinstance(raw_domains, list):
                        candidates.update(_clean_text(value).lower() for value in raw_domains if _clean_text(value))

                normalized_candidates = {candidate for candidate in candidates if candidate}
                if target in normalized_candidates or (target_host and target_host in normalized_candidates):
                    hydrated_item = self._hydrate_store_copy_records([deepcopy(item)])
                    return self._enrich_store_record(hydrated_item[0] if hydrated_item else item)

        return None

    def _fallback_precomputed_location_page(
        self,
        *,
        query: str = "",
        page: int = 1,
        limit: int = 48,
    ) -> Optional[tuple[List[Dict[str, Any]], int]]:
        precomputed_locations = self._load_precomputed_summary("locations-summary.json")
        if precomputed_locations is None:
            return None

        query_term = _clean_text(query).lower()
        filtered_items = (
            [
                item
                for item in precomputed_locations
                if query_term in f"{item.get('name', '')} {item.get('code', '')} {item.get('spotlight', '')}".lower()
            ]
            if query_term
            else precomputed_locations
        )
        total = len(filtered_items)
        normalized_page = max(1, int(page or 1))
        normalized_limit = max(1, int(limit or 48))
        start = (normalized_page - 1) * normalized_limit
        return deepcopy(filtered_items[start:start + normalized_limit]), total

    def _filter_precomputed_store_items(
        self,
        items: List[Dict[str, Any]],
        *,
        query: str = "",
        category: str = "",
        location: str = "",
        featured: Optional[bool] = None,
        starts_with: str = "",
    ) -> List[Dict[str, Any]]:
        query_term = _clean_text(query).lower()
        category_term = _clean_text(category).lower()
        normalized_category_slug = _slugify(category_term.replace("-", " ")) if category_term else ""
        location_term = _clean_text(location).lower()
        starts_with_term = _clean_text(starts_with).upper()
        filtered_items: List[Dict[str, Any]] = []

        for item in items:
            name = _clean_text(item.get("name"))
            item_category = _clean_text(item.get("category"))
            item_category_hint = _clean_text(item.get("category_hint"))
            item_location = _clean_text(item.get("location"))
            item_url = _clean_text(item.get("url"))
            item_featured = bool(item.get("featured"))

            if featured is True and not item_featured:
                continue
            if featured is False and item_featured:
                continue

            if query_term:
                haystack = " ".join(
                    [
                        name,
                        _clean_text(item.get("headline")),
                        item_category,
                        item_location,
                        _clean_text(item.get("savings")),
                        item_url,
                    ]
                ).lower()
                if query_term not in haystack:
                    continue

            if category_term:
                category_tokens = {
                    item_category.lower(),
                    item_category_hint.lower(),
                    _slugify(item_category),
                    _slugify(item_category_hint),
                }
                if normalized_category_slug not in category_tokens and category_term not in " ".join(category_tokens):
                    continue

            if location_term and location_term not in item_location.lower():
                continue

            if starts_with_term:
                first_character = name[:1].upper()
                if starts_with_term == "#":
                    if first_character and re.match(r"[A-Z]", first_character):
                        continue
                elif first_character != starts_with_term:
                    continue

            filtered_items.append(item)

        return sorted(
            filtered_items,
            key=lambda item: (
                -int(item.get("activeCoupons") or item.get("couponCount") or 0),
                -int(bool(item.get("featured"))),
                str(item.get("name") or "").lower(),
            ),
        )

    def _filter_precomputed_category_items(
        self,
        items: List[Dict[str, Any]],
        *,
        query: str = "",
    ) -> List[Dict[str, Any]]:
        query_term = _clean_text(query).lower()
        filtered_items = (
            [
                item
                for item in items
                if query_term in f"{item.get('name', '')} {item.get('slug', '')} {item.get('headline', '')}".lower()
            ]
            if query_term
            else items
        )

        return sorted(
            filtered_items,
            key=lambda item: (
                -int(item.get("couponCount") or 0),
                -int(item.get("storeCount") or 0),
                str(item.get("name") or "").lower(),
            ),
        )

    def _load_data(self, force: bool = False) -> Dict[str, List[Dict[str, Any]]]:
        now = time.monotonic()
        refresh_interval = max(30, Config.DATA_REFRESH_SECONDS)

        if not force and now - self._last_refresh_tick < refresh_interval:
            return self._data

        has_warm_data = self._should_reuse_current_data(self._data, self._data_source)

        if not force and not has_warm_data:
            fallback_data, fallback_source = self._fallback_dataset()
            if self._should_reuse_current_data(fallback_data, fallback_source):
                with self._lock:
                    if not self._should_reuse_current_data(self._data, self._data_source):
                        self._data = fallback_data
                        self._data_source = fallback_source
                        self._last_refresh_tick = now
                        self._refreshed_at = datetime.utcnow().isoformat()
                        self._reset_runtime_caches()

                self._refresh_data_async_if_needed()
                return self._data

        if not force and has_warm_data:
            self._refresh_data_async_if_needed()
            return self._data

        return self._refresh_data(force=force)

    def _refresh_data_async_if_needed(self) -> None:
        if self._refresh_in_progress:
            return

        with self._refresh_lock:
            if self._refresh_in_progress:
                return

            self._refresh_in_progress = True
            Thread(target=self._refresh_data_worker, daemon=True).start()

    def _refresh_data_worker(self) -> None:
        try:
            self._refresh_data(force=True)
        finally:
            self._refresh_in_progress = False

    def _refresh_data(self, force: bool = False) -> Dict[str, List[Dict[str, Any]]]:
        with self._lock:
            now = time.monotonic()
            refresh_interval = max(30, Config.DATA_REFRESH_SECONDS)
            if not force and now - self._last_refresh_tick < refresh_interval:
                return self._data

            current_data = self._data
            current_source = self._data_source

            try:
                if self._db_configured():
                    self._data = self._load_data_from_mysql()
                    self._data_source = "mysql"
                    try:
                        self._persist_live_snapshot(self._data)
                    except OSError:
                        pass
                else:
                    self._data, self._data_source = self._fallback_dataset()
            except Exception:
                if self._should_reuse_current_data(current_data, current_source):
                    self._data = current_data
                    self._data_source = current_source
                else:
                    self._data, self._data_source = self._fallback_dataset()

            self._last_refresh_tick = now
            self._refreshed_at = datetime.utcnow().isoformat()
            self._reset_runtime_caches()
            return self._data

    def _save_data(self) -> None:
        for dataset_path, _ in self._dataset_file_candidates():
            self._write_dataset_file(dataset_path, self._data)

    def _reset_runtime_caches(self) -> None:
        self._ranked_items_cache = {}
        self._item_lookup_cache = {}
        self._search_cache = {}
        self._store_match_cache = {}
        self._featured_coupon_cache = None
        self._analytics_cache = None
        self._direct_query_cache = {}

    def list_items(self, collection: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        self._load_data()
        ranked_items = self._cached_ranked_items(collection)

        if limit is None or limit <= 0:
            return deepcopy(ranked_items)

        return deepcopy(ranked_items[:limit])

    def list_items_page(self, collection: str, limit: Optional[int] = None) -> tuple[List[Dict[str, Any]], int]:
        self._load_data()
        ranked_items = self._cached_ranked_items(collection)
        total = len(ranked_items)
        items = ranked_items if limit is None or limit <= 0 else ranked_items[:limit]
        return deepcopy(items), total

    def count_items(self, collection: str) -> int:
        self._load_data()
        return len(self._data.get(collection, []))

    def get_item(self, collection: str, identifier: str) -> Optional[Dict[str, Any]]:
        self._load_data()
        target = str(identifier).strip().lower()
        lookup = self._item_lookup_cache.get(collection)

        if lookup is None:
            lookup = {}
            collections = [self._data.get(collection, [])]

            if collection == "stores" and "storeDirectory" in self._data:
                collections.append(self._data.get("storeDirectory", []))

            for items in collections:
                for item in items:
                    for candidate in {
                        str(item.get("id", "")).strip().lower(),
                        str(item.get("slug", "")).strip().lower(),
                        str(item.get("name", "")).strip().lower(),
                    }:
                        if candidate and candidate not in lookup:
                            lookup[candidate] = item

            self._item_lookup_cache[collection] = lookup

        item = lookup.get(target)
        return deepcopy(item) if item is not None else None

    def create_item(self, collection: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not Config.ENABLE_MUTATIONS:
            raise PermissionError("Mutations are disabled.")

        with self._lock:
            self._load_data(force=True)
            items = self._data.setdefault(collection, [])
            next_id = max((int(item.get("id", 0)) for item in items), default=0) + 1
            record = deepcopy(payload)
            record["id"] = next_id
            record.setdefault("slug", _slugify(record.get("name") or record.get("title") or f"{collection}-{next_id}"))
            items.append(record)
            self._reset_runtime_caches()
            self._save_data()
            return deepcopy(record)

    def update_item(self, collection: str, identifier: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not Config.ENABLE_MUTATIONS:
            raise PermissionError("Mutations are disabled.")

        target = str(identifier).strip().lower()
        with self._lock:
            self._load_data(force=True)
            for index, item in enumerate(self._data.get(collection, [])):
                candidates = {
                    str(item.get("id", "")).strip().lower(),
                    str(item.get("slug", "")).strip().lower(),
                    str(item.get("name", "")).strip().lower()
                }
                if target not in candidates:
                    continue
                updated = {**item, **payload}
                if "slug" not in updated or not updated["slug"]:
                    updated["slug"] = _slugify(updated.get("name") or updated.get("title") or str(updated["id"]))
                self._data[collection][index] = updated
                self._reset_runtime_caches()
                self._save_data()
                return deepcopy(updated)
        return None

    def delete_item(self, collection: str, identifier: str) -> bool:
        if not Config.ENABLE_MUTATIONS:
            raise PermissionError("Mutations are disabled.")

        target = str(identifier).strip().lower()
        with self._lock:
            self._load_data(force=True)
            items = self._data.get(collection, [])
            before = len(items)
            self._data[collection] = [
                item for item in items
                if target not in {
                    str(item.get("id", "")).strip().lower(),
                    str(item.get("slug", "")).strip().lower(),
                    str(item.get("name", "")).strip().lower()
                }
            ]
            if len(self._data[collection]) == before:
                return False
            self._reset_runtime_caches()
            self._save_data()
            return True

    def search_coupons(self, query: str = "", category: str = "", store: str = "") -> List[Dict[str, Any]]:
        query_term = query.strip().lower()
        category_term = category.strip().lower()
        store_term = store.strip().lower()
        return deepcopy(self._cached_coupon_results(query_term, category_term, store_term))

    def search_coupons_page(
        self,
        query: str = "",
        category: str = "",
        store: str = "",
        limit: Optional[int] = None,
    ) -> tuple[List[Dict[str, Any]], int]:
        query_term = query.strip().lower()
        category_term = category.strip().lower()
        store_term = store.strip().lower()
        ranked_items = self._cached_coupon_results(query_term, category_term, store_term)
        total = len(ranked_items)
        items = ranked_items if limit is None or limit <= 0 else ranked_items[:limit]
        return deepcopy(items), total

    def _cached_coupon_results(self, query_term: str, category_term: str, store_term: str) -> List[Dict[str, Any]]:
        self._load_data()
        cache_key = ("coupons", query_term, category_term, store_term)
        cached = self._search_cache.get(cache_key)
        if cached is not None:
            return cached

        items = self._data.get("coupons", [])

        results = []
        for coupon in items:
            haystack = " ".join(
                [
                    str(coupon.get("title", "")),
                    str(coupon.get("description", "")),
                    str(coupon.get("storeName", "")),
                    str(coupon.get("discountText", "")),
                    str(coupon.get("code", ""))
                ]
            ).lower()

            if query_term and query_term not in haystack:
                continue
            category_candidates = {
                str(coupon.get("categorySlug", "")).lower(),
                str(coupon.get("categoryName", "")).lower(),
            }
            category_candidates.update(str(value).strip().lower() for value in coupon.get("categoryAliases", []) if str(value).strip())
            category_candidates.update(str(value).strip().lower() for value in coupon.get("categoryAliasSlugs", []) if str(value).strip())
            if category_term and category_term not in category_candidates:
                continue
            if store_term and store_term not in {
                str(coupon.get("storeSlug", "")).lower(),
                str(coupon.get("storeName", "")).lower()
            }:
                continue
            results.append(coupon)

        ranked = self._rank_items("coupons", results)
        self._search_cache[cache_key] = ranked
        return ranked

    def _cached_live_coupon_results(
        self,
        *,
        query: str = "",
        category: str = "",
        store: str = "",
        location: str = "",
        featured: Optional[bool] = None,
        active: Optional[bool] = True,
    ) -> List[Dict[str, Any]]:
        self._load_data()

        if active is False:
            return []

        query_term = _clean_text(query).lower()
        category_term = _clean_text(category).lower()
        store_term = _clean_text(store).lower()
        location_term = _clean_text(location).lower()
        normalized_category_slug = _slugify(category_term.replace("-", " ")) if category_term else ""
        normalized_store_slug = _slugify(store_term.replace(".", " ").replace("-", " ")) if store_term else ""
        normalized_store_host = _normalize_host(store_term) if store_term else ""

        cache_key = (
            "live-coupons-cache",
            query_term,
            category_term,
            store_term,
            location_term,
            featured,
            active,
        )
        cached = self._search_cache.get(cache_key)
        if cached is not None:
            return cached

        items = self._data.get("coupons", [])
        results = []

        for coupon in items:
            if featured is True and not bool(coupon.get("featured")):
                continue
            if featured is False and bool(coupon.get("featured")):
                continue

            if query_term:
                haystack = " ".join(
                    [
                        str(coupon.get("title", "")),
                        str(coupon.get("description", "")),
                        str(coupon.get("storeName", "")),
                        str(coupon.get("discountText", "")),
                        str(coupon.get("code", "")),
                    ]
                ).lower()
                if query_term not in haystack:
                    continue

            if category_term:
                category_candidates = {
                    str(coupon.get("categorySlug", "")).lower(),
                    str(coupon.get("categoryName", "")).lower(),
                }
                category_candidates.update(str(value).strip().lower() for value in coupon.get("categoryAliases", []) if str(value).strip())
                category_candidates.update(str(value).strip().lower() for value in coupon.get("categoryAliasSlugs", []) if str(value).strip())
                if category_term not in category_candidates and normalized_category_slug not in category_candidates:
                    continue

            if store_term:
                store_candidates = {
                    str(coupon.get("storeSlug", "")).lower(),
                    str(coupon.get("storeName", "")).lower(),
                    _slugify(str(coupon.get("storeName", "")).replace(".", " ").replace("-", " ")),
                    _normalize_host(str(coupon.get("merchant_home_page", ""))),
                    _normalize_host(str(coupon.get("url", ""))),
                }
                if (
                    store_term not in store_candidates
                    and normalized_store_slug not in store_candidates
                    and normalized_store_host not in store_candidates
                ):
                    continue

            if location_term:
                location_haystack = " ".join(
                    [
                        str(coupon.get("location", "")),
                        str(coupon.get("primary_location", "")),
                        str(coupon.get("locations", "")),
                    ]
                ).lower()
                if location_term not in location_haystack:
                    continue

            results.append(coupon)

        ranked = self._rank_items("coupons", results)
        self._search_cache[cache_key] = ranked
        return ranked

    def search_stores(self, query: str = "", category: str = "", location: str = "") -> List[Dict[str, Any]]:
        query_term = query.strip().lower()
        category_term = category.strip().lower()
        location_term = location.strip().lower()
        return deepcopy(self._cached_store_results(query_term, category_term, location_term))

    def search_stores_page(
        self,
        query: str = "",
        category: str = "",
        location: str = "",
        limit: Optional[int] = None,
    ) -> tuple[List[Dict[str, Any]], int]:
        query_term = query.strip().lower()
        category_term = category.strip().lower()
        location_term = location.strip().lower()
        ranked_items = self._cached_store_results(query_term, category_term, location_term)
        total = len(ranked_items)
        items = ranked_items if limit is None or limit <= 0 else ranked_items[:limit]
        return deepcopy(items), total

    def _cached_store_results(self, query_term: str, category_term: str, location_term: str) -> List[Dict[str, Any]]:
        self._load_data()
        cache_key = ("stores", query_term, category_term, location_term)
        cached = self._search_cache.get(cache_key)
        if cached is not None:
            return cached

        items = self._data.get("storeDirectory", self._data.get("stores", []))

        results = []
        for store in items:
            haystack = " ".join(
                [
                    str(store.get("name", "")),
                    str(store.get("headline", "")),
                    str(store.get("category", "")),
                    str(store.get("location", "")),
                    str(store.get("url", "")),
                    " ".join(str(value) for value in store.get("domains", [])),
                ]
            ).lower()

            if query_term and query_term not in haystack:
                continue
            if category_term and category_term not in {
                str(store.get("category", "")).lower(),
                str(store.get("category_hint", "")).lower(),
            }:
                continue
            if location_term and location_term not in haystack:
                continue

            results.append(store)

        if not results and query_term and self._db_configured():
            fallback_rows = self._lookup_store_rows_by_query(query_term)

            for store_row in fallback_rows:
                fallback_store = self._build_store_directory_record(store_row, {})
                haystack = " ".join(
                    [
                        str(fallback_store.get("name", "")),
                        str(fallback_store.get("headline", "")),
                        str(fallback_store.get("category", "")),
                        str(fallback_store.get("location", "")),
                        str(fallback_store.get("url", "")),
                        " ".join(str(value) for value in fallback_store.get("domains", [])),
                    ]
                ).lower()

                if category_term and category_term not in {
                    str(fallback_store.get("category", "")).lower(),
                    str(fallback_store.get("category_hint", "")).lower(),
                }:
                    continue
                if location_term and location_term not in haystack:
                    continue

                results.append(fallback_store)

        ranked = self._rank_items("stores", results)
        self._search_cache[cache_key] = ranked
        return ranked

    def search_categories(self, query: str = "") -> List[Dict[str, Any]]:
        self._load_data()
        items = self._data.get("categories", [])
        query_term = query.strip().lower()

        if not query_term:
            return self._rank_items("categories", deepcopy(items))

        results = [
            deepcopy(item)
            for item in items
            if query_term in f"{item.get('name', '')} {item.get('headline', '')}".lower()
        ]
        return self._rank_items("categories", results)

    def search_locations(self, query: str = "") -> List[Dict[str, Any]]:
        self._load_data()
        items = self._data.get("locations", [])
        query_term = query.strip().lower()

        if not query_term:
            return self._rank_items("locations", deepcopy(items))

        results = [
            deepcopy(item)
            for item in items
            if query_term in f"{item.get('name', '')} {item.get('code', '')} {item.get('spotlight', '')}".lower()
        ]
        return self._rank_items("locations", results)

    def get_featured_coupons(self) -> List[Dict[str, Any]]:
        if self._prefer_precomputed_summaries:
            precomputed_featured_coupons = self._load_precomputed_summary("featured-coupons-summary.json")
            if precomputed_featured_coupons is not None:
                return deepcopy(precomputed_featured_coupons)

        self._load_data()
        return deepcopy(self._cached_featured_coupons())

    def get_featured_coupons_page(self, limit: Optional[int] = None) -> tuple[List[Dict[str, Any]], int]:
        if self._prefer_precomputed_summaries:
            precomputed_featured_coupons = self._load_precomputed_summary("featured-coupons-summary.json")
            if precomputed_featured_coupons is not None:
                total = len(precomputed_featured_coupons)
                if limit is None or limit <= 0:
                    return deepcopy(precomputed_featured_coupons), total
                return deepcopy(precomputed_featured_coupons[:limit]), total

        self._load_data()
        ranked_items = self._cached_featured_coupons()
        total = len(ranked_items)
        items = ranked_items if limit is None or limit <= 0 else ranked_items[:limit]
        return deepcopy(items), total

    def store_analytics(self) -> Dict[str, int]:
        self._load_data()
        if self._analytics_cache is not None:
            return deepcopy(self._analytics_cache)

        coupons = self._data.get("coupons", [])
        stores = self._data.get("stores", [])
        locations = self._data.get("locations", [])
        self._analytics_cache = {
            "totalCoupons": len(coupons),
            "totalStores": len(stores),
            "featuredCoupons": sum(1 for item in coupons if item.get("featured")),
            "liveMarkets": len(locations),
            "dataSource": self._data_source,
            "refreshedAt": self._refreshed_at,
        }
        return deepcopy(self._analytics_cache)

    def normalize_store_host(self, value: str) -> str:
        return _normalize_host(value)

    def _live_coupon_where_clauses(
        self,
        query: str = "",
        category: str = "",
        store: str = "",
        location: str = "",
        featured: Optional[bool] = None,
        active: Optional[bool] = True,
    ) -> tuple[list[str], list[Any]]:
        clauses = ["TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')"]
        params: list[Any] = []

        if active is None or active:
            clauses.append("(end_date IS NULL OR end_date >= CURDATE())")
        else:
            clauses.append("end_date IS NOT NULL AND end_date < CURDATE()")

        query_term = _clean_text(query).lower()
        if query_term:
            clauses.append(
                "LOWER(CONCAT_WS(' ', COALESCE(title, ''), COALESCE(description, ''), COALESCE(label, ''), "
                "COALESCE(code, ''), COALESCE(store, ''))) LIKE %s"
            )
            params.append(f"%{query_term}%")

        category_term = _clean_text(category).lower()
        if category_term:
            category_like = f"%{category_term.replace('-', ' ')}%"
            clauses.append(
                "(LOWER(COALESCE(standard_categories, '')) LIKE %s OR LOWER(COALESCE(categories, '')) LIKE %s)"
            )
            params.extend([category_like, category_like])

        store_term = _clean_text(store).lower()
        if store_term:
            store_plain_term = store_term.replace("-", " ")
            store_domain_term = store_term.replace("-", ".")
            store_slug_term = _slugify(store_term)
            clauses.append(
                "("
                "LOWER(COALESCE(store, '')) = %s "
                "OR LOWER(COALESCE(store, '')) = %s "
                "OR LOWER(REPLACE(COALESCE(store, ''), ' ', '-')) = %s "
                "OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(store, ''), '.', '-'), ' ', '-'), '_', '-')) = %s "
                "OR LOWER(COALESCE(store, '')) LIKE %s "
                "OR LOWER(COALESCE(merchant_home_page, '')) LIKE %s "
                "OR LOWER(COALESCE(url, '')) LIKE %s"
                ")"
            )
            params.extend(
                [
                    store_plain_term,
                    store_domain_term,
                    store_term,
                    store_slug_term,
                    f"%{store_plain_term}%",
                    f"%{store_domain_term}%",
                    f"%{store_domain_term}%",
                ]
            )

        location_term = _clean_text(location).lower()
        if location_term:
            clauses.append(
                "(LOWER(COALESCE(primary_location, '')) LIKE %s OR LOWER(COALESCE(locations, '')) LIKE %s)"
            )
            params.extend([f"%{location_term}%", f"%{location_term}%"])

        if featured is True:
            clauses.append("LOWER(COALESCE(featured, '')) = 'yes'")
        elif featured is False:
            clauses.append("LOWER(COALESCE(featured, '')) <> 'yes'")

        return clauses, params

    def _minimal_store_row(
        self,
        store_name: str,
        raw_coupon: Dict[str, Any],
    ) -> Dict[str, Any]:
        return {
            "id": _clean_text(raw_coupon.get("store_id")) or _slugify(store_name),
            "name": store_name,
            "primary_location": _clean_text(raw_coupon.get("primary_location")),
            "url": _sanitize_http_url(raw_coupon.get("merchant_home_page")) or _sanitize_http_url(raw_coupon.get("url")),
            "locations": _clean_text(raw_coupon.get("locations")),
            "logo_horizontal_url": _clean_text(raw_coupon.get("brand_logo")),
            "logo_square_url": _clean_text(raw_coupon.get("brand_logo")),
            "authority_tier": 0,
            "category_hint": _clean_text(raw_coupon.get("standard_categories")) or _clean_text(raw_coupon.get("categories")),
            "initial_rank_score": _pick_numeric(raw_coupon.get("rating"), 45),
        }

    def list_coupons_live(
        self,
        *,
        query: str = "",
        category: str = "",
        store: str = "",
        location: str = "",
        featured: Optional[bool] = None,
        active: Optional[bool] = True,
        page: int = 1,
        limit: int = 48,
    ) -> tuple[List[Dict[str, Any]], int]:
        if not self._direct_catalog_mode():
            items = self.search_coupons(query=query, category=category, store=store)
            if location:
                location_term = location.strip().lower()
                items = [
                    item for item in items
                    if location_term in {
                        str(item.get("location") or "").strip().lower(),
                        str(item.get("primary_location") or "").strip().lower(),
                    }
                ]
            if featured is not None:
                items = [item for item in items if bool(item.get("featured")) is featured]
            total = len(items)
            start = max(0, (max(1, page) - 1) * max(1, limit))
            return items[start:start + max(1, limit)], total

        normalized_page = max(1, int(page or 1))
        normalized_limit = max(1, int(limit or 48))
        cache_key = (
            "live-coupons",
            _clean_text(query).lower(),
            _clean_text(category).lower(),
            _clean_text(store).lower(),
            _clean_text(location).lower(),
            featured,
            active,
            normalized_page,
            normalized_limit,
        )
        cached = self._read_direct_cache(cache_key)
        if cached is not None:
            return cached

        if self._prefer_precomputed_summaries and featured is True:
            precomputed_page = self._fallback_precomputed_featured_coupon_page(
                query=query,
                category=category,
                store=store,
                location=location,
                active=active,
                page=page,
                limit=limit,
            )
            if precomputed_page is not None:
                return self._write_direct_cache(cache_key, precomputed_page)

        normalized_store = _clean_text(store)
        prefer_live_store_query = self._db_configured() and bool(normalized_store)
        exact_store_page_query = (
            prefer_live_store_query
            and not _clean_text(query)
            and not _clean_text(category)
            and not _clean_text(location)
            and featured is None
            and (active is None or active)
        )

        if exact_store_page_query:
            try:
                store_record = self.get_store_live(normalized_store)
                store_name = _clean_text((store_record or {}).get("name"))
                if store_name:
                    total, raw_coupons, location_lookup = self._lookup_active_coupons_for_store(
                        store_name,
                        normalized_limit,
                        offset=(normalized_page - 1) * normalized_limit,
                    )
                    coupons = [
                        coupon
                        for coupon in (
                            self._build_coupon_record(raw_coupon, store_record, location_lookup)
                            for raw_coupon in raw_coupons
                        )
                        if coupon is not None
                    ]
                    return self._write_direct_cache(cache_key, (coupons, total))
            except Exception:
                pass

        if not self._db_configured() and (active is None or active):
            try:
                cached_items = self._cached_live_coupon_results(
                    query=query,
                    category=category,
                    store=store,
                    location=location,
                    featured=featured,
                    active=active,
                )
                start = (normalized_page - 1) * normalized_limit
                total = len(cached_items)
                return self._write_direct_cache(
                    cache_key,
                    (deepcopy(cached_items[start:start + normalized_limit]), total),
                )
            except Exception:
                pass

        clauses, params = self._live_coupon_where_clauses(
            query=query,
            category=category,
            store=store,
            location=location,
            featured=featured,
            active=active,
        )
        where_sql = " AND ".join(clauses)
        offset = (normalized_page - 1) * normalized_limit

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT COUNT(1) AS total FROM coupons WHERE {where_sql}", params)
                total = int((cursor.fetchone() or {}).get("total") or 0)

                cursor.execute(
                    f"""
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
                    WHERE {where_sql}
                    ORDER BY
                        (end_date IS NOT NULL) DESC,
                        end_date ASC,
                        id DESC
                    LIMIT %s OFFSET %s
                    """,
                    [*params, normalized_limit, offset],
                )
                raw_coupons = cursor.fetchall()
                store_names = sorted(
                    {
                        _clean_text(row.get("store"))
                        for row in raw_coupons
                        if _clean_text(row.get("store"))
                    }
                )
                raw_store_rows = self._load_store_rows(cursor, store_names)
                location_lookup = self._load_location_lookup(cursor)

            store_rows_by_name: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
            for store_row in raw_store_rows:
                store_rows_by_name[_lower_text(store_row.get("name"))].append(store_row)

            items: List[Dict[str, Any]] = []
            for raw_coupon in raw_coupons:
                store_name = _clean_text(raw_coupon.get("store")) or "Unknown store"
                store_row = self._select_store_row(store_rows_by_name.get(store_name.lower(), []))
                effective_store_row = store_row or self._minimal_store_row(store_name, raw_coupon)
                store_payload = self._build_store_record(store_name, effective_store_row, [raw_coupon], location_lookup)
                coupon_payload = self._build_coupon_record(raw_coupon, store_payload, location_lookup)
                if coupon_payload is not None:
                    items.append(coupon_payload)

            return self._write_direct_cache(cache_key, (items, total))
        finally:
            connection.close()

    def get_coupon_live(self, identifier: str) -> Optional[Dict[str, Any]]:
        target = _clean_text(identifier).lower()
        if not target:
            return None

        if not self._direct_catalog_mode():
            return self.get_item("coupons", identifier)

        coupon_id = target
        match = re.search(r"-(\d+)$", target)
        if match:
            coupon_id = match.group(1)

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
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
                    WHERE id = %s
                    LIMIT 1
                    """,
                    (coupon_id,),
                )
                raw_coupon = cursor.fetchone()
                if not raw_coupon:
                    return None

                store_name = _clean_text(raw_coupon.get("store")) or "Unknown store"
                raw_store_rows = self._load_store_rows(cursor, [store_name])
                location_lookup = self._load_location_lookup(cursor)

            store_row = self._select_store_row(raw_store_rows)
            effective_store_row = store_row or self._minimal_store_row(store_name, raw_coupon)
            store_payload = self._build_store_record(store_name, effective_store_row, [raw_coupon], location_lookup)
            return self._build_coupon_record(raw_coupon, store_payload, location_lookup)
        finally:
            connection.close()

    def _build_store_summary_record(
        self,
        summary_row: Dict[str, Any],
        location_lookup: Dict[str, str],
        *,
        force_featured: bool = False,
    ) -> Dict[str, Any]:
        store_row = {
            "id": summary_row.get("store_id") or _slugify(_clean_text(summary_row.get("canonical_name")) or _clean_text(summary_row.get("store_name"))),
            "name": _clean_text(summary_row.get("canonical_name")) or _clean_text(summary_row.get("store_name")),
            "primary_location": _clean_text(summary_row.get("store_primary_location")) or _clean_text(summary_row.get("coupon_primary_location")),
            "url": _clean_text(summary_row.get("url")),
            "logo_horizontal_url": _clean_text(summary_row.get("logo_horizontal_url")),
            "logo_square_url": _clean_text(summary_row.get("logo_square_url")),
            "authority_tier": summary_row.get("authority_tier"),
            "category_hint": _clean_text(summary_row.get("category_hint")) or _clean_text(summary_row.get("coupon_categories")),
            "initial_rank_score": summary_row.get("initial_rank_score") or 45,
        }

        record = self._build_store_directory_record(store_row, location_lookup)
        coupon_count = int(summary_row.get("coupon_count") or 0)
        raw_category = _clean_text(summary_row.get("category_hint")) or _clean_text(summary_row.get("coupon_categories"))
        category_name = _title_case_words(_split_csv_values(raw_category)[0] if raw_category else "Store") or "Store"
        location_name = record.get("location") or "Global"
        category_copy = category_name.lower() if category_name.strip().lower() != "other" else "store"

        record.update(
            {
                "headline": (
                    f"{coupon_count} live {category_copy} offers for {location_name} shoppers, "
                    "refreshed from CouponLeo's real coupon feed."
                ),
                "category": category_name,
                "category_hint": _clean_text(store_row.get("category_hint")) or category_name.lower(),
                "activeCoupons": coupon_count,
                "couponCount": coupon_count,
                "savings": "Live savings",
                "featured": force_featured or int(summary_row.get("featured_count") or 0) > 0,
                "hasLiveOffers": coupon_count > 0,
            }
        )
        return self._enrich_store_record(record)

    def list_stores_live(
        self,
        *,
        query: str = "",
        category: str = "",
        location: str = "",
        featured: Optional[bool] = None,
        starts_with: str = "",
        page: int = 1,
        limit: int = 48,
    ) -> tuple[List[Dict[str, Any]], int]:
        normalized_page = max(1, int(page or 1))
        normalized_limit = max(1, int(limit or 48))
        offset = (normalized_page - 1) * normalized_limit

        if self._prefer_precomputed_summaries:
            precomputed_page = self._fallback_precomputed_store_page(
                query=query,
                category=category,
                location=location,
                featured=featured,
                starts_with=starts_with,
                page=page,
                limit=limit,
            )
            if precomputed_page is not None:
                return precomputed_page

        if not self._direct_catalog_mode():
            precomputed_page = self._fallback_precomputed_store_page(
                query=query,
                category=category,
                location=location,
                featured=featured,
                starts_with=starts_with,
                page=page,
                limit=limit,
            )
            if precomputed_page is not None:
                return precomputed_page

            items = [
                self._enrich_store_record(item)
                for item in self.search_stores(query=query, category=category, location=location)
            ]
            if featured is True:
                items = [item for item in items if bool(item.get("featured"))][: max(1, int(limit or 48))]
            total = len(items)
            start = max(0, (max(1, page) - 1) * max(1, limit))
            return items[start:start + max(1, limit)], total

        cache_key = (
            "live-stores",
            _clean_text(query).lower(),
            _clean_text(category).lower(),
            _clean_text(location).lower(),
            featured,
            _clean_text(starts_with).upper(),
            normalized_page,
            normalized_limit,
        )
        cached = self._read_direct_cache(cache_key)
        if cached is not None:
            return cached

        try:
            if featured is True and not any((_clean_text(query), _clean_text(category), _clean_text(location))):
                connection = self._connect_mysql()
                try:
                    with connection.cursor() as cursor:
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
                        total = int((cursor.fetchone() or {}).get("total") or 0)

                        cursor.execute(
                            """
                            SELECT
                                store AS store_name,
                                COUNT(1) AS coupon_count,
                                MAX(COALESCE(rating, 0)) AS max_rating,
                                MAX(primary_location) AS coupon_primary_location,
                                MAX(locations) AS coupon_locations,
                                MAX(COALESCE(standard_categories, categories, '')) AS coupon_categories
                            FROM coupons
                            WHERE TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')
                              AND (end_date IS NULL OR end_date >= CURDATE())
                            GROUP BY store
                            ORDER BY COUNT(1) DESC, MAX(COALESCE(rating, 0)) DESC, store ASC
                            LIMIT %s OFFSET %s
                            """,
                            (normalized_limit, offset),
                        )
                        rows = cursor.fetchall()
                        store_names = [
                            _clean_text(row.get("store_name"))
                            for row in rows
                            if _clean_text(row.get("store_name"))
                        ]
                        raw_store_rows = self._load_store_rows(cursor, store_names)
                        location_lookup = self._load_location_lookup(cursor)

                    store_rows_by_name: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
                    for store_row in raw_store_rows:
                        store_rows_by_name[_lower_text(store_row.get("name"))].append(store_row)

                    items: List[Dict[str, Any]] = []
                    for row in rows:
                        store_name = _clean_text(row.get("store_name"))
                        store_row = self._select_store_row(store_rows_by_name.get(store_name.lower(), []))
                        row_payload = {
                            **row,
                            "canonical_name": store_name,
                            "store_id": store_row.get("id") if store_row else _slugify(store_name),
                            "store_primary_location": store_row.get("primary_location") if store_row else "",
                            "url": store_row.get("url") if store_row else "",
                            "logo_horizontal_url": store_row.get("logo_horizontal_url") if store_row else "",
                            "logo_square_url": store_row.get("logo_square_url") if store_row else "",
                            "authority_tier": store_row.get("authority_tier") if store_row else 0,
                            "category_hint": store_row.get("category_hint") if store_row else "",
                            "initial_rank_score": store_row.get("initial_rank_score") if store_row else 45,
                            "featured_count": 1,
                        }
                        items.append(self._build_store_summary_record(row_payload, location_lookup, force_featured=True))

                    return self._write_direct_cache(cache_key, (items, total))
                finally:
                    connection.close()

            clauses = ["TRIM(COALESCE(c.store, '')) NOT IN ('', 'unknown')", "(c.end_date IS NULL OR c.end_date >= CURDATE())"]
            params: list[Any] = []

            query_term = _clean_text(query).lower()
            if query_term:
                clauses.append("(LOWER(c.store) LIKE %s OR LOWER(COALESCE(s.url, '')) LIKE %s)")
                params.extend([f"%{query_term}%", f"%{query_term}%"])

            category_term = _clean_text(category).lower()
            if category_term:
                category_like = f"%{category_term.replace('-', ' ')}%"
                clauses.append(
                    "(LOWER(COALESCE(c.standard_categories, '')) LIKE %s OR LOWER(COALESCE(c.categories, '')) LIKE %s "
                    "OR LOWER(COALESCE(s.category_hint, '')) LIKE %s)"
                )
                params.extend([category_like, category_like, category_like])

            location_term = _clean_text(location).lower()
            if location_term:
                clauses.append(
                    "(LOWER(COALESCE(c.primary_location, '')) LIKE %s OR LOWER(COALESCE(c.locations, '')) LIKE %s "
                    "OR LOWER(COALESCE(s.primary_location, '')) LIKE %s)"
                )
                params.extend([f"%{location_term}%", f"%{location_term}%", f"%{location_term}%"])

            if featured is True:
                clauses.append("(LOWER(COALESCE(c.featured, '')) = 'yes' OR COALESCE(s.initial_rank_score, 0) >= 70)")

            where_sql = " AND ".join(clauses)
            should_count_total = featured is not True

            connection = self._connect_mysql()
            try:
                with connection.cursor() as cursor:
                    total = 0
                    if should_count_total:
                        cursor.execute(
                            f"""
                            SELECT COUNT(1) AS total
                            FROM (
                                SELECT c.store
                                FROM coupons c
                                LEFT JOIN stores s ON s.name = c.store
                                WHERE {where_sql}
                                GROUP BY c.store
                            ) grouped
                            """,
                            params,
                        )
                        total = int((cursor.fetchone() or {}).get("total") or 0)

                    cursor.execute(
                        f"""
                        SELECT
                            c.store AS store_name,
                            COALESCE(s.name, c.store) AS canonical_name,
                            s.id AS store_id,
                            s.primary_location AS store_primary_location,
                            MAX(c.primary_location) AS coupon_primary_location,
                            MAX(c.locations) AS coupon_locations,
                            MAX(COALESCE(c.standard_categories, c.categories, '')) AS coupon_categories,
                            s.url,
                            s.logo_horizontal_url,
                            s.logo_square_url,
                            s.authority_tier,
                            s.category_hint,
                            s.initial_rank_score,
                            COUNT(1) AS coupon_count,
                            MAX(COALESCE(c.rating, 0)) AS max_rating,
                            SUM(CASE WHEN LOWER(COALESCE(c.featured, '')) = 'yes' THEN 1 ELSE 0 END) AS featured_count
                        FROM coupons c
                        LEFT JOIN stores s ON s.name = c.store
                        WHERE {where_sql}
                        GROUP BY
                            c.store,
                            s.id,
                            s.name,
                            s.primary_location,
                            s.url,
                            s.logo_horizontal_url,
                            s.logo_square_url,
                            s.authority_tier,
                            s.category_hint,
                            s.initial_rank_score
                        ORDER BY
                            COUNT(1) DESC,
                            MAX(COALESCE(s.initial_rank_score, 0)) DESC,
                            MAX(COALESCE(c.rating, 0)) DESC,
                            c.store ASC
                        LIMIT %s OFFSET %s
                        """,
                        [*params, normalized_limit, offset],
                    )
                    rows = cursor.fetchall()
                    location_lookup = self._load_location_lookup(cursor)

                items = [
                    self._build_store_summary_record(row, location_lookup, force_featured=featured is True)
                    for row in rows
                ]
                if not should_count_total:
                    total = offset + len(items)
                return self._write_direct_cache(cache_key, (items, total))
            finally:
                connection.close()
        except Exception:
            precomputed_page = self._fallback_precomputed_store_page(
                query=query,
                category=category,
                location=location,
                featured=featured,
                starts_with=starts_with,
                page=page,
                limit=limit,
            )
            if precomputed_page is not None:
                return self._write_direct_cache(cache_key, precomputed_page)
            raise

    def _store_row_by_identifier(self, identifier: str) -> Optional[Dict[str, Any]]:
        target = _clean_text(identifier).lower()
        if not target:
            return None

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                if target.isdigit():
                    direct_rows = self._fetch_store_rows(
                        cursor,
                        "id = %s",
                        (int(target),),
                        limit=1,
                    )
                    row = direct_rows[0] if direct_rows else None
                    if row:
                        return row

                first_token = target.split("-", 1)[0]
                candidates = self._fetch_store_rows(
                    cursor,
                    "LOWER(name) LIKE %s OR LOWER(COALESCE(url, '')) LIKE %s",
                    (f"%{first_token}%", f"%{target}%"),
                    limit=250,
                )
        finally:
            connection.close()

        for candidate in candidates:
            candidate_slug = _slugify(_clean_text(candidate.get("name")))
            if target in {
                candidate_slug,
                _clean_text(candidate.get("id")).lower(),
                _normalize_host(candidate.get("url")),
            }:
                return candidate

        return candidates[0] if candidates else None

    def get_store_live(self, identifier: str) -> Optional[Dict[str, Any]]:
        if not self._direct_catalog_mode():
            item = self.get_item("stores", identifier)
            return self._enrich_store_record(item) if item else None

        cache_key = ("live-store", _clean_text(identifier).lower())
        cached = self._read_direct_cache(cache_key)
        if cached is not None:
            return cached

        precomputed_store = self._fallback_precomputed_store_item(identifier)
        if precomputed_store is not None:
            return self._write_direct_cache(cache_key, precomputed_store)

        # Direct lookups must not load the complete catalog for an unknown store.
        store_row = self._store_row_by_identifier(identifier)
        if not store_row:
            return None

        store_name = _clean_text(store_row.get("name"))
        coupon_count, raw_coupons, location_lookup = self._lookup_active_coupons_for_store(store_name, 48)

        if raw_coupons:
            store_payload = self._build_store_record(store_name, store_row, raw_coupons, location_lookup)
            category_name = _clean_text(store_payload.get("category")) or "Store"
            category_copy = category_name.lower() if category_name.strip().lower() != "other" else "store"
            location_name = _clean_text(store_payload.get("location")) or "Global"
            store_payload["activeCoupons"] = coupon_count
            store_payload["couponCount"] = coupon_count
            store_payload["hasLiveOffers"] = coupon_count > 0
            store_payload["headline"] = (
                f"{coupon_count} live {category_copy} offers for {location_name} shoppers, "
                "refreshed from CouponLeo's real coupon feed."
            )
        else:
            store_payload = self._build_store_directory_record(store_row, location_lookup)

        return self._write_direct_cache(cache_key, self._enrich_store_record(store_payload))

    def _aggregate_category_rows(self, query: str = "", location: str = "") -> List[Dict[str, Any]]:
        cache_key = ("live-category-rows", _clean_text(query).lower(), _clean_text(location).lower())
        cached = self._read_direct_cache(cache_key)
        if cached is not None:
            return cached

        if not self._direct_catalog_mode():
            items = self.search_categories(query=query)
            return self._write_direct_cache(cache_key, items)

        clauses = ["TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')", "(end_date IS NULL OR end_date >= CURDATE())"]
        params: list[Any] = []

        location_term = _clean_text(location).lower()
        if location_term:
            clauses.append("(LOWER(COALESCE(primary_location, '')) LIKE %s OR LOWER(COALESCE(locations, '')) LIKE %s)")
            params.extend([f"%{location_term}%", f"%{location_term}%"])

        where_sql = " AND ".join(clauses)
        categories_index: Dict[str, Dict[str, Any]] = {}
        connection = self._connect_mysql()
        try:
            cursor_factory = SSDictCursor if SSDictCursor is not None else DictCursor
            with connection.cursor(cursor_factory) as cursor:
                cursor.execute(
                    f"""
                    SELECT standard_categories, categories, store
                    FROM coupons
                    WHERE {where_sql}
                    """,
                    params,
                )
                for row in cursor:
                    store_name = _clean_text(row.get("store"))
                    for category_name in self._extract_category_names(row):
                        slug = _slugify(category_name)
                        entry = categories_index.setdefault(
                            slug,
                            {
                                "id": slug,
                                "name": category_name,
                                "slug": slug,
                                "couponCount": 0,
                                "storeNames": set(),
                            },
                        )
                        entry["couponCount"] += 1
                        if store_name:
                            entry["storeNames"].add(store_name)
        finally:
            connection.close()

        items = self._finalize_categories(categories_index)
        query_term = _clean_text(query).lower()
        if query_term:
            items = [
                item
                for item in items
                if query_term in f"{item.get('name', '')} {item.get('slug', '')} {item.get('headline', '')}".lower()
            ]
        return self._write_direct_cache(cache_key, items)

    def list_categories_live(
        self,
        *,
        query: str = "",
        location: str = "",
        page: int = 1,
        limit: int = 48,
    ) -> tuple[List[Dict[str, Any]], int]:
        if self._prefer_precomputed_summaries:
            precomputed_page = self._fallback_precomputed_category_page(
                query=query,
                location=location,
                page=page,
                limit=limit,
            )
            if precomputed_page is not None:
                return precomputed_page

        if not self._direct_catalog_mode():
            precomputed_page = self._fallback_precomputed_category_page(
                query=query,
                location=location,
                page=page,
                limit=limit,
            )
            if precomputed_page is not None:
                return precomputed_page

            items = [
                self._enrich_category_record(item)
                for item in self.search_categories(query=query)
            ]
            total = len(items)
            normalized_page = max(1, int(page or 1))
            normalized_limit = max(1, int(limit or 48))
            start = (normalized_page - 1) * normalized_limit
            return items[start:start + normalized_limit], total

        try:
            items = self._aggregate_category_rows(query=query, location=location)
        except Exception:
            precomputed_page = self._fallback_precomputed_category_page(
                query=query,
                location=location,
                page=page,
                limit=limit,
            )
            if precomputed_page is not None:
                return precomputed_page
            raise

        total = len(items)
        normalized_page = max(1, int(page or 1))
        normalized_limit = max(1, int(limit or 48))
        start = (normalized_page - 1) * normalized_limit
        return deepcopy(items[start:start + normalized_limit]), total

    def get_category_live(self, identifier: str) -> Optional[Dict[str, Any]]:
        target = _clean_text(identifier).lower()

        if self._prefer_precomputed_summaries:
            precomputed_item = self._fallback_precomputed_category_item(identifier)
            if precomputed_item is not None:
                return precomputed_item

        try:
            for item in self._aggregate_category_rows():
                if target in {
                    _clean_text(item.get("id")).lower(),
                    _clean_text(item.get("slug")).lower(),
                    _clean_text(item.get("name")).lower(),
                }:
                    return self._enrich_category_record(item)
        except Exception:
            pass

        return self._fallback_precomputed_category_item(identifier)

    def _aggregate_location_rows(self, query: str = "") -> List[Dict[str, Any]]:
        cache_key = ("live-location-rows", _clean_text(query).lower())
        cached = self._read_direct_cache(cache_key)
        if cached is not None:
            return cached

        if not self._direct_catalog_mode():
            items = self.search_locations(query=query)
            return self._write_direct_cache(cache_key, items)

        locations_index: Dict[str, Dict[str, Any]] = {}
        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                location_lookup = self._load_location_lookup(cursor)
                for code, name in location_lookup.items():
                    locations_index[code] = {
                        "id": code,
                        "name": name,
                        "code": code,
                        "couponCount": 0,
                        "storeNames": set(),
                    }

                cursor_factory = SSDictCursor if SSDictCursor is not None else DictCursor
            with connection.cursor(cursor_factory) as stream_cursor:
                stream_cursor.execute(
                    """
                    SELECT primary_location, locations, store
                    FROM coupons
                    WHERE TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')
                      AND (end_date IS NULL OR end_date >= CURDATE())
                    """
                )
                for row in stream_cursor:
                    store_name = _clean_text(row.get("store"))
                    for code, name in self._extract_location_tokens(row, None, location_lookup):
                        entry = locations_index.setdefault(
                            code,
                            {
                                "id": code,
                                "name": name,
                                "code": code,
                                "couponCount": 0,
                                "storeNames": set(),
                            },
                        )
                        entry["couponCount"] += 1
                        if store_name:
                            entry["storeNames"].add(store_name)
        finally:
            connection.close()

        items = self._finalize_locations(locations_index)
        query_term = _clean_text(query).lower()
        if query_term:
            items = [
                item
                for item in items
                if query_term in f"{item.get('name', '')} {item.get('code', '')} {item.get('spotlight', '')}".lower()
            ]
        return self._write_direct_cache(cache_key, items)

    def list_locations_live(
        self,
        *,
        query: str = "",
        page: int = 1,
        limit: int = 48,
    ) -> tuple[List[Dict[str, Any]], int]:
        if self._prefer_precomputed_summaries:
            precomputed_page = self._fallback_precomputed_location_page(query=query, page=page, limit=limit)
            if precomputed_page is not None:
                return precomputed_page

        if not self._direct_catalog_mode():
            precomputed_page = self._fallback_precomputed_location_page(query=query, page=page, limit=limit)
            if precomputed_page is not None:
                return precomputed_page

        try:
            items = self._aggregate_location_rows(query=query)
        except Exception:
            precomputed_page = self._fallback_precomputed_location_page(query=query, page=page, limit=limit)
            if precomputed_page is not None:
                return precomputed_page
            raise

        total = len(items)
        normalized_page = max(1, int(page or 1))
        normalized_limit = max(1, int(limit or 48))
        start = (normalized_page - 1) * normalized_limit
        return deepcopy(items[start:start + normalized_limit]), total

    def get_location_live(self, identifier: str) -> Optional[Dict[str, Any]]:
        target = _clean_text(identifier).lower()
        for item in self._aggregate_location_rows():
            if target in {
                _clean_text(item.get("id")).lower(),
                _clean_text(item.get("code")).lower(),
                _clean_text(item.get("name")).lower(),
            }:
                return deepcopy(item)
        return None

    def store_analytics_live(self) -> Dict[str, int]:
        if self._prefer_precomputed_summaries:
            precomputed_analytics = self._fallback_precomputed_analytics()
            if precomputed_analytics is not None:
                return precomputed_analytics

        if not self._direct_catalog_mode():
            return self.store_analytics()

        try:
            return self.store_analytics()
        except Exception:
            pass

        cache_key = ("live-store-analytics",)
        cached = self._read_direct_cache(cache_key)
        if cached is not None:
            return cached

        connection = self._connect_mysql()
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
                total_coupons = int((cursor.fetchone() or {}).get("total") or 0)

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
                total_stores = int((cursor.fetchone() or {}).get("total") or 0)

                cursor.execute(
                    """
                    SELECT COUNT(1) AS total
                    FROM coupons
                    WHERE TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')
                      AND (end_date IS NULL OR end_date >= CURDATE())
                      AND LOWER(COALESCE(featured, '')) = 'yes'
                    """
                )
                featured_coupons = int((cursor.fetchone() or {}).get("total") or 0)

                cursor.execute("SELECT COUNT(1) AS total FROM locations")
                live_markets = int((cursor.fetchone() or {}).get("total") or 0)
        finally:
            connection.close()

        payload = {
            "totalCoupons": total_coupons,
            "totalStores": total_stores,
            "featuredCoupons": featured_coupons,
            "liveMarkets": live_markets,
            "dataSource": "mysql-direct",
            "refreshedAt": datetime.utcnow().isoformat(),
        }
        return self._write_direct_cache(cache_key, payload)

    def _match_loaded_store(self, target_host: str) -> Optional[Dict[str, Any]]:
        best_match: Optional[Dict[str, Any]] = None
        best_rank: Optional[tuple] = None

        for collection_name in ("stores", "storeDirectory"):
            for item in self._data.get(collection_name, []):
                domain_score = self._store_domain_score(item, target_host)

                if domain_score <= 0:
                    continue

                rank = (
                    domain_score,
                    self._bool_score(item.get("featured")),
                    self._pick_numeric(item, "qualityScore", "priorityScore", "editorialScore", "score"),
                    self._pick_numeric(item, "activeCoupons", "active_coupons", "couponCount", "coupon_count"),
                    self._pick_numeric(item, "priority", "brandTier", "weight"),
                    str(item.get("name", "")).strip().lower(),
                )

                if best_rank is None or rank > best_rank:
                    best_rank = rank
                    best_match = item

        if best_match is not None:
            return deepcopy(best_match)

        return None

    def _cached_store_coupons(self, store: Dict[str, Any]) -> List[Dict[str, Any]]:
        coupon_identifiers: List[str] = []

        for key in ("slug", "name"):
            candidate = _clean_text(store.get(key))
            if candidate and candidate.lower() not in {value.lower() for value in coupon_identifiers}:
                coupon_identifiers.append(candidate)

        for identifier in coupon_identifiers:
            coupons = self.search_coupons(store=identifier)
            if coupons:
                return coupons

        return []

    def _build_store_match_payload(
        self,
        target_host: str,
        store: Optional[Dict[str, Any]],
        coupons: Optional[List[Dict[str, Any]]] = None,
        coupon_limit: int = 24,
    ) -> Dict[str, Any]:
        normalized_coupons = list(coupons or [])
        coupon_count = len(normalized_coupons)
        normalized_store = deepcopy(store) if store is not None else None

        if normalized_store is not None:
            normalized_store["activeCoupons"] = coupon_count
            normalized_store["couponCount"] = coupon_count
            normalized_store["hasLiveOffers"] = coupon_count > 0

        return {
            "matched": normalized_store is not None,
            "matchedDomain": target_host,
            "store": normalized_store,
            "couponCount": coupon_count,
            "coupons": normalized_coupons[:coupon_limit],
        }

    def match_store(self, value: str) -> Optional[Dict[str, Any]]:
        self._load_data()
        target_host = _normalize_host(value)

        if not target_host:
            return None

        best_match = self._match_loaded_store(target_host)

        if best_match is not None:
            return best_match

        if not self._db_configured():
            return None

        fallback_rows = self._lookup_store_rows_by_host(target_host)
        fallback_store_row = self._select_store_row(fallback_rows)
        if not fallback_store_row:
            return None

        return self._build_store_directory_record(fallback_store_row, {})

    def match_store_live(self, value: str, coupon_limit: int = 24) -> Dict[str, Any]:
        target_host = _normalize_host(value)

        if not target_host:
            return {
                "matched": False,
                "matchedDomain": "",
                "store": None,
                "couponCount": 0,
                "coupons": [],
            }

        normalized_limit = max(1, int(coupon_limit or 24))

        cache_key = (target_host, normalized_limit)
        cached_payload = self._store_match_cache.get(cache_key)
        if cached_payload is not None:
            return deepcopy(cached_payload)

        if self._direct_catalog_mode():
            store_rows = self._lookup_store_rows_by_host(target_host)
            store_row = self._select_store_row(store_rows)

            if not store_row:
                payload = self._build_store_match_payload(target_host, None, [], normalized_limit)
                self._store_match_cache[cache_key] = deepcopy(payload)
                return payload

            coupon_count, raw_coupons, location_lookup = self._lookup_active_coupons_for_store(
                _clean_text(store_row.get("name")),
                normalized_limit,
            )

            if raw_coupons:
                store = self._build_store_record(_clean_text(store_row.get("name")), store_row, raw_coupons, location_lookup)
                store["activeCoupons"] = coupon_count
                store["couponCount"] = coupon_count
                store["hasLiveOffers"] = coupon_count > 0
            else:
                store = self._build_store_directory_record(store_row, location_lookup)

            coupons = [
                coupon
                for coupon in (
                    self._build_coupon_record(raw_coupon, store, location_lookup)
                    for raw_coupon in raw_coupons
                )
                if coupon is not None
            ]

            payload = {
                "matched": True,
                "matchedDomain": target_host,
                "store": store,
                "couponCount": coupon_count,
                "coupons": coupons[:normalized_limit],
            }
            self._store_match_cache[cache_key] = deepcopy(payload)
            return payload

        self._load_data()
        loaded_store = self._match_loaded_store(target_host)

        if loaded_store is not None:
            payload = self._build_store_match_payload(
                target_host,
                loaded_store,
                self._cached_store_coupons(loaded_store),
                normalized_limit,
            )
            self._store_match_cache[cache_key] = deepcopy(payload)
            return payload

        has_loaded_store_data = bool(self._data.get("stores") or self._data.get("storeDirectory"))
        if has_loaded_store_data or not self._db_configured():
            payload = self._build_store_match_payload(target_host, None, [], normalized_limit)
            self._store_match_cache[cache_key] = deepcopy(payload)
            return payload

        store_rows = self._lookup_store_rows_by_host(target_host)
        store_row = self._select_store_row(store_rows)

        if not store_row:
            payload = self._build_store_match_payload(target_host, None, [], normalized_limit)
            self._store_match_cache[cache_key] = deepcopy(payload)
            return payload

        coupon_count, raw_coupons, location_lookup = self._lookup_active_coupons_for_store(
            _clean_text(store_row.get("name")),
            normalized_limit,
        )

        if raw_coupons:
            store = self._build_store_record(_clean_text(store_row.get("name")), store_row, raw_coupons, location_lookup)
            store["activeCoupons"] = coupon_count
            store["couponCount"] = coupon_count
            store["hasLiveOffers"] = coupon_count > 0
        else:
            store = self._build_store_directory_record(store_row, location_lookup)

        coupons = [
            coupon
            for coupon in (
                self._build_coupon_record(raw_coupon, store, location_lookup)
                for raw_coupon in raw_coupons
            )
            if coupon is not None
        ]

        payload = {
            "matched": True,
            "matchedDomain": target_host,
            "store": store,
            "couponCount": coupon_count,
            "coupons": coupons[:normalized_limit],
        }
        self._store_match_cache[cache_key] = deepcopy(payload)
        return payload

    def _connect_mysql(self):
        if pymysql is None or DictCursor is None:
            raise RuntimeError("pymysql is required for CouponLeo MySQL data loading.")

        connection_kwargs = {
            "host": Config.MYSQL_HOST,
            "port": int(Config.MYSQL_PORT),
            "user": Config.MYSQL_USER,
            "password": Config.MYSQL_PASSWORD,
            "database": Config.MYSQL_DB,
            "cursorclass": DictCursor,
            "charset": "utf8mb4",
            "connect_timeout": max(1, int(Config.MYSQL_CONNECT_TIMEOUT)),
            "read_timeout": max(1, int(Config.MYSQL_READ_TIMEOUT)),
            "write_timeout": max(1, int(Config.MYSQL_WRITE_TIMEOUT)),
        }

        if Config.MYSQL_SSL_REQUIRED:
            connection_kwargs["ssl"] = {"ssl": {}}

        return pymysql.connect(**connection_kwargs)

    def _load_data_from_mysql(self) -> Dict[str, List[Dict[str, Any]]]:
        connection = self._connect_mysql()

        try:
            with connection.cursor() as cursor:
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
                    ORDER BY (end_date IS NOT NULL) DESC, end_date ASC, id DESC
                    """
                )
                raw_coupons = cursor.fetchall()

                if not raw_coupons:
                    return deepcopy(DEFAULT_DATASET)

                store_names = sorted({_clean_text(row.get("store")) for row in raw_coupons if _clean_text(row.get("store"))})
                raw_store_rows = self._load_store_rows(cursor, store_names)
                location_lookup = self._load_location_lookup(cursor)

            return self._build_normalized_dataset(raw_coupons, raw_store_rows, location_lookup)
        finally:
            connection.close()

    def _load_store_rows(self, cursor, store_names: List[str]) -> List[Dict[str, Any]]:
        if not store_names:
            return []

        results: List[Dict[str, Any]] = []
        chunk_size = 250

        for start in range(0, len(store_names), chunk_size):
            chunk = store_names[start:start + chunk_size]
            placeholders = ", ".join(["%s"] * len(chunk))
            results.extend(
                self._fetch_store_rows(
                    cursor,
                    f"name IN ({placeholders})",
                    chunk,
                )
            )

        return results

    def _lookup_store_rows_by_host(self, target_host: str) -> List[Dict[str, Any]]:
        target_host = _normalize_host(target_host)
        if not target_host:
            return []

        host_candidates = [
            target_host,
            f"www.{target_host}",
            f"m.{target_host}",
            f"shop.{target_host}",
            f"store.{target_host}",
        ]
        url_candidates = []
        for host_candidate in host_candidates:
            url_candidates.extend(
                [
                    f"https://{host_candidate}/",
                    f"https://{host_candidate}",
                    f"http://{host_candidate}/",
                    f"http://{host_candidate}",
                ]
            )

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                host_placeholders = ", ".join(["%s"] * len(host_candidates))
                url_placeholders = ", ".join(["%s"] * len(url_candidates))
                rows = self._fetch_store_rows(
                    cursor,
                    f"name IN ({host_placeholders}) OR url IN ({url_placeholders})",
                    [*host_candidates, *url_candidates],
                    order_by_sql="initial_rank_score DESC, authority_tier DESC, id DESC",
                    limit=25,
                )
                if rows:
                    return rows

                return self._fetch_store_rows(
                    cursor,
                    "url LIKE %s OR name LIKE %s",
                    (f"%{target_host}%", f"%{target_host}%"),
                    order_by_sql="initial_rank_score DESC, authority_tier DESC, id DESC",
                    limit=25,
                )
        finally:
            connection.close()

    def _lookup_store_rows_by_query(self, query_term: str, limit: int = 25) -> List[Dict[str, Any]]:
        normalized_query = _clean_text(query_term).lower()
        if not normalized_query:
            return []

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                like_term = f"%{normalized_query}%"
                return self._fetch_store_rows(
                    cursor,
                    "LOWER(name) LIKE %s OR LOWER(url) LIKE %s",
                    (like_term, like_term),
                    order_by_sql="initial_rank_score DESC, authority_tier DESC, id DESC",
                    limit=int(limit),
                )
        finally:
            connection.close()

    def _lookup_active_coupons_for_store(
        self,
        store_name: str,
        coupon_limit: int,
        offset: int = 0,
    ) -> tuple[int, List[Dict[str, Any]], Dict[str, str]]:
        normalized_store_name = _clean_text(store_name)
        if not normalized_store_name:
            return 0, [], {}

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT COUNT(1) AS coupon_count
                    FROM coupons
                    WHERE store = %s
                      AND TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')
                      AND (end_date IS NULL OR end_date >= CURDATE())
                    """,
                    (normalized_store_name,),
                )
                coupon_count = int((cursor.fetchone() or {}).get("coupon_count") or 0)

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
                    WHERE store = %s
                      AND TRIM(COALESCE(store, '')) NOT IN ('', 'unknown')
                      AND (end_date IS NULL OR end_date >= CURDATE())
                    ORDER BY (end_date IS NOT NULL) DESC, end_date ASC, id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (normalized_store_name, int(coupon_limit), max(0, int(offset or 0))),
                )
                raw_coupons = cursor.fetchall()
                location_lookup = self._load_location_lookup(cursor)
                return coupon_count, raw_coupons, location_lookup
        finally:
            connection.close()

    def _load_location_lookup(self, cursor) -> Dict[str, str]:
        cursor.execute("SELECT id, name, code FROM locations")
        rows = cursor.fetchall()
        lookup: Dict[str, str] = {}

        for row in rows:
            code = _clean_text(row.get("code")).upper()
            name = _clean_text(row.get("name"))
            if code and name:
                lookup[code] = name

        return lookup

    def _build_normalized_dataset(
        self,
        raw_coupons: List[Dict[str, Any]],
        raw_store_rows: List[Dict[str, Any]],
        location_lookup: Dict[str, str],
    ) -> Dict[str, List[Dict[str, Any]]]:
        store_rows_by_name: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        coupon_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

        for store_row in raw_store_rows:
            store_key = _lower_text(store_row.get("name"))
            if store_key:
                store_rows_by_name[store_key].append(store_row)

        for raw_coupon in raw_coupons:
            store_key = _lower_text(raw_coupon.get("store"))
            if store_key:
                coupon_groups[store_key].append(raw_coupon)

        stores: List[Dict[str, Any]] = []
        coupons: List[Dict[str, Any]] = []
        categories_index: Dict[str, Dict[str, Any]] = {}
        locations_index: Dict[str, Dict[str, Any]] = {}
        store_lookup: Dict[str, Dict[str, Any]] = {}

        for store_key, grouped_coupons in coupon_groups.items():
            store_name = _clean_text(grouped_coupons[0].get("store"))
            store_row = self._select_store_row(store_rows_by_name.get(store_key, []))
            normalized_store = self._build_store_record(store_name, store_row, grouped_coupons, location_lookup)
            stores.append(normalized_store)
            store_lookup[store_key] = normalized_store

        stores = self._rank_items("stores", stores)
        featured_store_slugs = {store["slug"] for store in stores[: min(12, len(stores))]}

        for store in stores:
            store["featured"] = store.get("slug") in featured_store_slugs

        for store_key, grouped_coupons in coupon_groups.items():
            store = store_lookup.get(store_key)
            if not store:
                continue

            for raw_coupon in grouped_coupons:
                normalized_coupon = self._build_coupon_record(raw_coupon, store, location_lookup)
                if normalized_coupon is None:
                    continue

                coupons.append(normalized_coupon)
                self._index_category(categories_index, normalized_coupon, store)
                self._index_locations(locations_index, raw_coupon, store, location_lookup)

        coupons = self._rank_items("coupons", coupons)
        featured_coupon_ids = {coupon["id"] for coupon in coupons[: min(24, len(coupons))]}
        for coupon in coupons:
            coupon["featured"] = coupon.get("featured") or coupon["id"] in featured_coupon_ids

        categories = self._finalize_categories(categories_index)
        locations = self._finalize_locations(locations_index)
        store_directory = self._build_store_directory(stores, store_rows_by_name, location_lookup)

        return {
            "categories": categories,
            "stores": stores,
            "storeDirectory": store_directory,
            "locations": locations,
            "coupons": coupons,
        }

    def _build_store_directory(
        self,
        active_stores: List[Dict[str, Any]],
        store_rows_by_name: Dict[str, List[Dict[str, Any]]],
        location_lookup: Dict[str, str],
    ) -> List[Dict[str, Any]]:
        directory_by_key: Dict[str, Dict[str, Any]] = {}

        for store in active_stores:
            directory_by_key[_lower_text(store.get("name")) or _lower_text(store.get("slug"))] = deepcopy(store)

        for store_key, store_rows in store_rows_by_name.items():
            if store_key in directory_by_key:
                continue

            store_row = self._select_store_row(store_rows)
            if not store_row:
                continue

            directory_by_key[store_key] = self._build_store_directory_record(store_row, location_lookup)

        return self._rank_items("stores", list(directory_by_key.values()))

    def _select_store_row(self, rows: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not rows:
            return None

        def rank(row: Dict[str, Any]) -> tuple:
            has_logo = int(
                bool(_sanitize_http_url(row.get("logo_horizontal_url")) or _sanitize_http_url(row.get("logo_square_url")))
            )
            return (
                has_logo,
                _pick_numeric(row.get("initial_rank_score")),
                int(bool(_sanitize_http_url(row.get("url")))),
                _pick_numeric(row.get("authority_tier")),
                _pick_numeric(row.get("id")),
            )

        return max(rows, key=rank)

    def _extract_category_names(self, raw_coupon: Dict[str, Any]) -> List[str]:
        raw_categories = _clean_text(raw_coupon.get("standard_categories")) or _clean_text(raw_coupon.get("categories"))
        category_names = [_title_case_words(value) for value in _split_csv_values(raw_categories)]
        return category_names or ["Other"]

    def _extract_location_tokens(
        self,
        raw_coupon: Dict[str, Any],
        store: Optional[Dict[str, Any]],
        location_lookup: Dict[str, str],
    ) -> List[tuple[str, str]]:
        def append_location_tokens(raw_value: str) -> None:
            for location_value in _split_csv_values(raw_value):
                upper_code = location_value.upper()
                canonical_code = upper_code

                if canonical_code not in location_lookup:
                    canonical_code = name_lookup.get(_location_name_key(location_value), _slugify(location_value).upper())

                canonical_name = location_lookup.get(canonical_code, _title_case_words(location_value))
                tokens.append((canonical_code, canonical_name))

        raw_locations = _clean_text(raw_coupon.get("locations"))
        tokens: List[tuple[str, str]] = []
        name_lookup = {_location_name_key(name): code for code, name in location_lookup.items() if name}

        if raw_locations:
            if raw_locations.lower() == "multi country":
                return [("GLOBAL", "Global")]

            append_location_tokens(raw_locations)

        primary_location = _clean_text(raw_coupon.get("primary_location"))
        if primary_location and primary_location.lower() != "multi country":
            append_location_tokens(primary_location)
        elif not tokens and store:
            store_location = _clean_text(store.get("location"))
            if store_location and store_location.lower() != "global":
                append_location_tokens(store_location)

        if not tokens:
            tokens.append(("GLOBAL", "Global"))

        seen = set()
        unique_tokens = []
        for token in tokens:
            if token[0] in seen:
                continue
            seen.add(token[0])
            unique_tokens.append(token)

        return unique_tokens

    def _location_label(
        self,
        raw_coupon: Dict[str, Any],
        store_row: Optional[Dict[str, Any]],
        location_lookup: Dict[str, str],
    ) -> str:
        store_context = None
        if store_row:
            store_location = _clean_text(store_row.get("primary_location"))
            if store_location:
                store_context = {"location": store_location}

        tokens = self._extract_location_tokens(raw_coupon, store_context, location_lookup)
        return tokens[0][1] if tokens else "Global"

    def _coupon_primary_url(self, raw_coupon: Dict[str, Any], store_url: str) -> str:
        for candidate in (
            raw_coupon.get("affiliate_link"),
            raw_coupon.get("deeplink"),
            raw_coupon.get("cashback_link"),
            raw_coupon.get("merchant_home_page"),
            raw_coupon.get("url"),
            store_url,
        ):
            normalized = _sanitize_http_url(candidate)
            if normalized:
                return normalized

        return store_url or "https://couponleo.com"

    def _coupon_logo_urls(self, raw_coupon: Dict[str, Any]) -> tuple[str, str]:
        square_logo = _normalize_logo_url(raw_coupon.get("brand_logo"), "square")
        horizontal_logo = _normalize_logo_url(raw_coupon.get("brand_logo"), "horizontal")
        image_logo = _pick_logo_url(raw_coupon.get("image_url"))

        if not horizontal_logo:
            horizontal_logo = image_logo
        if not square_logo:
            square_logo = image_logo or horizontal_logo

        return horizontal_logo, square_logo

    def _build_store_record(
        self,
        store_name: str,
        store_row: Optional[Dict[str, Any]],
        grouped_coupons: List[Dict[str, Any]],
        location_lookup: Dict[str, str],
    ) -> Dict[str, Any]:
        primary_coupon = max(grouped_coupons, key=self._coupon_priority_key)
        category_counts = Counter()
        location_counts = Counter()

        for raw_coupon in grouped_coupons:
            for category_name in self._extract_category_names(raw_coupon):
                category_counts[category_name] += 1

            location_counts[self._location_label(raw_coupon, store_row, location_lookup)] += 1

        category_name = category_counts.most_common(1)[0][0] if category_counts else "Other"
        location_name = location_counts.most_common(1)[0][0] if location_counts else "Global"
        slug = _slugify(store_name)

        coupon_horizontal_logo, coupon_square_logo = self._coupon_logo_urls(primary_coupon)
        horizontal_logo = _pick_logo_url(
            store_row.get("logo_horizontal_url") if store_row else "",
            coupon_horizontal_logo,
            coupon_square_logo,
        )
        square_logo = _pick_logo_url(
            store_row.get("logo_square_url") if store_row else "",
            coupon_square_logo,
            coupon_horizontal_logo,
        )
        logo_url = _pick_logo_url(horizontal_logo, square_logo, coupon_horizontal_logo, coupon_square_logo)

        if not horizontal_logo:
            horizontal_logo = logo_url
        if not square_logo:
            square_logo = logo_url

        coupon_count = len(grouped_coupons)
        score = self._store_quality_score(store_row, grouped_coupons, bool(logo_url))
        savings = _clean_text(primary_coupon.get("label")) or _clean_text(primary_coupon.get("title")) or "Live savings"
        offer_examples = _collect_offer_examples(grouped_coupons)

        url_candidates = (
            store_row.get("url") if store_row else "",
            primary_coupon.get("merchant_home_page"),
            primary_coupon.get("url"),
            primary_coupon.get("affiliate_link"),
            primary_coupon.get("deeplink"),
        )
        store_url = ""
        for candidate in url_candidates:
            normalized = _sanitize_http_url(candidate)
            if normalized:
                store_url = normalized
                break

        domains = {
            _normalize_host(store_url),
            _normalize_host(store_name),
            _normalize_host(primary_coupon.get("merchant_home_page")),
        }
        domains = {domain for domain in domains if domain}

        category_copy = _shopping_lane_copy(_store_theme_value(category_name, store_row.get("category_hint") if store_row else ""))
        if not category_copy:
            category_copy = category_name.lower() if category_name != "Other" else "store"
        headline = (
            f"{coupon_count} live {category_copy} offers currently visible for {location_name} shoppers."
        )

        return self._enrich_store_record({
            "id": str(store_row.get("id")) if store_row else slug,
            "name": store_name,
            "slug": slug,
            "headline": headline,
            "location": location_name or "Global",
            "category": category_name,
            "category_hint": _clean_text(store_row.get("category_hint")) if store_row else category_name.lower(),
            "activeCoupons": coupon_count,
            "couponCount": coupon_count,
            "savings": savings,
            "featured": False,
            "qualityScore": score,
            "priorityScore": score,
            "url": store_url or "https://couponleo.com",
            "logo_horizontal_url": horizontal_logo,
            "logo_square_url": square_logo,
            "logoUrl": logo_url,
            "image_url": logo_url,
            "websiteDescription": _first_nonempty_text(
                store_row.get("websiteDescription") if store_row else "",
                store_row.get("website_description") if store_row else "",
                store_row.get("merchantDescription") if store_row else "",
                store_row.get("merchant_description") if store_row else "",
            ),
            "websiteMetaDescription": _first_nonempty_text(
                store_row.get("websiteMetaDescription") if store_row else "",
                store_row.get("website_meta_description") if store_row else "",
                store_row.get("metaDescription") if store_row else "",
                store_row.get("meta_description") if store_row else "",
            ),
            "offerExamples": offer_examples,
            "domains": sorted(domains),
            "matchDomains": sorted(domains),
            "hasLiveOffers": True,
        })

    def _build_store_directory_record(
        self,
        store_row: Dict[str, Any],
        location_lookup: Dict[str, str],
    ) -> Dict[str, Any]:
        store_name = _clean_text(store_row.get("name")) or "Unknown store"
        slug = _slugify(store_name)
        store_url = _sanitize_http_url(store_row.get("url")) or "https://couponleo.com"
        horizontal_logo = _pick_logo_url(store_row.get("logo_horizontal_url"))
        square_logo = _pick_logo_url(store_row.get("logo_square_url"))
        logo_url = _pick_logo_url(horizontal_logo, square_logo)

        if not horizontal_logo:
            horizontal_logo = logo_url
        if not square_logo:
            square_logo = logo_url

        location_name = _clean_text(store_row.get("primary_location"))
        if location_name:
            normalized_key = _location_name_key(location_name)
            for code, name in location_lookup.items():
                if _location_name_key(name) == normalized_key:
                    location_name = name
                    break
        else:
            location_name = "Global"

        category_name = _title_case_words(_clean_text(store_row.get("category_hint"))) or "Store"
        domains = {
            _normalize_host(store_url),
            _normalize_host(store_name),
        }
        domains = {domain for domain in domains if domain}
        rank_score = int(max(45, min(92, _pick_numeric(store_row.get("initial_rank_score"), 45))))

        return self._enrich_store_record({
            "id": str(store_row.get("id")) or slug,
            "name": store_name,
            "slug": slug,
            "headline": f"CouponLeo recognizes {store_name}, but there are no live offers for this store right now.",
            "location": location_name,
            "category": category_name,
            "category_hint": _clean_text(store_row.get("category_hint")) or category_name.lower(),
            "activeCoupons": 0,
            "couponCount": 0,
            "savings": "No live offers right now",
            "featured": False,
            "qualityScore": rank_score,
            "priorityScore": rank_score,
            "url": store_url,
            "logo_horizontal_url": horizontal_logo,
            "logo_square_url": square_logo,
            "logoUrl": logo_url,
            "image_url": logo_url,
            "websiteDescription": _first_nonempty_text(
                store_row.get("websiteDescription"),
                store_row.get("website_description"),
                store_row.get("merchantDescription"),
                store_row.get("merchant_description"),
            ),
            "websiteMetaDescription": _first_nonempty_text(
                store_row.get("websiteMetaDescription"),
                store_row.get("website_meta_description"),
                store_row.get("metaDescription"),
                store_row.get("meta_description"),
            ),
            "domains": sorted(domains),
            "matchDomains": sorted(domains),
            "hasLiveOffers": False,
        })

    def _build_coupon_record(
        self,
        raw_coupon: Dict[str, Any],
        store: Dict[str, Any],
        location_lookup: Dict[str, str],
    ) -> Optional[Dict[str, Any]]:
        title = _clean_text(raw_coupon.get("title")) or _clean_text(raw_coupon.get("description"))
        if not title:
            return None

        category_names = self._extract_category_names(raw_coupon)
        primary_category = category_names[0]
        category_alias_slugs = [_slugify(name) for name in category_names]
        expires_at = _ensure_iso(raw_coupon.get("end_date"))
        score = self._coupon_score(raw_coupon, bool(_clean_text(raw_coupon.get("code"))))
        store_url = _clean_text(store.get("url"))
        cta_url = self._coupon_primary_url(raw_coupon, store_url)
        image_url = _sanitize_http_url(raw_coupon.get("image_url"))
        horizontal_logo, square_logo = self._coupon_logo_urls(raw_coupon)

        return {
            "id": raw_coupon.get("id"),
            "slug": _slugify(f"{title}-{raw_coupon.get('id')}"),
            "title": title,
            "description": _clean_text(raw_coupon.get("description")) or _clean_text(raw_coupon.get("label")) or title,
            "code": _clean_text(raw_coupon.get("code")),
            "discountText": _clean_text(raw_coupon.get("label")) or title,
            "type": "code" if _lower_text(raw_coupon.get("type")) == "code" else "deal",
            "storeId": store.get("id"),
            "storeName": store.get("name"),
            "storeSlug": store.get("slug"),
            "categorySlug": _slugify(primary_category),
            "categoryName": primary_category,
            "categoryAliases": category_names,
            "categoryAliasSlugs": category_alias_slugs,
            "featured": _lower_text(raw_coupon.get("featured")) == "yes",
            "verified": False,
            "expiresAt": expires_at,
            "ctaUrl": cta_url,
            "cta_url": cta_url,
            "savingsNote": _clean_text(raw_coupon.get("label")) or _clean_text(raw_coupon.get("description")) or "Fresh verified savings",
            "score": score,
            "rating": _pick_numeric(raw_coupon.get("rating")),
            "url": _sanitize_http_url(raw_coupon.get("url")) or cta_url,
            "deeplink": _sanitize_http_url(raw_coupon.get("deeplink")) or cta_url,
            "affiliate_link": _sanitize_http_url(raw_coupon.get("affiliate_link")) or cta_url,
            "cashback_link": _sanitize_http_url(raw_coupon.get("cashback_link")),
            "merchant_home_page": _sanitize_http_url(raw_coupon.get("merchant_home_page")) or store_url,
            "image_url": image_url or horizontal_logo or square_logo or _clean_text(store.get("logoUrl")),
            "brand_logo": horizontal_logo or square_logo,
            "language": _clean_text(raw_coupon.get("language")) or "en",
            "location": self._location_label(raw_coupon, None, location_lookup),
            "primary_location": _clean_text(raw_coupon.get("primary_location")),
            "locations": _clean_text(raw_coupon.get("locations")),
            "source": _clean_text(raw_coupon.get("source")),
            "status": _clean_text(raw_coupon.get("status")),
            "token": _clean_text(raw_coupon.get("token")),
        }

    def _index_category(self, categories_index: Dict[str, Dict[str, Any]], coupon: Dict[str, Any], store: Dict[str, Any]) -> None:
        category_names = coupon.get("categoryAliases") or [coupon.get("categoryName") or "Other"]

        for category_name in category_names:
            slug = _slugify(category_name)
            entry = categories_index.setdefault(
                slug,
                {
                    "id": slug,
                    "name": category_name,
                    "slug": slug,
                    "couponCount": 0,
                    "storeNames": set(),
                },
            )
            entry["couponCount"] += 1
            entry["storeNames"].add(store.get("name"))

    def _index_locations(
        self,
        locations_index: Dict[str, Dict[str, Any]],
        raw_coupon: Dict[str, Any],
        store: Dict[str, Any],
        location_lookup: Dict[str, str],
    ) -> None:
        for code, name in self._extract_location_tokens(raw_coupon, store, location_lookup):
            entry = locations_index.setdefault(
                code,
                {
                    "id": code,
                    "name": name,
                    "code": code,
                    "couponCount": 0,
                    "storeNames": set(),
                },
            )
            entry["couponCount"] += 1
            entry["storeNames"].add(store.get("name"))

    def _finalize_categories(self, categories_index: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        categories: List[Dict[str, Any]] = []

        for entry in categories_index.values():
            store_count = len(entry["storeNames"])
            headline = f"{entry['couponCount']} live offers across {store_count} stores."
            categories.append(
                self._enrich_category_record(
                    {
                        "id": entry["id"],
                        "name": entry["name"],
                        "slug": entry["slug"],
                        "headline": headline,
                        "couponCount": entry["couponCount"],
                        "storeCount": store_count,
                    }
                )
            )

        return self._rank_items("categories", categories)

    def _finalize_locations(self, locations_index: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        locations: List[Dict[str, Any]] = []

        for entry in locations_index.values():
            store_count = len(entry["storeNames"])
            spotlight = f"{entry['couponCount']} live coupons across {store_count} stores."
            locations.append(
                {
                    "id": entry["id"],
                    "name": entry["name"],
                    "code": entry["code"],
                    "country": entry["name"],
                    "couponCount": entry["couponCount"],
                    "storeCount": store_count,
                    "spotlight": spotlight,
                }
            )

        return self._rank_items("locations", locations)

    def _coupon_priority_key(self, raw_coupon: Dict[str, Any]) -> tuple:
        return (
            int(bool(_clean_text(raw_coupon.get("code")))),
            _pick_numeric(raw_coupon.get("rating")),
            int(bool(_clean_text(raw_coupon.get("label")))),
            _pick_numeric(raw_coupon.get("id")),
        )

    def _coupon_score(self, raw_coupon: Dict[str, Any], has_code: bool) -> int:
        base_score = 68
        base_score += min(18, int(_pick_numeric(raw_coupon.get("rating")) * 9))
        base_score += 6 if has_code else 3
        base_score += 4 if _lower_text(raw_coupon.get("featured")) == "yes" else 0
        if raw_coupon.get("end_date") is None:
            base_score += 3
        return max(60, min(99, base_score))

    def _store_quality_score(
        self,
        store_row: Optional[Dict[str, Any]],
        grouped_coupons: List[Dict[str, Any]],
        has_logo: bool,
    ) -> int:
        coupon_count = len(grouped_coupons)
        avg_rating = sum(_pick_numeric(coupon.get("rating")) for coupon in grouped_coupons) / max(1, coupon_count)
        rank_score = _pick_numeric(store_row.get("initial_rank_score")) if store_row else 40
        coupon_bonus = min(30, int(math.log10(coupon_count + 1) * 16))
        rating_bonus = min(18, int(avg_rating * 9))
        logo_bonus = 8 if has_logo else 0
        return max(55, min(99, int(rank_score + coupon_bonus + rating_bonus + logo_bonus)))

    def _rank_items(self, collection: str, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if collection == "stores":
            return sorted(items, key=self._store_sort_key)
        if collection == "coupons":
            return sorted(items, key=self._coupon_sort_key)
        if collection == "categories":
            return sorted(items, key=self._category_sort_key)
        if collection == "locations":
            return sorted(items, key=self._location_sort_key)
        return items

    def _cached_ranked_items(self, collection: str) -> List[Dict[str, Any]]:
        cached = self._ranked_items_cache.get(collection)
        if cached is not None:
            return cached

        ranked = self._rank_items(collection, self._data.get(collection, []))
        self._ranked_items_cache[collection] = ranked
        return ranked

    def _cached_featured_coupons(self) -> List[Dict[str, Any]]:
        if self._featured_coupon_cache is not None:
            return self._featured_coupon_cache

        featured_items = [item for item in self._data.get("coupons", []) if item.get("featured")]
        self._featured_coupon_cache = self._rank_items("coupons", featured_items)
        return self._featured_coupon_cache

    def _store_sort_key(self, item: Dict[str, Any]) -> tuple:
        return (
            -self._bool_score(item.get("featured")),
            -self._pick_numeric(item, "activeCoupons", "active_coupons", "couponCount", "coupon_count"),
            -self._pick_numeric(item, "qualityScore", "priorityScore", "editorialScore", "score"),
            -self._pick_numeric(item, "priority", "brandTier", "weight"),
            str(item.get("name", "")).strip().lower(),
        )

    def _coupon_sort_key(self, item: Dict[str, Any]) -> tuple:
        return (
            -self._bool_score(item.get("featured")),
            -self._bool_score(item.get("verified")),
            -self._pick_numeric(item, "score", "qualityScore", "priorityScore"),
            str(item.get("storeName", "")).strip().lower(),
            str(item.get("title", "")).strip().lower(),
        )

    def _category_sort_key(self, item: Dict[str, Any]) -> tuple:
        return (
            str(item.get("name", "")).strip().lower() == "other",
            -self._pick_numeric(item, "couponCount", "coupon_count", "storeCount", "store_count"),
            str(item.get("name", "")).strip().lower(),
        )

    def _location_sort_key(self, item: Dict[str, Any]) -> tuple:
        return (
            -self._pick_numeric(item, "couponCount", "coupon_count", "storeCount", "store_count"),
            str(item.get("name", "")).strip().lower(),
        )

    def _store_domain_score(self, item: Dict[str, Any], target_host: str) -> int:
        best_score = 0

        for candidate in self._store_host_candidates(item):
            if candidate == target_host:
                best_score = max(best_score, 400)
                continue

            if target_host.endswith(f".{candidate}"):
                best_score = max(best_score, 320)
                continue

            if candidate.endswith(f".{target_host}"):
                best_score = max(best_score, 260)

        return best_score

    def _store_host_candidates(self, item: Dict[str, Any]) -> set[str]:
        candidates = {
            _normalize_host(str(item.get("url", ""))),
            _normalize_host(str(item.get("link", ""))),
            _normalize_host(str(item.get("merchant_home_page", ""))),
            _normalize_host(str(item.get("name", ""))),
        }

        for key in ("domains", "matchDomains", "match_domains", "aliases"):
            value = item.get(key)

            if isinstance(value, str):
                raw_values = re.split(r"[\s,]+", value)
            elif isinstance(value, list):
                raw_values = value
            else:
                continue

            for raw_value in raw_values:
                candidates.add(_normalize_host(str(raw_value)))

        return {candidate for candidate in candidates if candidate}

    def _pick_numeric(self, item: Dict[str, Any], *keys: str) -> float:
        for key in keys:
            value = item.get(key)
            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                continue
            return numeric_value
        return 0.0

    def _bool_score(self, value: Any) -> int:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return int(value > 0)
        if isinstance(value, str):
            return int(value.strip().lower() in {"1", "true", "yes", "featured"})
        return 0


repository = CouponLeoRepository(Config.DATA_FILE)

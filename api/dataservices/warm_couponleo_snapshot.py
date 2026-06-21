from __future__ import annotations

import argparse
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from pathlib import Path
from threading import local
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import ProxyHandler, Request, build_opener

try:
    import requests
except ImportError:  # pragma: no cover - optional runtime dependency
    requests = None


DEFAULT_API_BASE = "https://couponleo.com/couponleo/api"
DEFAULT_LIMIT = 250
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_WORKERS = 4
REQUEST_STATE = local()


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


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


def _is_blocked_logo_url(value: Any) -> bool:
    parsed = urlparse(_clean_text(value))
    return bool(parsed.netloc) and parsed.netloc.lower().endswith(".r2.dev")


def _page_url(api_base: str, collection: str, page: int, limit: int) -> str:
    base = api_base.rstrip("/")
    query = urlencode({"page": page, "limit": limit})
    return f"{base}/{collection}?{query}"


def _request_json(url: str, timeout_seconds: int) -> dict[str, Any]:
    if requests is not None:
        session = getattr(REQUEST_STATE, "session", None)
        if session is None:
            session = requests.Session()
            session.trust_env = False
            REQUEST_STATE.session = session

        for attempt in range(5):
            response = session.get(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "CouponLeoLocalSnapshot/1.0",
                },
                timeout=timeout_seconds,
            )

            if response.status_code == 429:
                retry_after_header = _clean_text(response.headers.get("Retry-After"))
                retry_after = int(retry_after_header) if retry_after_header.isdigit() else min(30, 2 ** attempt)
                time.sleep(max(1, retry_after))
                continue

            response.raise_for_status()
            return response.json()

        response.raise_for_status()

    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "CouponLeoLocalSnapshot/1.0",
        },
    )
    opener = build_opener(ProxyHandler({}))
    with opener.open(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def _fetch_page(api_base: str, collection: str, page: int, limit: int, timeout_seconds: int) -> tuple[int, list[dict[str, Any]], int]:
    payload = _request_json(_page_url(api_base, collection, page, limit), timeout_seconds)
    items = payload.get("items") or payload.get("data") or []
    total = int(payload.get("total") or len(items))
    if not isinstance(items, list):
        raise ValueError(f"Unexpected payload for {collection} page {page}.")
    return page, items, total


def _fetch_collection(
    api_base: str,
    collection: str,
    limit: int,
    timeout_seconds: int,
    max_workers: int,
) -> list[dict[str, Any]]:
    first_page, first_items, total = _fetch_page(api_base, collection, 1, limit, timeout_seconds)
    _ = first_page

    if total <= len(first_items):
        return first_items

    effective_page_size = max(1, len(first_items))
    total_pages = max(1, math.ceil(total / effective_page_size))
    items_by_page: dict[int, list[dict[str, Any]]] = {1: first_items}
    worker_count = max_workers if collection != "coupons" else min(max_workers, 2)

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_map = {
            executor.submit(_fetch_page, api_base, collection, page, effective_page_size, timeout_seconds): page
            for page in range(2, total_pages + 1)
        }

        for future in as_completed(future_map):
            page, items, _ = future.result()
            items_by_page[page] = items

    merged_items: list[dict[str, Any]] = []
    for page in range(1, total_pages + 1):
        merged_items.extend(items_by_page.get(page, []))

    return merged_items


def _best_coupon_logo(coupon: dict[str, Any]) -> str:
    for candidate in (
        coupon.get("brand_logo"),
        coupon.get("image_url"),
        coupon.get("merchant_home_page"),
        coupon.get("url"),
    ):
        normalized = _sanitize_http_url(candidate)
        if normalized and not _is_blocked_logo_url(normalized):
            return normalized

    return ""


def _normalize_store_logos(stores: list[dict[str, Any]], coupons: list[dict[str, Any]]) -> None:
    coupon_logo_index: dict[str, str] = {}

    for coupon in coupons:
        logo_url = _best_coupon_logo(coupon)
        if not logo_url:
            continue

        for candidate_key in (
            _clean_text(coupon.get("storeId")).lower(),
            _clean_text(coupon.get("storeSlug")).lower(),
            _clean_text(coupon.get("storeName")).lower(),
        ):
            if candidate_key and candidate_key not in coupon_logo_index:
                coupon_logo_index[candidate_key] = logo_url

    for store in stores:
        replacement_logo = ""
        for candidate_key in (
            _clean_text(store.get("id")).lower(),
            _clean_text(store.get("slug")).lower(),
            _clean_text(store.get("name")).lower(),
        ):
            replacement_logo = coupon_logo_index.get(candidate_key, "")
            if replacement_logo:
                break

        if not replacement_logo:
            continue

        for field_name in ("logoUrl", "logo_horizontal_url", "logo_square_url", "image_url"):
            current_value = store.get(field_name)
            if not _sanitize_http_url(current_value) or _is_blocked_logo_url(current_value):
                store[field_name] = replacement_logo


def _dedupe_items(collection: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_keys: set[tuple[str, ...]] = set()
    deduped_items: list[dict[str, Any]] = []

    key_fields = {
        "stores": ("id", "slug", "name"),
        "coupons": ("id", "slug"),
        "categories": ("id", "slug", "name"),
        "locations": ("id", "code", "name"),
    }.get(collection, ("id", "slug", "name"))

    for item in items:
        key = tuple(_clean_text(item.get(field_name)).lower() for field_name in key_fields)
        if not any(key):
            continue
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped_items.append(item)

    return deduped_items


def build_snapshot(
    api_base: str,
    limit: int,
    timeout_seconds: int,
    max_workers: int,
) -> dict[str, list[dict[str, Any]]]:
    stores = _fetch_collection(api_base, "stores", limit, timeout_seconds, max_workers)
    coupons = _fetch_collection(api_base, "coupons", limit, timeout_seconds, max_workers)
    categories = _fetch_collection(api_base, "categories", limit, timeout_seconds, max_workers)
    locations = _fetch_collection(api_base, "locations", limit, timeout_seconds, max_workers)

    stores = _dedupe_items("stores", stores)
    coupons = _dedupe_items("coupons", coupons)
    categories = _dedupe_items("categories", categories)
    locations = _dedupe_items("locations", locations)

    _normalize_store_logos(stores, coupons)

    return {
        "categories": categories,
        "stores": stores,
        "storeDirectory": deepcopy(stores),
        "locations": locations,
        "coupons": coupons,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Warm a local CouponLeo snapshot from the live public API.")
    parser.add_argument(
        "--api-base",
        default=DEFAULT_API_BASE,
        help="Upstream CouponLeo API base URL.",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent / "data" / "local-couponleo-data.json"),
        help="Output JSON snapshot path.",
    )
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Page size per upstream request.")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="Per-request timeout in seconds.")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Parallel workers for paginated fetches.")
    args = parser.parse_args()

    output_path = Path(args.output).expanduser()

    try:
        snapshot = build_snapshot(
            api_base=args.api_base,
            limit=max(1, min(args.limit, 250)),
            timeout_seconds=max(5, args.timeout),
            max_workers=max(1, args.workers),
        )
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        print(f"Failed to warm CouponLeo snapshot: {exc}")
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(f"Saved CouponLeo snapshot to {output_path}")
    print(
        "Snapshot totals: "
        f"{len(snapshot['stores'])} stores, "
        f"{len(snapshot['coupons'])} coupons, "
        f"{len(snapshot['categories'])} categories, "
        f"{len(snapshot['locations'])} locations"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

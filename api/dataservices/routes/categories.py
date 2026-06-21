from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from flask import Blueprint, abort, jsonify, request

from data.repository import repository
from routes.listing_utils import list_response, paginate_items, parse_limit_arg, parse_page_arg

categories_bp = Blueprint("categories", __name__)


def _payload() -> dict:
    payload = request.get_json(silent=True) or {}
    if not payload.get("name"):
        abort(400, description="Category name is required.")
    return payload


def _coupon_is_live(coupon: dict) -> bool:
    expires_at = str(coupon.get("expiresAt") or "").strip()
    if not expires_at:
        return True

    try:
        expiry = datetime.strptime(expires_at, "%Y-%m-%d").date()
    except ValueError:
        return True

    return expiry >= datetime.utcnow().date()


def _coupon_matches_location(coupon: dict, location: str) -> bool:
    if not location:
        return True

    normalized_location = location.strip().lower()
    candidates = {
        str(coupon.get("location") or "").strip().lower(),
        str(coupon.get("primary_location") or "").strip().lower(),
    }
    return normalized_location in candidates


def _location_category_items(query: str, location: str) -> list[dict]:
    categories_by_slug = {
        str(category.get("slug") or ""): category
        for category in repository.list_items("categories")
    }
    aggregates: dict[str, dict] = defaultdict(lambda: {"couponCount": 0, "stores": set(), "name": "", "headline": ""})

    for coupon in repository.list_items("coupons"):
        if not _coupon_is_live(coupon) or not _coupon_matches_location(coupon, location):
            continue

        slug = str(coupon.get("categorySlug") or "").strip()
        if not slug:
            continue

        known_category = categories_by_slug.get(slug, {})
        aggregate = aggregates[slug]
        aggregate["couponCount"] += 1
        aggregate["name"] = str(known_category.get("name") or coupon.get("categoryName") or slug).strip()
        aggregate["headline"] = str(known_category.get("headline") or "").strip()
        aggregate["stores"].add(str(coupon.get("storeSlug") or coupon.get("storeId") or "").strip())

    items: list[dict] = []
    normalized_query = query.strip().lower()
    for slug, aggregate in aggregates.items():
        coupon_count = aggregate["couponCount"]
        store_count = len([store for store in aggregate["stores"] if store])
        headline = aggregate["headline"] or f"{coupon_count} live offers across {store_count} stores."
        item = {
            "id": slug,
            "name": aggregate["name"],
            "slug": slug,
            "headline": headline,
            "couponCount": coupon_count,
            "storeCount": store_count,
        }
        haystack = f"{item['name']} {item['headline']}".lower()
        if normalized_query and normalized_query not in haystack:
            continue
        items.append(item)

    return sorted(items, key=lambda item: (-int(item.get("couponCount") or 0), str(item.get("name") or "").lower()))


@categories_bp.get("")
@categories_bp.get("/")
def list_categories():
    query = request.args.get("q", "")
    location = request.args.get("location", "")
    all_items = _location_category_items(query, location) if location else (
        repository.search_categories(query=query) if query else repository.list_items("categories")
    )
    page = parse_page_arg()
    limit = parse_limit_arg(default=48, maximum=250)
    items, meta = paginate_items(all_items, page, limit)
    return list_response(items, len(all_items), meta)


@categories_bp.get("/tree")
def category_tree():
    query = request.args.get("q", "")
    all_items = repository.search_categories(query=query) if query else repository.list_items("categories")
    page = parse_page_arg()
    limit = parse_limit_arg(default=48, maximum=250)
    items, meta = paginate_items(all_items, page, limit)
    tree = [{"id": item["id"], "name": item["name"], "slug": item["slug"], "children": []} for item in items]
    return list_response(tree, len(all_items), meta)


@categories_bp.get("/<identifier>")
def get_category(identifier: str):
    item = repository.get_item("categories", identifier)
    if item is None:
        abort(404, description="Category not found.")
    return jsonify({"data": item})


@categories_bp.post("")
@categories_bp.post("/")
def create_category():
    item = repository.create_item("categories", _payload())
    return jsonify({"data": item}), 201


@categories_bp.put("/<identifier>")
def update_category(identifier: str):
    item = repository.update_item("categories", identifier, _payload())
    if item is None:
        abort(404, description="Category not found.")
    return jsonify({"data": item})


@categories_bp.delete("/<identifier>")
def delete_category(identifier: str):
    deleted = repository.delete_item("categories", identifier)
    if not deleted:
        abort(404, description="Category not found.")
    return jsonify({"deleted": True})

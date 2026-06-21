from __future__ import annotations

from flask import Blueprint, abort, jsonify, request

from data.repository import repository
from routes.listing_utils import list_response, parse_bool_arg, parse_limit_arg, parse_page_arg

stores_bp = Blueprint("stores", __name__)


def _payload() -> dict:
    payload = request.get_json(silent=True) or {}
    if not payload.get("name"):
        abort(400, description="Store name is required.")
    return payload


@stores_bp.get("")
@stores_bp.get("/")
def list_stores():
    query = request.args.get("q", "")
    category = request.args.get("category", "")
    location = request.args.get("location", "")
    starts_with = request.args.get("startsWith", "")
    featured = parse_bool_arg("featured")
    limit = parse_limit_arg(default=48, maximum=10000) or 48
    page = parse_page_arg()
    items, total = repository.list_stores_live(
        query=query,
        category=category,
        location=location,
        featured=featured,
        starts_with=starts_with,
        page=page,
        limit=limit,
    )
    page_count = max(1, (total + limit - 1) // limit)
    return list_response(
        items,
        total,
        {
            "page": page,
            "pageCount": page_count,
            "pageSize": limit,
            "hasNextPage": page < page_count,
            "hasPreviousPage": page > 1,
        },
    )


@stores_bp.get("/analytics/summary")
def store_analytics():
    return jsonify({"data": repository.store_analytics_live()})


@stores_bp.get("/match")
def match_store():
    target = (request.args.get("url") or request.args.get("domain") or "").strip()
    matched_domain = repository.normalize_store_host(target)

    if not matched_domain:
        abort(400, description="A valid url or domain query parameter is required.")

    coupon_limit = parse_limit_arg(default=24, maximum=1000, name="coupon_limit", aliases=()) or 24
    match_payload = repository.match_store_live(target, coupon_limit=coupon_limit)
    store = match_payload.get("store")
    coupons = match_payload.get("coupons", [])
    coupon_count = int(match_payload.get("couponCount") or 0)

    return jsonify(
        {
            "data": {
                "matched": bool(match_payload.get("matched")),
                "matchedDomain": match_payload.get("matchedDomain") or matched_domain,
                "store": store,
                "couponCount": coupon_count,
                "coupons": coupons,
            }
        }
    )


@stores_bp.get("/name/<name>")
def store_by_name(name: str):
    item = repository.get_store_live(name)
    if item is None:
        abort(404, description="Store not found.")
    return jsonify({"data": item})


@stores_bp.get("/location/<location>")
def stores_by_location(location: str):
    limit = parse_limit_arg(default=48, maximum=10000) or 48
    page = parse_page_arg()
    items, total = repository.list_stores_live(location=location, page=page, limit=limit)
    page_count = max(1, (total + limit - 1) // limit)
    return list_response(
        items,
        total,
        {
            "page": page,
            "pageCount": page_count,
            "pageSize": limit,
            "hasNextPage": page < page_count,
            "hasPreviousPage": page > 1,
        },
    )


@stores_bp.get("/<identifier>")
def get_store(identifier: str):
    item = repository.get_store_live(identifier)
    if item is None:
        abort(404, description="Store not found.")
    return jsonify({"data": item})


@stores_bp.post("")
@stores_bp.post("/")
def create_store():
    item = repository.create_item("stores", _payload())
    return jsonify({"data": item}), 201


@stores_bp.put("/<identifier>")
def update_store(identifier: str):
    item = repository.update_item("stores", identifier, _payload())
    if item is None:
        abort(404, description="Store not found.")
    return jsonify({"data": item})


@stores_bp.delete("/<identifier>")
def delete_store(identifier: str):
    deleted = repository.delete_item("stores", identifier)
    if not deleted:
        abort(404, description="Store not found.")
    return jsonify({"deleted": True})

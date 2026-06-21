from __future__ import annotations

from datetime import datetime

from flask import Blueprint, abort, jsonify, request

from data.repository import repository
from routes.listing_utils import list_response, paginate_items, parse_bool_arg, parse_limit_arg, parse_page_arg

coupons_bp = Blueprint("coupons", __name__)


def _payload() -> dict:
    payload = request.get_json(silent=True) or {}
    if not payload.get("title"):
        abort(400, description="Coupon title is required.")
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


def _filtered_coupons(query: str = "", category: str = "", store: str = "") -> list[dict]:
    if query or category or store:
        return repository.search_coupons(query=query, category=category, store=store)
    return repository.list_items("coupons")


def _respond_with_coupons(items: list[dict]) -> object:
    location = request.args.get("location", "")
    featured = parse_bool_arg("featured")
    active = parse_bool_arg("active")
    page = parse_page_arg()
    limit = parse_limit_arg(default=48, maximum=250)

    filtered_items = items
    if location:
        filtered_items = [item for item in filtered_items if _coupon_matches_location(item, location)]
    if featured is not None:
        filtered_items = [item for item in filtered_items if bool(item.get("featured")) is featured]
    if active is not None:
        filtered_items = [item for item in filtered_items if _coupon_is_live(item) is active]

    paged_items, meta = paginate_items(filtered_items, page, limit)
    return list_response(paged_items, len(filtered_items), meta)


@coupons_bp.get("")
@coupons_bp.get("/")
def list_coupons():
    query = request.args.get("q", "")
    category = request.args.get("category", "")
    store = request.args.get("store", "")
    return _respond_with_coupons(_filtered_coupons(query=query, category=category, store=store))


@coupons_bp.get("/featured")
def featured_coupons():
    return _respond_with_coupons(repository.get_featured_coupons())


@coupons_bp.get("/search")
def search_coupons():
    return _respond_with_coupons(
        _filtered_coupons(
            query=request.args.get("q", ""),
            category=request.args.get("category", ""),
            store=request.args.get("store", ""),
        )
    )


@coupons_bp.get("/store/<store_slug>")
def coupons_by_store(store_slug: str):
    return _respond_with_coupons(_filtered_coupons(store=store_slug))


@coupons_bp.get("/<identifier>")
def get_coupon(identifier: str):
    item = repository.get_item("coupons", identifier)
    if item is None:
        abort(404, description="Coupon not found.")
    return jsonify({"data": item})


@coupons_bp.post("")
@coupons_bp.post("/")
def create_coupon():
    item = repository.create_item("coupons", _payload())
    return jsonify({"data": item}), 201


@coupons_bp.put("/<identifier>")
def update_coupon(identifier: str):
    item = repository.update_item("coupons", identifier, _payload())
    if item is None:
        abort(404, description="Coupon not found.")
    return jsonify({"data": item})


@coupons_bp.delete("/<identifier>")
def delete_coupon(identifier: str):
    deleted = repository.delete_item("coupons", identifier)
    if not deleted:
        abort(404, description="Coupon not found.")
    return jsonify({"deleted": True})

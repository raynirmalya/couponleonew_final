from __future__ import annotations

from flask import Blueprint, abort, jsonify, request

from data.repository import repository
from data.offer_feedback_store import OfferFeedbackStore
from offer_quality import prepare_offers
from offer_verification import annotate_offers
from routes.listing_utils import list_response, parse_bool_arg, parse_limit_arg, parse_page_arg

coupons_bp = Blueprint("coupons", __name__)
feedback_store = OfferFeedbackStore()


def _payload() -> dict:
    payload = request.get_json(silent=True) or {}
    if not payload.get("title"):
        abort(400, description="Coupon title is required.")
    return payload


def _coupon_response(
    *,
    query: str = "",
    category: str = "",
    store: str = "",
    force_featured: bool | None = None,
) -> object:
    page = parse_page_arg()
    limit = parse_limit_arg(default=48, maximum=250) or 48
    items, total = repository.list_coupons_live(
        query=query,
        category=category,
        store=store,
        location=request.args.get("location", ""),
        featured=force_featured if force_featured is not None else parse_bool_arg("featured"),
        active=parse_bool_arg("active"),
        page=page,
        limit=limit,
    )
    items = prepare_offers(items)
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


@coupons_bp.get("")
@coupons_bp.get("/")
def list_coupons():
    return _coupon_response(
        query=request.args.get("q", ""),
        category=request.args.get("category", ""),
        store=request.args.get("store", ""),
    )


@coupons_bp.get("/featured")
def featured_coupons():
    return _coupon_response(force_featured=True)


@coupons_bp.get("/search")
def search_coupons():
    return _coupon_response(
        query=request.args.get("q", ""),
        category=request.args.get("category", ""),
        store=request.args.get("store", ""),
    )


@coupons_bp.get("/store/<store_slug>")
def coupons_by_store(store_slug: str):
    return _coupon_response(store=store_slug)


@coupons_bp.get("/<identifier>")
def get_coupon(identifier: str):
    item = repository.get_coupon_live(identifier)
    if item is None:
        abort(404, description="Coupon not found.")
    prepared = prepare_offers([item])
    return jsonify({"data": prepared[0] if prepared else annotate_offers([item])[0]})


@coupons_bp.get("/<identifier>/verification")
def get_coupon_verification(identifier: str):
    item = repository.get_coupon_live(identifier)
    if item is None:
        abort(404, description="Coupon not found.")
    prepared = prepare_offers([item])
    verified = prepared[0] if prepared else annotate_offers([item])[0]
    response = jsonify({"data": verified["verification"]})
    response.headers["Cache-Control"] = "no-store"
    return response


@coupons_bp.post("/<identifier>/feedback")
def report_coupon_feedback(identifier: str):
    item = repository.get_coupon_live(identifier)
    if item is None:
        abort(404, description="Coupon not found.")
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        abort(400, description="A JSON feedback payload is required.")
    try:
        recorded = feedback_store.record(item, payload.get('outcome'), request.remote_addr or '')
    except ValueError as error:
        abort(400, description=str(error))
    message = ("Thanks. Your report will be reviewed; it does not verify this offer."
               if recorded else "We already received a report for this offer today.")
    response = jsonify({"data": {"recorded": recorded, "message": message}})
    response.status_code = 202
    response.headers["Cache-Control"] = "no-store"
    return response


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

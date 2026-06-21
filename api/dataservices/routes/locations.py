from __future__ import annotations

from flask import Blueprint, abort, jsonify, request

from data.repository import repository
from routes.listing_utils import list_response, parse_limit_arg, parse_page_arg

locations_bp = Blueprint("locations", __name__)


def _payload() -> dict:
    payload = request.get_json(silent=True) or {}
    if not payload.get("name"):
        abort(400, description="Location name is required.")
    return payload


@locations_bp.get("")
@locations_bp.get("/")
def list_locations():
    query = request.args.get("q", "")
    page = parse_page_arg()
    limit = parse_limit_arg(default=48, maximum=250) or 48
    items, total = repository.list_locations_live(query=query, page=page, limit=limit)
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


@locations_bp.get("/<identifier>")
def get_location(identifier: str):
    item = repository.get_location_live(identifier)
    if item is None:
        abort(404, description="Location not found.")
    return jsonify({"data": item})


@locations_bp.post("")
@locations_bp.post("/")
def create_location():
    item = repository.create_item("locations", _payload())
    return jsonify({"data": item}), 201


@locations_bp.put("/<identifier>")
def update_location(identifier: str):
    item = repository.update_item("locations", identifier, _payload())
    if item is None:
        abort(404, description="Location not found.")
    return jsonify({"data": item})


@locations_bp.delete("/<identifier>")
def delete_location(identifier: str):
    deleted = repository.delete_item("locations", identifier)
    if not deleted:
        abort(404, description="Location not found.")
    return jsonify({"deleted": True})

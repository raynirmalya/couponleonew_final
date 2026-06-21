from __future__ import annotations

from flask import Blueprint, abort, jsonify, request

from data.repository import repository
from routes.listing_utils import list_response, paginate_items, parse_limit_arg, parse_page_arg

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
    all_items = repository.search_locations(query=query) if query else repository.list_items("locations")
    page = parse_page_arg()
    limit = parse_limit_arg(default=48, maximum=250)
    items, meta = paginate_items(all_items, page, limit)
    return list_response(items, len(all_items), meta)


@locations_bp.get("/<identifier>")
def get_location(identifier: str):
    item = repository.get_item("locations", identifier)
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

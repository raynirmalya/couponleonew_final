from __future__ import annotations

from flask import Blueprint, abort, jsonify, request

from data.repository import repository
from routes.listing_utils import list_response, parse_limit_arg, parse_page_arg

categories_bp = Blueprint("categories", __name__)


def _payload() -> dict:
    payload = request.get_json(silent=True) or {}
    if not payload.get("name"):
        abort(400, description="Category name is required.")
    return payload


@categories_bp.get("")
@categories_bp.get("/")
def list_categories():
    query = request.args.get("q", "")
    location = request.args.get("location", "")
    page = parse_page_arg()
    limit = parse_limit_arg(default=48, maximum=1000) or 48
    items, total = repository.list_categories_live(query=query, location=location, page=page, limit=limit)
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


@categories_bp.get("/tree")
def category_tree():
    query = request.args.get("q", "")
    page = parse_page_arg()
    limit = parse_limit_arg(default=48, maximum=1000) or 48
    items, total = repository.list_categories_live(query=query, page=page, limit=limit)
    page_count = max(1, (total + limit - 1) // limit)
    tree = [{"id": item["id"], "name": item["name"], "slug": item["slug"], "children": []} for item in items]
    return list_response(
        tree,
        total,
        {
            "page": page,
            "pageCount": page_count,
            "pageSize": limit,
            "hasNextPage": page < page_count,
            "hasPreviousPage": page > 1,
        },
    )


@categories_bp.get("/<identifier>")
def get_category(identifier: str):
    item = repository.get_category_live(identifier)
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

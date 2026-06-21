from __future__ import annotations

from flask import Blueprint, abort, jsonify, request

from data.blog_repository import blog_repository
from routes.listing_utils import parse_bool_arg, parse_limit_arg, parse_page_arg

articles_bp = Blueprint("articles", __name__)


@articles_bp.get("")
@articles_bp.get("/")
def list_articles():
    query = request.args.get("q", "")
    source = request.args.get("source", "")
    topic = request.args.get("topic", "")
    featured = parse_bool_arg("featured")
    limit = parse_limit_arg(default=12, maximum=100)
    page = parse_page_arg()

    items, total = blog_repository.list_articles(
        query=query,
        source=source,
        topic=topic,
        featured=featured,
        page=page,
        limit=limit or 12,
    )
    page_size = limit or 12
    page_count = max(1, (total + page_size - 1) // page_size)
    return jsonify(
        {
            "data": items,
            "items": items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pageCount": page_count,
            "hasNextPage": page < page_count,
            "hasPreviousPage": page > 1,
        }
    )


@articles_bp.get("/<identifier>")
def get_article(identifier: str):
    item = blog_repository.get_article(identifier)
    if item is None:
        abort(404, description="Article not found.")
    return jsonify({"data": item})

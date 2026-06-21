from __future__ import annotations

from math import ceil
from typing import Iterable, Sequence

from flask import abort, jsonify, request


def parse_limit_arg(
    default: int | None = None,
    maximum: int | None = 250,
    name: str = "limit",
    aliases: tuple[str, ...] = ("pageSize",),
) -> int | None:
    raw_value = ""
    for key in (name, *aliases):
        raw_value = (request.args.get(key) or "").strip()
        if raw_value:
            break

    if not raw_value:
        return default

    try:
        parsed_value = int(raw_value)
    except ValueError:
        abort(400, description="Invalid limit parameter.")

    if maximum is None:
        return max(1, parsed_value)

    return max(1, min(parsed_value, maximum))


def parse_page_arg(default: int = 1) -> int:
    raw_value = (request.args.get("page") or "").strip()

    if not raw_value:
        return default

    try:
        return max(1, int(raw_value))
    except ValueError:
        abort(400, description="Invalid page parameter.")


def parse_bool_arg(name: str) -> bool | None:
    raw_value = (request.args.get(name) or "").strip().lower()

    if not raw_value:
        return None

    if raw_value in {"1", "true", "yes", "on"}:
        return True

    if raw_value in {"0", "false", "no", "off"}:
        return False

    abort(400, description=f"Invalid {name} parameter.")


def paginate_items(items: Sequence[dict], page: int, limit: int | None) -> tuple[list[dict], dict[str, int | bool | None]]:
    total = len(items)

    if limit is None or limit <= 0:
        return list(items), {
            "hasNextPage": False,
            "hasPreviousPage": False,
            "page": 1,
            "pageCount": 1,
            "pageSize": total,
        }

    page_count = max(1, ceil(total / limit))
    safe_page = min(max(page, 1), page_count)
    start = (safe_page - 1) * limit
    end = start + limit

    return list(items[start:end]), {
        "hasNextPage": safe_page < page_count,
        "hasPreviousPage": safe_page > 1,
        "page": safe_page,
        "pageCount": page_count,
        "pageSize": limit,
    }


def list_response(items: Iterable[dict], total: int, meta: dict[str, int | bool | None] | None = None):
    items_list = list(items)
    payload = {"data": items_list, "items": items_list, "total": total}
    if meta:
        payload.update(meta)
    return jsonify(payload)

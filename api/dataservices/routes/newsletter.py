from __future__ import annotations

import secrets

from flask import Blueprint, abort, jsonify, request

from config import Config
from data.newsletter_store import NewsletterSubscriptionStore
from data.repository import repository

newsletter_bp = Blueprint("newsletter", __name__)
newsletter_store = NewsletterSubscriptionStore(Config.NEWSLETTER_DATA_FILE)
_LOOPBACK_VALUES = {"127.0.0.1", "::1", "localhost"}


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _request_host() -> str:
    return (request.headers.get("X-Forwarded-Host") or request.host or "").split(":")[0].strip().lower()


def _client_ip() -> str:
    forwarded_for = request.headers.get("CF-Connecting-IP") or request.headers.get("X-Real-IP") or ""
    if forwarded_for:
        return _clean_text(forwarded_for)

    forwarded_chain = _clean_text(request.headers.get("X-Forwarded-For"))
    if forwarded_chain:
        return _clean_text(forwarded_chain.split(",")[0])

    return _clean_text(request.remote_addr)


def _is_loopback_request() -> bool:
    client_ip = _client_ip().lower()
    host = _request_host()
    return client_ip in _LOOPBACK_VALUES or host in _LOOPBACK_VALUES


def _admin_authorized() -> bool:
    configured_key = _clean_text(Config.TELEMETRY_ADMIN_KEY)
    provided_key = _clean_text(request.headers.get("X-Telemetry-Admin-Key"))
    return bool(
        _is_loopback_request()
        and configured_key
        and provided_key
        and secrets.compare_digest(configured_key, provided_key)
    )


def _parse_int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    raw_value = request.args.get(name, "")
    if not raw_value:
        return default

    try:
        parsed_value = int(raw_value)
    except (TypeError, ValueError):
        abort(400, description=f"{name} must be an integer.")

    return max(minimum, min(parsed_value, maximum))


@newsletter_bp.post("/subscriptions")
def create_newsletter_subscription():
    if not Config.ENABLE_NEWSLETTER_SUBSCRIPTIONS:
        abort(405, description="Newsletter subscriptions are disabled.")

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        abort(400, description="A JSON subscription payload is required.")

    try:
        subscription, preview = newsletter_store.upsert_subscription(payload, repository)
    except ValueError as error:
        abort(400, description=str(error))

    return jsonify(
        {
            "data": {
                "subscription": subscription,
                "preview": preview,
            }
        }
    )


@newsletter_bp.get("/subscriptions")
def list_newsletter_subscriptions():
    if not _admin_authorized():
        abort(403, description="Telemetry admin authorization is required.")

    page = _parse_int_arg("page", default=1, minimum=1, maximum=5000)
    page_size = _parse_int_arg("pageSize", default=25, minimum=1, maximum=100)
    status_filter = _clean_text(request.args.get("status")).lower()
    search = _clean_text(request.args.get("search")).lower()

    raw_items = newsletter_store.list_subscriptions()
    counts: dict[str, int] = {}
    items = []

    for item in raw_items:
        status = _clean_text(item.get("status") or "active").lower() or "active"
        counts[status] = counts.get(status, 0) + 1

        search_haystack = " ".join(
            [
                _clean_text(item.get("email")),
                _clean_text(item.get("fullName")),
                _clean_text(item.get("country")),
                _clean_text(item.get("locale")),
                _clean_text(item.get("sourcePath")),
                _clean_text(item.get("provider")),
            ]
        ).lower()

        if status_filter and status_filter not in {"all", status}:
            continue
        if search and search not in search_haystack:
            continue

        items.append(
            {
                "id": _clean_text(item.get("id")),
                "email": _clean_text(item.get("email")),
                "fullName": _clean_text(item.get("fullName")),
                "provider": _clean_text(item.get("provider") or "email"),
                "locale": _clean_text(item.get("locale") or "en-US"),
                "country": _clean_text(item.get("country") or "all"),
                "sourcePath": _clean_text(item.get("sourcePath") or "/"),
                "status": status,
                "alertsEnabled": bool(item.get("alertsEnabled")),
                "createdAt": _clean_text(item.get("createdAt")),
                "updatedAt": _clean_text(item.get("updatedAt")),
                "lastPreviewAt": _clean_text((item.get("lastPreview") or {}).get("generatedAt")),
                "wishlistCount": len(item.get("wishlist") or []),
            }
        )

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    paged_items = items[start:end]

    return jsonify(
        {
            "data": {
                "items": paged_items,
                "page": page,
                "pageSize": page_size,
                "total": total,
                "pageCount": max(1, (total + page_size - 1) // page_size) if total else 0,
                "hasPreviousPage": page > 1,
                "hasNextPage": end < total,
                "counts": {
                    **counts,
                    "total": len(raw_items),
                },
            }
        }
    )

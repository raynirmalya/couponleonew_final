from __future__ import annotations

import hashlib
import json
import secrets
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Iterable, List

from flask import Blueprint, abort, jsonify, request

from config import Config
from data.telemetry_repository import telemetry_repository

telemetry_bp = Blueprint("telemetry", __name__)

_LOOPBACK_VALUES = {"127.0.0.1", "::1", "localhost"}
_UNKNOWN_COUNTRY_CODES = {"", "XX", "T1"}
_ALL_MARKET_VALUES = {"all", "all markets"}
_LOOPBACK_GEO_CACHE_TTL_SECONDS = 60
_loopback_geo_cache: Dict[str, Any] = {}


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _truncate_text(value: Any, limit: int) -> str:
    return _clean_text(value)[:limit]


def _normalize_market_value(value: Any, limit: int = 160) -> str:
    normalized_value = _truncate_text(value, limit)
    if normalized_value.lower() in _ALL_MARKET_VALUES:
        return ""
    return normalized_value


def _parse_int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    raw_value = request.args.get(name, "")
    if not raw_value:
        return default

    try:
        parsed_value = int(raw_value)
    except (TypeError, ValueError):
        abort(400, description=f"{name} must be an integer.")

    return max(minimum, min(parsed_value, maximum))


def _first_present(values: Iterable[Any]) -> str:
    for value in values:
        normalized_value = _clean_text(value)
        if normalized_value:
            return normalized_value
    return ""


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


def _forwarded_for() -> str:
    return _truncate_text(request.headers.get("X-Forwarded-For"), 512)


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


def _read_public_geo_payload(url: str) -> Dict[str, Any]:
    geo_request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "CouponLeoTelemetry/1.0",
        },
        method="GET",
    )

    with urllib.request.urlopen(geo_request, timeout=3) as response:
        body = response.read().decode("utf-8", errors="replace")
        return json.loads(body or "{}")


def _resolve_loopback_geo() -> Dict[str, str]:
    global _loopback_geo_cache

    now = time.time()
    cached_at = float(_loopback_geo_cache.get("cachedAt") or 0)
    if _loopback_geo_cache and now - cached_at < _LOOPBACK_GEO_CACHE_TTL_SECONDS:
        return {
            "countryCode": _truncate_text(_loopback_geo_cache.get("countryCode"), 16).upper(),
            "countryName": _truncate_text(_loopback_geo_cache.get("countryName"), 160),
            "regionName": _truncate_text(_loopback_geo_cache.get("regionName"), 160),
            "cityName": _truncate_text(_loopback_geo_cache.get("cityName"), 160),
            "locationSource": "server_geo",
        }

    providers = (
        ("https://ipapi.co/json/", lambda payload: {
            "countryCode": _truncate_text(payload.get("country_code"), 16).upper(),
            "countryName": _truncate_text(payload.get("country_name"), 160),
            "regionName": _truncate_text(payload.get("region"), 160),
            "cityName": _truncate_text(payload.get("city"), 160),
        }),
        ("https://ipwho.is/", lambda payload: {
            "countryCode": _truncate_text(payload.get("country_code"), 16).upper(),
            "countryName": _truncate_text(payload.get("country"), 160),
            "regionName": _truncate_text(payload.get("region"), 160),
            "cityName": _truncate_text(payload.get("city"), 160),
        } if payload.get("success", True) is not False else {}),
    )

    for url, parser in providers:
        try:
            payload = _read_public_geo_payload(url)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, ValueError):
            continue

        location = parser(payload)
        if not any(location.values()):
            continue

        _loopback_geo_cache = {
            **location,
            "cachedAt": now,
        }
        return {
            **location,
            "locationSource": "server_geo",
        }

    return {}


def _resolve_location(client_event: Dict[str, Any]) -> Dict[str, str]:
    selected_country = _truncate_text(client_event.get("selectedCountry"), 160)
    selected_country_location = _normalize_market_value(client_event.get("selectedCountry"))
    client_country_code = _truncate_text(client_event.get("countryCode"), 16).upper()
    client_country_name = _truncate_text(client_event.get("countryName"), 160)
    client_region_name = _truncate_text(client_event.get("regionName"), 160)
    client_city_name = _truncate_text(client_event.get("cityName"), 160)

    edge_country_code = _first_present(
        [
            request.headers.get("CF-IPCountry"),
            request.headers.get("X-Country-Code"),
            request.headers.get("X-Geo-Country-Code"),
            request.headers.get("X-AppEngine-Country"),
        ]
    ).upper()
    if edge_country_code in _UNKNOWN_COUNTRY_CODES:
        edge_country_code = ""
    if client_country_code in _UNKNOWN_COUNTRY_CODES:
        client_country_code = ""

    edge_country_name = _first_present(
        [
            request.headers.get("X-Country-Name"),
            request.headers.get("X-Geo-Country-Name"),
            request.headers.get("CloudFront-Viewer-Country-Name"),
        ]
    )
    edge_region_name = _first_present(
        [
            request.headers.get("X-Region-Name"),
            request.headers.get("X-Geo-Region"),
            request.headers.get("X-AppEngine-Region"),
        ]
    )
    edge_city_name = _first_present(
        [
            request.headers.get("X-City-Name"),
            request.headers.get("X-Geo-City"),
            request.headers.get("X-AppEngine-City"),
        ]
    )

    country_code = edge_country_code or client_country_code
    country_name = edge_country_name or client_country_name
    region_name = edge_region_name or client_region_name
    city_name = edge_city_name or client_city_name

    if edge_country_code or edge_country_name or edge_region_name or edge_city_name:
        location_source = "edge_headers"
    elif client_country_code or client_country_name or client_region_name or client_city_name:
        location_source = "browser_geo"
    elif _is_loopback_request():
        loopback_geo = _resolve_loopback_geo()
        if loopback_geo:
            country_code = country_code or _truncate_text(loopback_geo.get("countryCode"), 16).upper()
            country_name = country_name or _truncate_text(loopback_geo.get("countryName"), 160)
            region_name = region_name or _truncate_text(loopback_geo.get("regionName"), 160)
            city_name = city_name or _truncate_text(loopback_geo.get("cityName"), 160)
            location_source = _truncate_text(loopback_geo.get("locationSource"), 32) or "server_geo"
        else:
            country_name = country_name or selected_country_location or "Local development"
            city_name = city_name or "localhost"
            location_source = "loopback"
    elif selected_country_location:
        country_name = country_name or selected_country_location
        location_source = "ui_selection"
    else:
        location_source = "unknown"

    return {
        "countryCode": country_code,
        "countryName": country_name,
        "regionName": region_name,
        "cityName": city_name,
        "locationSource": location_source,
    }


def _enrich_event(client_event: Dict[str, Any]) -> Dict[str, Any]:
    selected_country = _truncate_text(client_event.get("selectedCountry"), 160)
    client_ip = _client_ip()
    forwarded_for = _forwarded_for()
    ip_seed = client_ip or forwarded_for or _truncate_text(request.headers.get("User-Agent"), 1024) or "unknown"
    ip_hash = hashlib.sha256(ip_seed.encode("utf-8")).hexdigest()
    location_payload = _resolve_location(client_event)

    metadata = client_event.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {"value": metadata} if metadata not in (None, "", [], {}) else {}

    metadata = {
        **metadata,
        "ingest": {
            "requestPath": request.path,
            "origin": _truncate_text(request.headers.get("Origin"), 255),
            "requestId": _truncate_text(request.headers.get("X-Request-Id"), 64),
            "loopback": _is_loopback_request(),
        },
    }

    return {
        **client_event,
        "selectedCountry": selected_country,
        "userAgent": _truncate_text(request.headers.get("User-Agent"), 1024),
        "ipAddress": client_ip if Config.TELEMETRY_STORE_RAW_IP else "",
        "ipHash": ip_hash,
        "forwardedFor": forwarded_for if Config.TELEMETRY_STORE_RAW_IP else "",
        "requestHost": _truncate_text(_request_host(), 255),
        "requestMethod": _truncate_text(request.method, 16),
        "source": _truncate_text(client_event.get("source"), 32) or "couponleo-ui",
        "metadata": metadata,
        **location_payload,
    }


def _coerce_event_batch(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        raw_events = payload
    elif isinstance(payload, dict):
        if isinstance(payload.get("events"), list):
            raw_events = payload["events"]
        elif isinstance(payload.get("event"), dict):
            raw_events = [payload["event"]]
        else:
            abort(400, description="A telemetry events array is required.")
    else:
        abort(400, description="A telemetry JSON payload is required.")

    limit = max(1, int(Config.TELEMETRY_BATCH_LIMIT))
    if len(raw_events) > limit:
        abort(413, description=f"Telemetry batches are limited to {limit} events per request.")

    normalized_events = [event for event in raw_events if isinstance(event, dict)]
    if not normalized_events:
        abort(400, description="At least one telemetry event object is required.")

    return normalized_events


@telemetry_bp.post("/events")
def ingest_telemetry_events():
    if not Config.ENABLE_TELEMETRY:
        abort(405, description="Telemetry ingestion is disabled.")

    payload = request.get_json(silent=True)
    client_events = _coerce_event_batch(payload)
    enriched_events = [_enrich_event(event) for event in client_events]
    stored_count = telemetry_repository.store_events(enriched_events)

    return jsonify(
        {
            "data": {
                "accepted": len(enriched_events),
                "stored": stored_count,
                "enabled": True,
            }
        }
    )


@telemetry_bp.get("/summary")
def telemetry_summary():
    if not _admin_authorized():
        abort(404, description="Not found.")

    days = _parse_int_arg("days", Config.TELEMETRY_DEFAULT_WINDOW_DAYS, 1, 90)
    limit = _parse_int_arg("limit", 10, 1, 50)
    return jsonify({"data": telemetry_repository.summary(days=days, limit=limit)})


@telemetry_bp.get("/events")
def telemetry_events():
    if not _admin_authorized():
        abort(404, description="Not found.")

    page = _parse_int_arg("page", 1, 1, 10_000)
    page_size = _parse_int_arg("pageSize", 50, 1, 200)
    days = _parse_int_arg("days", Config.TELEMETRY_DEFAULT_WINDOW_DAYS, 1, 90)
    event_type = _truncate_text(request.args.get("eventType"), 64)
    page_path = _truncate_text(request.args.get("pagePath"), 512)

    items, total = telemetry_repository.list_events(
        page=page,
        limit=page_size,
        days=days,
        event_type=event_type,
        page_path=page_path,
    )

    page_count = max(1, (total + page_size - 1) // page_size) if total else 1

    return jsonify(
        {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pageCount": page_count,
            "hasNextPage": page < page_count,
            "hasPreviousPage": page > 1,
            "filters": {
                "days": days,
                "eventType": event_type,
                "pagePath": page_path,
            },
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "pageSize": page_size,
                "pageCount": page_count,
                "hasNextPage": page < page_count,
                "hasPreviousPage": page > 1,
            },
        }
    )

"""Cached, inventory-backed country and category landing page data."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from threading import Lock
from time import monotonic

from flask import Blueprint, jsonify, request

from data.repository import repository
from offer_quality import prepare_offers

seo_groupings_bp = Blueprint("seo_groupings", __name__)
_lock = Lock()
_cached: tuple[float, dict, dict] | None = None
_CACHE_SECONDS = 900
_MIN_COUPONS = 10
_MIN_STORES = 3
_EXCLUDED_CATEGORIES = {"coupons", "deals", "general", "other", "others"}


def _slug(name: str) -> str:
    if name == "United States of America":
        return "us"
    return "-".join(name.lower().split())


def _active(coupon: dict, today: str) -> bool:
    expiry = str(coupon.get("expiresAt") or "").strip()[:10]
    if not expiry:
        return True
    try:
        return datetime.strptime(expiry, "%Y-%m-%d").date().isoformat() >= today
    except ValueError:
        return True


def _quality(coupon: dict) -> tuple:
    return (
        bool(coupon.get("verified")),
        bool(coupon.get("featured")),
        float(coupon.get("score") or 0),
    )


def _build_index() -> tuple[dict, dict]:
    locations = {
        str(item.get("name") or ""): item
        for item in repository.items_view("locations")
        if len(str(item.get("code") or "")) == 2 and item.get("code") != "EU"
    }
    categories = {
        str(item.get("slug") or ""): str(item.get("name") or "")
        for item in repository.items_view("categories")
        if str(item.get("slug") or "") not in _EXCLUDED_CATEGORIES
    }
    counts: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"couponCount": 0, "stores": set(), "picks": {}}
    )
    today = datetime.now(timezone.utc).date().isoformat()

    for coupon in repository.items_view("coupons"):
        if not _active(coupon, today):
            continue
        location = str(coupon.get("location") or coupon.get("primary_location") or "").strip()
        if location not in locations:
            continue
        store = str(coupon.get("storeSlug") or "").strip()
        if not store:
            continue
        category = str(coupon.get("categorySlug") or "").strip()
        keys = [(location, "")]
        if category in categories:
            keys.append((location, category))
        for key in keys:
            entry = counts[key]
            entry["couponCount"] += 1
            entry["stores"].add(store)
            previous = entry["picks"].get(store)
            if previous is None or _quality(coupon) > _quality(previous):
                entry["picks"][store] = coupon

    countries = []
    groups = []
    highlights = {}
    for (location, category), entry in counts.items():
        count = entry["couponCount"]
        store_count = len(entry["stores"])
        if count < _MIN_COUPONS or store_count < _MIN_STORES:
            continue
        country_slug = _slug(location)
        picks = sorted(entry["picks"].values(), key=_quality, reverse=True)[:12]
        highlights[(country_slug, category)] = {"items": picks, "total": count}
        if category:
            groups.append({
                "countrySlug": country_slug,
                "countryName": location,
                "categorySlug": category,
                "categoryName": categories[category],
                "couponCount": count,
                "storeCount": store_count,
            })
        else:
            countries.append({
                "slug": country_slug,
                "name": location,
                "couponCount": count,
                "storeCount": store_count,
            })

    public = {
        "countries": sorted(countries, key=lambda item: (-item["couponCount"], item["name"])),
        "groups": sorted(groups, key=lambda item: (-item["couponCount"], item["countryName"], item["categoryName"])),
    }
    return public, highlights


def _index() -> tuple[dict, dict]:
    global _cached
    now = monotonic()
    with _lock:
        if _cached is None or now - _cached[0] >= _CACHE_SECONDS:
            public, highlights = _build_index()
            _cached = (now, public, highlights)
        return _cached[1], _cached[2]


@seo_groupings_bp.get("/groupings")
def list_seo_groupings():
    return jsonify(_index()[0])


@seo_groupings_bp.get("/highlights")
def list_seo_highlights():
    country = request.args.get("country", "").strip().lower()
    category = request.args.get("category", "").strip().lower()
    if not country or not all(part.isalnum() for part in country.split("-")):
        return jsonify({"items": [], "total": 0}), 400
    result = _index()[1].get((country, category))
    if result is None:
        return jsonify({"items": [], "total": 0}), 404
    return jsonify({"items": prepare_offers(result["items"]), "total": result["total"]})

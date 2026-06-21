from __future__ import annotations

import json
import re
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Tuple


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
WISHLIST_ITEM_KINDS = {"store", "category", "deal", "coupon"}
LANGUAGE_HINTS = {
    "de": ("de", "deutsch", "german"),
    "en": ("en", "english"),
    "fr": ("fr", "francais", "français", "french"),
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _clean_text(value: Any, limit: int = 0) -> str:
    text = str(value or "").strip()
    return text[:limit] if limit > 0 else text


def _lower_text(value: Any) -> str:
    return _clean_text(value).lower()


def _slug_from_route(route: str, prefix: str) -> str:
    normalized_route = _clean_text(route)
    if not normalized_route.startswith(prefix):
        return ""

    return normalized_route[len(prefix):].split("?", 1)[0].strip("/")


class NewsletterSubscriptionStore:
    def __init__(self, data_file: str) -> None:
        self._path = Path(data_file).resolve()
        self._lock = Lock()

    def upsert_subscription(self, payload: Dict[str, Any], repository: Any) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        record = self._normalize_payload(payload)
        preview = self._build_curated_preview(record, repository)
        email_key = record["email"].lower()
        now = _utc_now_iso()

        with self._lock:
            subscriptions = self._read_subscriptions()
            existing = subscriptions.get(email_key, {})

            record["id"] = existing.get("id") or uuid.uuid4().hex
            record["createdAt"] = existing.get("createdAt") or now
            record["updatedAt"] = now
            record["status"] = "active"
            record["lastPreview"] = preview

            subscriptions[email_key] = record
            self._write_subscriptions(subscriptions)

        return deepcopy(record), preview

    def list_subscriptions(self) -> List[Dict[str, Any]]:
        with self._lock:
            subscriptions = self._read_subscriptions()

        items = [deepcopy(item) for item in subscriptions.values()]
        items.sort(
            key=lambda item: (
                _lower_text(item.get("updatedAt") or item.get("createdAt")),
                _lower_text(item.get("email")),
            ),
            reverse=True,
        )
        return items

    def _read_subscriptions(self) -> Dict[str, Dict[str, Any]]:
        if not self._path.is_file():
            return {}

        try:
            with self._path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return {}

        items = payload.get("subscriptions", []) if isinstance(payload, dict) else []
        subscriptions: Dict[str, Dict[str, Any]] = {}

        for item in items:
            if not isinstance(item, dict):
                continue
            email = _lower_text(item.get("email"))
            if not email:
                continue
            subscriptions[email] = item

        return subscriptions

    def _write_subscriptions(self, subscriptions: Dict[str, Dict[str, Any]]) -> None:
        ordered_items = sorted(
            (deepcopy(item) for item in subscriptions.values()),
            key=lambda item: (_lower_text(item.get("email")), _lower_text(item.get("updatedAt"))),
        )
        payload = {"subscriptions": ordered_items}

        self._path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._path.with_suffix(f"{self._path.suffix}.tmp")
        with temp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        try:
            temp_path.replace(self._path)
        except PermissionError:
            # Windows can intermittently deny the final rename even when the file itself is writable.
            with self._path.open("w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
            try:
                temp_path.unlink()
            except OSError:
                pass

    def _normalize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        email = _clean_text(payload.get("email"), limit=254).lower()
        if not EMAIL_PATTERN.match(email):
            raise ValueError("A valid signed-in email address is required.")

        locale = _clean_text(payload.get("locale"), limit=32) or "en-US"
        country = _clean_text(payload.get("country"), limit=96) or "all"
        source_path = _clean_text(payload.get("sourcePath"), limit=240) or "/"
        full_name = _clean_text(payload.get("fullName"), limit=120)
        provider = _clean_text(payload.get("provider"), limit=24).lower() or "email"
        if provider not in {"email", "google"}:
            provider = "email"

        wishlist_items = []
        for raw_item in payload.get("wishlist", [])[:24]:
            if not isinstance(raw_item, dict):
                continue

            kind = _clean_text(raw_item.get("kind"), limit=24).lower()
            route = _clean_text(raw_item.get("route"), limit=240)
            title = _clean_text(raw_item.get("title"), limit=120)
            subtitle = _clean_text(raw_item.get("subtitle"), limit=140)
            description = _clean_text(raw_item.get("description"), limit=240)

            if kind not in WISHLIST_ITEM_KINDS or not route or not title:
                continue

            wishlist_items.append(
                {
                    "id": _clean_text(raw_item.get("id"), limit=96) or route,
                    "kind": kind,
                    "title": title,
                    "subtitle": subtitle,
                    "description": description,
                    "route": route,
                    "savedAt": _clean_text(raw_item.get("savedAt"), limit=48),
                }
            )

        return {
            "email": email,
            "fullName": full_name,
            "provider": provider,
            "locale": locale,
            "country": country,
            "sourcePath": source_path if source_path.startswith("/") else "/",
            "wishlist": wishlist_items,
            "alertsEnabled": True,
        }

    def _build_curated_preview(self, subscription: Dict[str, Any], repository: Any) -> Dict[str, Any]:
        preferred_country = subscription["country"]
        preferred_locale = subscription["locale"]
        preferred_language = preferred_locale.split("-", 1)[0].lower()
        wishlist = subscription["wishlist"]

        curated_items: List[Dict[str, Any]] = []
        seen_keys = set()

        for wishlist_item in wishlist:
            target_coupons = self._wishlist_coupon_candidates(wishlist_item, repository)
            for coupon in target_coupons:
                if not self._coupon_matches_country(coupon, preferred_country):
                    continue

                score, reasons = self._coupon_score(coupon, wishlist_item, preferred_country, preferred_language)
                if score <= 0:
                    continue

                item_key = f"{coupon.get('storeSlug')}::{coupon.get('title')}"
                if item_key in seen_keys:
                    continue

                seen_keys.add(item_key)
                curated_items.append(self._to_alert_item(coupon, reasons, score))

        for coupon in repository.get_featured_coupons():
            if not self._coupon_matches_country(coupon, preferred_country):
                continue

            score, reasons = self._coupon_score(coupon, None, preferred_country, preferred_language)
            if score <= 0:
                continue

            item_key = f"{coupon.get('storeSlug')}::{coupon.get('title')}"
            if item_key in seen_keys:
                continue

            seen_keys.add(item_key)
            curated_items.append(self._to_alert_item(coupon, reasons, score))

            if len(curated_items) >= 8:
                break

        curated_items.sort(key=lambda item: (-int(item.get("score") or 0), _lower_text(item.get("storeName")), _lower_text(item.get("title"))))
        curated_items = curated_items[:6]

        wishlist_count = len(wishlist)
        locale_label = preferred_locale or "en-US"
        audience_country = "All Markets" if preferred_country == "all" else preferred_country
        summary = (
            f"{len(curated_items)} curated alert candidates for {audience_country} in {locale_label}, "
            f"using {wishlist_count} wishlist signal{'s' if wishlist_count != 1 else ''}."
        )

        return {
            "generatedAt": _utc_now_iso(),
            "deliveryMode": "preview_only",
            "audience": {
                "country": preferred_country,
                "locale": preferred_locale,
                "wishlistCount": wishlist_count,
            },
            "summary": summary,
            "items": curated_items,
        }

    def _wishlist_coupon_candidates(self, wishlist_item: Dict[str, Any], repository: Any) -> List[Dict[str, Any]]:
        kind = wishlist_item.get("kind")
        route = wishlist_item.get("route", "")
        title = wishlist_item.get("title", "")

        if kind == "store":
            store_slug = _slug_from_route(route, "/stores/")
            if store_slug:
                return repository.search_coupons(store=store_slug)
        elif kind == "category":
            category_slug = _slug_from_route(route, "/categories/")
            if category_slug:
                return repository.search_coupons(category=category_slug)
        elif kind in {"deal", "coupon"}:
            store_slug = _slug_from_route(route, "/stores/")
            if store_slug:
                return repository.search_coupons(store=store_slug)
            return repository.search_coupons(query=title)

        return []

    def _coupon_matches_country(self, coupon: Dict[str, Any], preferred_country: str) -> bool:
        if preferred_country == "all":
            return True

        location = _lower_text(coupon.get("location") or coupon.get("primary_location"))
        return location == _lower_text(preferred_country)

    def _coupon_score(
        self,
        coupon: Dict[str, Any],
        wishlist_item: Dict[str, Any] | None,
        preferred_country: str,
        preferred_language: str,
    ) -> Tuple[int, List[str]]:
        reasons: List[str] = []
        score = int(float(coupon.get("score") or 0))

        if preferred_country != "all" and self._coupon_matches_country(coupon, preferred_country):
            score += 24
            reasons.append(f"Matches your {preferred_country} region")

        coupon_language = _lower_text(coupon.get("language"))
        if preferred_language and self._language_matches(coupon_language, preferred_language):
            score += 18
            reasons.append(f"Fits your {preferred_language.upper()} language preference")

        if wishlist_item:
            score += 32
            if wishlist_item.get("kind") == "store":
                reasons.append(f"Comes from wishlist store {wishlist_item.get('title')}")
            elif wishlist_item.get("kind") == "category":
                reasons.append(f"Matches wishlist category {wishlist_item.get('title')}")
            else:
                reasons.append(f"Related to wishlist item {wishlist_item.get('title')}")

        if not reasons:
            reasons.append("Strong featured offer from the current catalog")

        return score, reasons

    def _language_matches(self, raw_language: str, preferred_language: str) -> bool:
        if not raw_language:
            return preferred_language == "en"

        normalized_language = raw_language.lower()
        hints = LANGUAGE_HINTS.get(preferred_language, (preferred_language,))
        return any(normalized_language.startswith(hint) or hint in normalized_language for hint in hints)

    def _to_alert_item(self, coupon: Dict[str, Any], reasons: List[str], score: int) -> Dict[str, Any]:
        store_slug = _clean_text(coupon.get("storeSlug"), limit=120)
        route = f"/stores/{store_slug}" if store_slug else "/top-deals"
        return {
            "title": _clean_text(coupon.get("title"), limit=160),
            "storeName": _clean_text(coupon.get("storeName"), limit=120),
            "discountText": _clean_text(coupon.get("discountText"), limit=120),
            "location": _clean_text(coupon.get("location"), limit=96) or "Global",
            "language": _clean_text(coupon.get("language"), limit=32) or "en",
            "route": route,
            "ctaUrl": _clean_text(coupon.get("ctaUrl"), limit=240),
            "reasons": reasons[:3],
            "score": score,
        }

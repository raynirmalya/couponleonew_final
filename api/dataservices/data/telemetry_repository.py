from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from config import Config

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:  # pragma: no cover - safe fallback for environments without MySQL support
    pymysql = None
    DictCursor = None


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _truncate_text(value: Any, limit: int) -> str:
    return _clean_text(value)[:limit]


def _safe_int(value: Any) -> Optional[int]:
    raw_value = _clean_text(value)
    if not raw_value:
        return None

    try:
        parsed = int(float(raw_value))
    except (TypeError, ValueError):
        return None

    return max(0, parsed)


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        raw_value = _clean_text(value)
        if not raw_value:
            return datetime.utcnow()

        normalized_value = raw_value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized_value)
        except ValueError:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                try:
                    parsed = datetime.strptime(raw_value, fmt)
                    break
                except ValueError:
                    continue
            else:
                return datetime.utcnow()

    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)

    return parsed


def _json_safe(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return _truncate_text(value, 500)

    if value is None:
        return None

    if isinstance(value, (str, int, float, bool)):
        return _truncate_text(value, 2000) if isinstance(value, str) else value

    if isinstance(value, dict):
        safe_object: Dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= 40:
                break
            safe_object[_truncate_text(key, 120)] = _json_safe(item, depth + 1)
        return safe_object

    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item, depth + 1) for item in list(value)[:40]]

    return _truncate_text(value, 500)


def _serialize_metadata(value: Any) -> Optional[str]:
    if value in (None, "", [], {}):
        return None

    return json.dumps(_json_safe(value), ensure_ascii=False, separators=(",", ":"))


def _serialize_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    return _clean_text(value)


def _serialize_date(value: Any) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return _clean_text(value)


class CouponleoTelemetryRepository:
    def __init__(self) -> None:
        data_dir = Path(__file__).resolve().parent
        self._schema_sql = (data_dir / "telemetry_schema.sql").read_text(encoding="utf-8")
        self._fallback_file = data_dir / "telemetry_events.local.jsonl"
        self._mysql_ready = False
        self._mysql_retry_after: Optional[datetime] = None

    def _db_configured(self) -> bool:
        return all(
            [
                Config.MYSQL_HOST,
                Config.MYSQL_PORT,
                Config.MYSQL_DB,
                Config.MYSQL_USER,
                Config.MYSQL_PASSWORD,
            ]
        )

    def _connect_mysql(self):
        if pymysql is None or DictCursor is None:
            raise RuntimeError("pymysql is required for CouponLeo telemetry MySQL access.")

        connection_kwargs = {
            "host": Config.MYSQL_HOST,
            "port": int(Config.MYSQL_PORT),
            "user": Config.MYSQL_USER,
            "password": Config.MYSQL_PASSWORD,
            "database": Config.MYSQL_DB,
            "cursorclass": DictCursor,
            "charset": "utf8mb4",
            "connect_timeout": max(1, int(Config.TELEMETRY_MYSQL_CONNECT_TIMEOUT)),
            "read_timeout": max(1, int(Config.TELEMETRY_MYSQL_READ_TIMEOUT)),
            "write_timeout": max(1, int(Config.TELEMETRY_MYSQL_WRITE_TIMEOUT)),
            "autocommit": False,
        }

        if Config.MYSQL_SSL_REQUIRED:
            connection_kwargs["ssl"] = {"ssl": {}}

        return pymysql.connect(**connection_kwargs)

    def _mark_mysql_ready(self) -> None:
        self._mysql_ready = True
        self._mysql_retry_after = None

    def _mark_mysql_failure(self) -> None:
        self._mysql_ready = False
        cooldown_seconds = max(5, int(Config.TELEMETRY_MYSQL_RETRY_COOLDOWN_SECONDS))
        self._mysql_retry_after = datetime.utcnow() + timedelta(seconds=cooldown_seconds)

    def _mysql_retry_blocked(self) -> bool:
        return bool(self._mysql_retry_after and self._mysql_retry_after > datetime.utcnow())

    def ensure_table(self) -> bool:
        if not self._db_configured():
            return False

        if self._mysql_ready:
            return True

        if self._mysql_retry_blocked():
            return False

        try:
            connection = self._connect_mysql()
        except Exception:
            self._mark_mysql_failure()
            return False

        try:
            with connection.cursor() as cursor:
                cursor.execute(self._schema_sql)
            connection.commit()
            self._mark_mysql_ready()
        finally:
            connection.close()

        return True

    def _load_fallback_rows(self) -> List[Dict[str, Any]]:
        if not self._fallback_file.is_file():
            return []

        rows: List[Dict[str, Any]] = []
        for raw_line in self._fallback_file.read_text(encoding="utf-8").splitlines():
            normalized_line = raw_line.strip()
            if not normalized_line:
                continue

            try:
                row = json.loads(normalized_line)
            except json.JSONDecodeError:
                continue

            if not isinstance(row, dict):
                continue

            rows.append(
                {
                    **row,
                    "occurred_at": _parse_datetime(row.get("occurred_at")),
                    "received_at": _parse_datetime(row.get("received_at")),
                }
            )

        return rows

    def _write_fallback_rows(self, rows: Iterable[Dict[str, Any]]) -> None:
        self._fallback_file.parent.mkdir(parents=True, exist_ok=True)

        serialized_lines = []
        for row in rows:
            local_row = {
                **row,
                "occurred_at": _serialize_datetime(row.get("occurred_at")),
                "received_at": _serialize_datetime(row.get("received_at")),
            }
            serialized_lines.append(json.dumps(local_row, ensure_ascii=False, separators=(",", ":")))

        content = "\n".join(serialized_lines)
        if content:
            content += "\n"
        self._fallback_file.write_text(content, encoding="utf-8")

    def _store_events_locally(self, rows: Iterable[Dict[str, Any]]) -> int:
        existing_rows = self._load_fallback_rows()
        existing_ids = {_clean_text(row.get("event_id")) for row in existing_rows}
        next_rows = list(existing_rows)
        stored_count = 0

        for row in rows:
            event_id = _clean_text(row.get("event_id"))
            if not event_id or event_id in existing_ids:
                continue

            next_rows.append(
                {
                    **row,
                    "received_at": row.get("received_at") or datetime.utcnow(),
                }
            )
            existing_ids.add(event_id)
            stored_count += 1

        self._write_fallback_rows(next_rows)
        return stored_count

    def _merge_rows(self, *row_groups: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
        merged_rows: Dict[str, Dict[str, Any]] = {}

        for rows in row_groups:
            for row in rows:
                normalized_row = {
                    **row,
                    "occurred_at": _parse_datetime(row.get("occurred_at")),
                    "received_at": _parse_datetime(row.get("received_at")),
                }
                event_id = _clean_text(normalized_row.get("event_id"))
                key = event_id or hashlib.md5(
                    f"{_clean_text(normalized_row.get('event_type'))}:{_serialize_datetime(normalized_row.get('occurred_at'))}:{_clean_text(normalized_row.get('page_path'))}:{_clean_text(normalized_row.get('action_label'))}".encode("utf-8")
                ).hexdigest()
                existing_row = merged_rows.get(key)

                if existing_row is None:
                    merged_rows[key] = normalized_row
                    continue

                current_sort_key = (
                    _parse_datetime(normalized_row.get("occurred_at")),
                    _parse_datetime(normalized_row.get("received_at")),
                )
                existing_sort_key = (
                    _parse_datetime(existing_row.get("occurred_at")),
                    _parse_datetime(existing_row.get("received_at")),
                )

                if current_sort_key >= existing_sort_key:
                    merged_rows[key] = normalized_row

        return list(merged_rows.values())

    def _load_recent_mysql_rows(self, days: int) -> List[Dict[str, Any]]:
        if not self.ensure_table():
            return []

        safe_days = max(1, min(int(days or Config.TELEMETRY_DEFAULT_WINDOW_DAYS), 90))
        window_start = datetime.utcnow() - timedelta(days=safe_days)

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        event_id,
                        occurred_at,
                        received_at,
                        event_type,
                        event_name,
                        page_path,
                        page_query,
                        page_title,
                        referrer_url,
                        target_url,
                        action_label,
                        element_tag,
                        element_role,
                        session_id,
                        visitor_id,
                        user_email,
                        auth_state,
                        selected_country,
                        selected_locale,
                        browser_language,
                        timezone,
                        screen_width,
                        screen_height,
                        viewport_width,
                        viewport_height,
                        user_agent,
                        ip_address,
                        ip_hash,
                        forwarded_for,
                        country_code,
                        country_name,
                        region_name,
                        city_name,
                        location_source,
                        request_host,
                        request_method,
                        source,
                        metadata_json
                    FROM telemetry_events
                    WHERE occurred_at >= %s
                    """,
                    [window_start],
                )
                return list(cursor.fetchall() or [])
        finally:
            connection.close()

    def _load_recent_rows(self, days: int) -> List[Dict[str, Any]]:
        fallback_rows = self._load_fallback_rows()

        try:
            mysql_rows = self._load_recent_mysql_rows(days)
        except Exception:
            mysql_rows = []

        # Merge fallback writes into read results so local telemetry stays visible even
        # when the runtime MySQL user can read telemetry_events but cannot insert into it.
        return self._merge_rows(mysql_rows, fallback_rows)

    def _resolved_country(self, row: Dict[str, Any]) -> str:
        for key in ("country_name", "country_code", "selected_country"):
            candidate = _clean_text(row.get(key))
            if candidate and candidate.lower() not in {"all", "all markets", "xx", "t1"}:
                return candidate
        return ""

    def _summary_from_rows(self, rows: Iterable[Dict[str, Any]], days: int, limit: int) -> Dict[str, Any]:
        safe_days = max(1, min(int(days or Config.TELEMETRY_DEFAULT_WINDOW_DAYS), 90))
        safe_limit = max(1, min(int(limit or 10), 50))
        window_start = datetime.utcnow() - timedelta(days=safe_days)
        filtered_rows = [row for row in rows if _parse_datetime(row.get("occurred_at")) >= window_start]

        visitor_keys = {
            _clean_text(row.get("visitor_id")) or _clean_text(row.get("ip_hash"))
            for row in filtered_rows
            if _clean_text(row.get("visitor_id")) or _clean_text(row.get("ip_hash"))
        }
        session_ids = {
            _clean_text(row.get("session_id"))
            for row in filtered_rows
            if _clean_text(row.get("session_id"))
        }
        country_values = {
            self._resolved_country(row)
            for row in filtered_rows
            if self._resolved_country(row)
        }

        page_groups: Dict[str, Dict[str, Any]] = {}
        action_groups: Dict[Tuple[str, str], Dict[str, Any]] = {}
        country_groups: Dict[str, Dict[str, Any]] = {}
        timeline_groups: Dict[str, Dict[str, Any]] = {}

        for row in filtered_rows:
            occurred_at = _parse_datetime(row.get("occurred_at"))
            visitor_key = _clean_text(row.get("visitor_id")) or _clean_text(row.get("ip_hash"))
            page_path = _clean_text(row.get("page_path"))
            event_type = _clean_text(row.get("event_type"))
            action_label = _clean_text(row.get("action_label")) or _clean_text(row.get("event_name")) or event_type
            country = self._resolved_country(row)
            day = occurred_at.date().isoformat()

            timeline_bucket = timeline_groups.setdefault(
                day,
                {"day": day, "totalEvents": 0, "pageViews": 0, "uniqueVisitors": set()},
            )
            timeline_bucket["totalEvents"] += 1
            if event_type == "page_view":
                timeline_bucket["pageViews"] += 1
            if visitor_key:
                timeline_bucket["uniqueVisitors"].add(visitor_key)

            if event_type == "page_view" and page_path:
                page_bucket = page_groups.setdefault(
                    page_path,
                    {"pagePath": page_path, "views": 0, "uniqueVisitors": set(), "lastSeenAt": occurred_at},
                )
                page_bucket["views"] += 1
                if visitor_key:
                    page_bucket["uniqueVisitors"].add(visitor_key)
                if occurred_at > page_bucket["lastSeenAt"]:
                    page_bucket["lastSeenAt"] = occurred_at

            if event_type != "page_view":
                action_bucket = action_groups.setdefault(
                    (event_type, action_label),
                    {"eventType": event_type, "label": action_label, "total": 0, "lastSeenAt": occurred_at},
                )
                action_bucket["total"] += 1
                if occurred_at > action_bucket["lastSeenAt"]:
                    action_bucket["lastSeenAt"] = occurred_at

            if country:
                country_bucket = country_groups.setdefault(
                    country,
                    {"country": country, "total": 0, "uniqueVisitors": set()},
                )
                country_bucket["total"] += 1
                if visitor_key:
                    country_bucket["uniqueVisitors"].add(visitor_key)

        top_pages = sorted(
            page_groups.values(),
            key=lambda item: (-int(item["views"]), -len(item["uniqueVisitors"]), str(item["pagePath"]).lower()),
        )[:safe_limit]
        top_actions = sorted(
            action_groups.values(),
            key=lambda item: (-int(item["total"]), -_parse_datetime(item["lastSeenAt"]).timestamp()),
        )[:safe_limit]
        top_countries = sorted(
            country_groups.values(),
            key=lambda item: (-int(item["total"]), -len(item["uniqueVisitors"]), str(item["country"]).lower()),
        )[:safe_limit]
        timeline = sorted(timeline_groups.values(), key=lambda item: item["day"])

        return {
            "enabled": True,
            "windowDays": safe_days,
            "generatedAt": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "totals": {
                "totalEvents": len(filtered_rows),
                "pageViews": sum(1 for row in filtered_rows if _clean_text(row.get("event_type")) == "page_view"),
                "uniqueSessions": len(session_ids),
                "uniqueVisitors": len(visitor_keys),
                "countryCount": len(country_values),
            },
            "topPages": [
                {
                    "pagePath": _clean_text(item["pagePath"]),
                    "views": int(item["views"]),
                    "uniqueVisitors": len(item["uniqueVisitors"]),
                    "lastSeenAt": _serialize_datetime(item["lastSeenAt"]),
                }
                for item in top_pages
            ],
            "topActions": [
                {
                    "eventType": _clean_text(item["eventType"]),
                    "label": _clean_text(item["label"]),
                    "total": int(item["total"]),
                    "lastSeenAt": _serialize_datetime(item["lastSeenAt"]),
                }
                for item in top_actions
            ],
            "topCountries": [
                {
                    "country": _clean_text(item["country"]),
                    "total": int(item["total"]),
                    "uniqueVisitors": len(item["uniqueVisitors"]),
                }
                for item in top_countries
            ],
            "timeline": [
                {
                    "day": item["day"],
                    "totalEvents": int(item["totalEvents"]),
                    "pageViews": int(item["pageViews"]),
                    "uniqueVisitors": len(item["uniqueVisitors"]),
                }
                for item in timeline
            ],
        }

    def _list_events_from_rows(
        self,
        rows: Iterable[Dict[str, Any]],
        page: int,
        limit: int,
        days: int,
        event_type: str,
        page_path: str,
    ) -> Tuple[List[Dict[str, Any]], int]:
        safe_page = max(1, int(page or 1))
        safe_limit = max(1, min(int(limit or 50), 200))
        safe_days = max(1, min(int(days or Config.TELEMETRY_DEFAULT_WINDOW_DAYS), 90))
        window_start = datetime.utcnow() - timedelta(days=safe_days)
        normalized_event_type = _clean_text(event_type).lower()
        normalized_page_path = _clean_text(page_path)

        filtered_rows = []
        for row in rows:
            occurred_at = _parse_datetime(row.get("occurred_at"))
            if occurred_at < window_start:
                continue
            if normalized_event_type and _clean_text(row.get("event_type")).lower() != normalized_event_type:
                continue
            if normalized_page_path and _clean_text(row.get("page_path")) != normalized_page_path:
                continue
            filtered_rows.append({**row, "occurred_at": occurred_at})

        filtered_rows.sort(
            key=lambda row: (
                _parse_datetime(row.get("occurred_at")),
                _parse_datetime(row.get("received_at")),
                _clean_text(row.get("event_id")),
            ),
            reverse=True,
        )

        total = len(filtered_rows)
        offset = (safe_page - 1) * safe_limit
        page_rows = filtered_rows[offset: offset + safe_limit]
        return [self._serialize_event(row) for row in page_rows], total

    def store_events(self, events: Iterable[Dict[str, Any]]) -> int:
        prepared_rows = [self._prepare_row(event) for event in events if event]
        if not prepared_rows:
            return 0

        try:
            if self.ensure_table():
                try:
                    connection = self._connect_mysql()
                except Exception:
                    self._mark_mysql_failure()
                    raise

                try:
                    with connection.cursor() as cursor:
                        cursor.executemany(
                            """
                            INSERT IGNORE INTO telemetry_events (
                                event_id,
                                occurred_at,
                                event_type,
                                event_name,
                                page_path,
                                page_query,
                                page_title,
                                referrer_url,
                                target_url,
                                action_label,
                                element_tag,
                                element_role,
                                session_id,
                                visitor_id,
                                user_email,
                                auth_state,
                                selected_country,
                                selected_locale,
                                browser_language,
                                timezone,
                                screen_width,
                                screen_height,
                                viewport_width,
                                viewport_height,
                                user_agent,
                                ip_address,
                                ip_hash,
                                forwarded_for,
                                country_code,
                                country_name,
                                region_name,
                                city_name,
                                location_source,
                                request_host,
                                request_method,
                                source,
                                metadata_json
                            ) VALUES (
                                %(event_id)s,
                                %(occurred_at)s,
                                %(event_type)s,
                                %(event_name)s,
                                %(page_path)s,
                                %(page_query)s,
                                %(page_title)s,
                                %(referrer_url)s,
                                %(target_url)s,
                                %(action_label)s,
                                %(element_tag)s,
                                %(element_role)s,
                                %(session_id)s,
                                %(visitor_id)s,
                                %(user_email)s,
                                %(auth_state)s,
                                %(selected_country)s,
                                %(selected_locale)s,
                                %(browser_language)s,
                                %(timezone)s,
                                %(screen_width)s,
                                %(screen_height)s,
                                %(viewport_width)s,
                                %(viewport_height)s,
                                %(user_agent)s,
                                %(ip_address)s,
                                %(ip_hash)s,
                                %(forwarded_for)s,
                                %(country_code)s,
                                %(country_name)s,
                                %(region_name)s,
                                %(city_name)s,
                                %(location_source)s,
                                %(request_host)s,
                                %(request_method)s,
                                %(source)s,
                                %(metadata_json)s
                            )
                            """,
                            prepared_rows,
                        )
                        stored_count = int(cursor.rowcount or 0)
                    connection.commit()
                    self._mark_mysql_ready()
                    return stored_count
                finally:
                    connection.close()
        except Exception:
            pass

        return self._store_events_locally(prepared_rows)

    def summary(self, days: int = 7, limit: int = 10) -> Dict[str, Any]:
        try:
            safe_days = max(1, min(int(days or Config.TELEMETRY_DEFAULT_WINDOW_DAYS), 90))
            safe_limit = max(1, min(int(limit or 10), 50))
            return self._summary_from_rows(self._load_recent_rows(safe_days), days=safe_days, limit=safe_limit)
        except Exception:
            return self._summary_from_rows(self._load_fallback_rows(), days=days, limit=limit)

    def list_events(
        self,
        page: int = 1,
        limit: int = 50,
        days: int = 7,
        event_type: str = "",
        page_path: str = "",
    ) -> Tuple[List[Dict[str, Any]], int]:
        try:
            safe_days = max(1, min(int(days or Config.TELEMETRY_DEFAULT_WINDOW_DAYS), 90))
            return self._list_events_from_rows(
                self._load_recent_rows(safe_days),
                page=page,
                limit=limit,
                days=safe_days,
                event_type=event_type,
                page_path=page_path,
            )
        except Exception:
            return self._list_events_from_rows(
                self._load_fallback_rows(),
                page=page,
                limit=limit,
                days=days,
                event_type=event_type,
                page_path=page_path,
            )

    def _prepare_row(self, event: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "event_id": _truncate_text(event.get("eventId"), 32) or hashlib.md5(
                f"{_clean_text(event.get('eventType'))}:{_clean_text(event.get('occurredAt'))}:{_clean_text(event.get('pagePath'))}:{_clean_text(event.get('actionLabel'))}".encode("utf-8")
            ).hexdigest(),
            "occurred_at": _parse_datetime(event.get("occurredAt")),
            "event_type": _truncate_text(event.get("eventType"), 64) or "custom",
            "event_name": _truncate_text(event.get("eventName"), 160),
            "page_path": _truncate_text(event.get("pagePath"), 512),
            "page_query": _truncate_text(event.get("pageQuery"), 4000) or None,
            "page_title": _truncate_text(event.get("pageTitle"), 255),
            "referrer_url": _truncate_text(event.get("referrerUrl"), 2048),
            "target_url": _truncate_text(event.get("targetUrl"), 2048),
            "action_label": _truncate_text(event.get("actionLabel"), 255),
            "element_tag": _truncate_text(event.get("elementTag"), 32),
            "element_role": _truncate_text(event.get("elementRole"), 64),
            "session_id": _truncate_text(event.get("sessionId"), 36),
            "visitor_id": _truncate_text(event.get("visitorId"), 36),
            "user_email": _truncate_text(event.get("userEmail"), 255),
            "auth_state": _truncate_text(event.get("authState"), 32) or "anonymous",
            "selected_country": _truncate_text(event.get("selectedCountry"), 160),
            "selected_locale": _truncate_text(event.get("selectedLocale"), 32),
            "browser_language": _truncate_text(event.get("browserLanguage"), 32),
            "timezone": _truncate_text(event.get("timezone"), 64),
            "screen_width": _safe_int(event.get("screenWidth")),
            "screen_height": _safe_int(event.get("screenHeight")),
            "viewport_width": _safe_int(event.get("viewportWidth")),
            "viewport_height": _safe_int(event.get("viewportHeight")),
            "user_agent": _truncate_text(event.get("userAgent"), 1024),
            "ip_address": _truncate_text(event.get("ipAddress"), 64),
            "ip_hash": _truncate_text(event.get("ipHash"), 64),
            "forwarded_for": _truncate_text(event.get("forwardedFor"), 512),
            "country_code": _truncate_text(event.get("countryCode"), 8),
            "country_name": _truncate_text(event.get("countryName"), 160),
            "region_name": _truncate_text(event.get("regionName"), 160),
            "city_name": _truncate_text(event.get("cityName"), 160),
            "location_source": _truncate_text(event.get("locationSource"), 32),
            "request_host": _truncate_text(event.get("requestHost"), 255),
            "request_method": _truncate_text(event.get("requestMethod"), 16),
            "source": _truncate_text(event.get("source"), 32) or "web",
            "metadata_json": _serialize_metadata(event.get("metadata")),
        }

    def _serialize_event(self, row: Dict[str, Any]) -> Dict[str, Any]:
        metadata_value = row.get("metadata_json")
        if isinstance(metadata_value, str) and metadata_value:
            try:
                metadata = json.loads(metadata_value)
            except json.JSONDecodeError:
                metadata = {"raw": metadata_value}
        else:
            metadata = None

        return {
            "eventId": _clean_text(row.get("event_id")),
            "occurredAt": _serialize_datetime(row.get("occurred_at")),
            "receivedAt": _serialize_datetime(row.get("received_at")),
            "eventType": _clean_text(row.get("event_type")),
            "eventName": _clean_text(row.get("event_name")),
            "pagePath": _clean_text(row.get("page_path")),
            "pageQuery": _clean_text(row.get("page_query")),
            "pageTitle": _clean_text(row.get("page_title")),
            "referrerUrl": _clean_text(row.get("referrer_url")),
            "targetUrl": _clean_text(row.get("target_url")),
            "actionLabel": _clean_text(row.get("action_label")),
            "elementTag": _clean_text(row.get("element_tag")),
            "elementRole": _clean_text(row.get("element_role")),
            "sessionId": _clean_text(row.get("session_id")),
            "visitorId": _clean_text(row.get("visitor_id")),
            "userEmail": _clean_text(row.get("user_email")),
            "authState": _clean_text(row.get("auth_state")),
            "selectedCountry": _clean_text(row.get("selected_country")),
            "selectedLocale": _clean_text(row.get("selected_locale")),
            "browserLanguage": _clean_text(row.get("browser_language")),
            "timezone": _clean_text(row.get("timezone")),
            "screenWidth": _safe_int(row.get("screen_width")),
            "screenHeight": _safe_int(row.get("screen_height")),
            "viewportWidth": _safe_int(row.get("viewport_width")),
            "viewportHeight": _safe_int(row.get("viewport_height")),
            "userAgent": _clean_text(row.get("user_agent")),
            "ipAddress": _clean_text(row.get("ip_address")),
            "ipHash": _clean_text(row.get("ip_hash")),
            "forwardedFor": _clean_text(row.get("forwarded_for")),
            "countryCode": _clean_text(row.get("country_code")),
            "countryName": _clean_text(row.get("country_name")),
            "regionName": _clean_text(row.get("region_name")),
            "cityName": _clean_text(row.get("city_name")),
            "locationSource": _clean_text(row.get("location_source")),
            "requestHost": _clean_text(row.get("request_host")),
            "requestMethod": _clean_text(row.get("request_method")),
            "source": _clean_text(row.get("source")),
            "metadata": metadata,
        }

    def _empty_summary(self, enabled: bool, days: int, limit: int) -> Dict[str, Any]:
        return {
            "enabled": enabled,
            "windowDays": max(1, int(days or Config.TELEMETRY_DEFAULT_WINDOW_DAYS)),
            "generatedAt": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "totals": {
                "totalEvents": 0,
                "pageViews": 0,
                "uniqueSessions": 0,
                "uniqueVisitors": 0,
                "countryCount": 0,
            },
            "topPages": [],
            "topActions": [],
            "topCountries": [],
            "timeline": [],
            "limit": max(1, int(limit or 10)),
        }


telemetry_repository = CouponleoTelemetryRepository()

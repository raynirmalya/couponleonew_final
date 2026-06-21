#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from http.cookiejar import LoadError, MozillaCookieJar
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set

import requests

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None


def _load_env_files() -> None:
    if load_dotenv is None:
        return

    base_path = Path(__file__).resolve()
    for env_path in (
        base_path.parent / ".env",
        base_path.parents[2] / ".env",
        base_path.parents[3] / ".env",
    ):
        if env_path.is_file():
            load_dotenv(env_path, override=False)


_load_env_files()


BASE_URL = os.getenv("COUPONAPI_BASE_URL", "https://couponapi.org").rstrip("/")
DEFAULT_ACCOUNT_ID = os.getenv("COUPONAPI_ACCOUNT_ID", "3923").strip() or "3923"
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_LOG_DIR = Path(__file__).resolve().parent / "logs"
DEFAULT_COOKIE_JAR_PATH = Path(__file__).resolve().parent / ".couponapi.cookies.txt"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)
LOGIN_PATH = "/account/login.php"


@dataclass
class HttpResponse:
    url: str
    status: int
    headers: Dict[str, str]
    text: str


def _resolve_cookie_jar_path() -> Path:
    configured = os.getenv("COUPONAPI_COOKIE_JAR", "").strip()
    if not configured:
        return DEFAULT_COOKIE_JAR_PATH

    path = Path(configured).expanduser()
    if not path.is_absolute():
        path = Path(__file__).resolve().parent / path
    return path.resolve()


def _is_login_page(response: HttpResponse) -> bool:
    lowered = response.text.lower()
    return (
        "coupon api login" in lowered
        and 'name="user"' in lowered
        and 'name="password"' in lowered
    )


def _is_access_denied(response: HttpResponse) -> bool:
    return response.text.strip().lower() == "access denied"


def _is_unauthenticated(response: HttpResponse) -> bool:
    return _is_access_denied(response) or _is_login_page(response)


@dataclass
class CouponApiClient:
    manual_cookie: str
    username: str
    password: str
    cookie_jar_path: Path

    def __post_init__(self) -> None:
        self.cookie_jar = MozillaCookieJar(str(self.cookie_jar_path))
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.cookies = self.cookie_jar
        self._load_cookie_jar()

    def has_credentials(self) -> bool:
        return bool(self.username and self.password)

    def _load_cookie_jar(self) -> None:
        if not self.cookie_jar_path.is_file():
            return

        try:
            self.cookie_jar.load(ignore_discard=True, ignore_expires=True)
        except (LoadError, OSError):
            return

    def _save_cookie_jar(self) -> None:
        self.cookie_jar_path.parent.mkdir(parents=True, exist_ok=True)
        self.cookie_jar.save(ignore_discard=True, ignore_expires=True)

    def _has_cookie_jar_cookies(self) -> bool:
        return any(True for _ in self.cookie_jar)

    def _base_headers(
        self,
        *,
        accept: str,
        referer_path: str,
        include_ajax_header: bool,
        include_manual_cookie: bool,
        force_manual_cookie: bool,
    ) -> Dict[str, str]:
        headers = {
            "Accept": accept,
            "Referer": f"{BASE_URL}{referer_path}",
            "User-Agent": DEFAULT_USER_AGENT,
        }

        if include_ajax_header:
            headers["Origin"] = BASE_URL
            headers["X-Requested-With"] = "XMLHttpRequest"

        if include_manual_cookie and self.manual_cookie and (force_manual_cookie or not self._has_cookie_jar_cookies()):
            headers["Cookie"] = self.manual_cookie

        return headers

    def _send(
        self,
        path: str,
        *,
        query: Dict[str, Any] | None = None,
        form: Dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
        accept: str,
        referer_path: str,
        include_ajax_header: bool,
        include_manual_cookie: bool,
        force_manual_cookie: bool = False,
    ) -> HttpResponse:
        url = f"{BASE_URL}{path}"

        headers = self._base_headers(
            accept=accept,
            referer_path=referer_path,
            include_ajax_header=include_ajax_header,
            include_manual_cookie=include_manual_cookie,
            force_manual_cookie=force_manual_cookie,
        )

        if form is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"

        try:
            response = self.session.request(
                method="POST" if form is not None else "GET",
                url=url,
                params=query,
                data=form,
                headers=headers,
                timeout=timeout,
                allow_redirects=True,
            )
            result = HttpResponse(
                url=str(response.url),
                status=int(response.status_code),
                headers=dict(response.headers.items()),
                text=response.text,
            )
        except requests.RequestException as exc:
            raise RuntimeError(f"Request to {url} failed: {exc}") from exc

        if self._has_cookie_jar_cookies():
            self._save_cookie_jar()

        return result

    def _ajax_request(
        self,
        path: str,
        *,
        query: Dict[str, Any] | None = None,
        form: Dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
        include_manual_cookie: bool = True,
        force_manual_cookie: bool = False,
    ) -> HttpResponse:
        return self._send(
            path,
            query=query,
            form=form,
            timeout=timeout,
            accept="application/json, text/javascript, */*; q=0.01",
            referer_path="/account/",
            include_ajax_header=True,
            include_manual_cookie=include_manual_cookie,
            force_manual_cookie=force_manual_cookie,
        )

    def _login_request(
        self,
        *,
        form: Dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> HttpResponse:
        return self._send(
            LOGIN_PATH,
            form=form,
            timeout=timeout,
            accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            referer_path="/account/login.php",
            include_ajax_header=False,
            include_manual_cookie=False,
            force_manual_cookie=False,
        )

    def login(self) -> None:
        if not self.has_credentials():
            raise RuntimeError(
                "CouponAPI session expired. Set COUPONAPI_USER and COUPONAPI_PASSWORD for automatic re-login."
            )

        self.cookie_jar.clear()
        print("CouponAPI session expired; attempting automatic re-login...", file=sys.stderr)
        self._login_request()
        response = self._login_request(
            form={
                "user": self.username,
                "password": self.password,
                "redir": "dashboard.php",
                "submit": "Login",
            }
        )

        if _is_login_page(response):
            raise RuntimeError(
                "CouponAPI login failed. Check COUPONAPI_USER / COUPONAPI_PASSWORD or refresh COUPONAPI_COOKIE."
            )

        self.manual_cookie = ""
        if self._has_cookie_jar_cookies():
            self._save_cookie_jar()
        print(f"CouponAPI login refreshed. Cookie jar saved to {self.cookie_jar_path}.", file=sys.stderr)

    def request(
        self,
        path: str,
        *,
        query: Dict[str, Any] | None = None,
        form: Dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
        allow_reauth: bool = True,
    ) -> HttpResponse:
        tried_manual_cookie = bool(self.manual_cookie) and not self._has_cookie_jar_cookies()
        response = self._ajax_request(
            path,
            query=query,
            form=form,
            timeout=timeout,
            force_manual_cookie=tried_manual_cookie,
        )
        if response.status >= 400:
            snippet = response.text[:300].strip() or "<empty body>"
            raise RuntimeError(f"HTTP {response.status} from {response.url}: {snippet}")

        if _is_unauthenticated(response) and self.manual_cookie and not tried_manual_cookie:
            response = self._ajax_request(
                path,
                query=query,
                form=form,
                timeout=timeout,
                force_manual_cookie=True,
            )
            tried_manual_cookie = True

        if _is_unauthenticated(response):
            if allow_reauth and self.has_credentials():
                self.login()
                response = self._ajax_request(
                    path,
                    query=query,
                    form=form,
                    timeout=timeout,
                    include_manual_cookie=False,
                )

            if _is_unauthenticated(response):
                raise RuntimeError(
                    "CouponAPI authentication failed. Set COUPONAPI_COOKIE to a fresh session, "
                    "or configure COUPONAPI_USER and COUPONAPI_PASSWORD for automatic re-login."
                )

        return response


def _build_client() -> CouponApiClient:
    manual_cookie = os.getenv("COUPONAPI_COOKIE", "").strip()
    username = os.getenv("COUPONAPI_USER", "").strip()
    password = os.getenv("COUPONAPI_PASSWORD", "").strip()

    if not manual_cookie and not (username and password):
        raise SystemExit(
            "Set COUPONAPI_COOKIE to a fresh couponapi.org session, "
            "or configure COUPONAPI_USER and COUPONAPI_PASSWORD for automatic re-login."
        )

    return CouponApiClient(
        manual_cookie=manual_cookie,
        username=username,
        password=password,
        cookie_jar_path=_resolve_cookie_jar_path(),
    )


def _decode_json(response: HttpResponse) -> Dict[str, Any]:
    try:
        payload = json.loads(response.text)
    except json.JSONDecodeError as exc:
        snippet = response.text[:300].strip() or "<empty body>"
        raise RuntimeError(
            f"Expected JSON from {response.url}, got HTTP {response.status} with body: {snippet}"
        ) from exc

    if not isinstance(payload, dict):
        raise RuntimeError(f"Expected object payload from {response.url}, got {type(payload).__name__}.")

    return payload


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _default_log_path(command_name: str) -> Path:
    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    return DEFAULT_LOG_DIR / f"couponapi-{command_name}-{stamp}.jsonl"


def _append_log(log_path: Path, event: Dict[str, Any]) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    record = {"ts": _now_iso(), **event}
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=True) + "\n")


def _normalize_store_name(value: Any) -> str:
    return str(value or "").strip().lower()


def _load_successful_store_names(log_path: Path) -> Set[str]:
    if not log_path.is_file():
        return set()

    names: Set[str] = set()
    with log_path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if record.get("event") != "update_success":
                continue
            store_name = _normalize_store_name(record.get("store"))
            if store_name:
                names.add(store_name)
    return names


def _unique_rows_by_store(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    unique_rows: List[Dict[str, Any]] = []
    seen_names: Set[str] = set()

    for row in rows:
        store_name = _normalize_store_name(row.get("name"))
        if not store_name or store_name in seen_names:
            continue
        seen_names.add(store_name)
        unique_rows.append(row)

    return unique_rows


def _maybe_json(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _stores_query(draw: int, start: int, length: int, location: str) -> Dict[str, Any]:
    params: Dict[str, Any] = {
        "draw": draw,
        "start": start,
        "length": length,
        "search[value]": "",
        "search[regex]": "false",
        "table_name": "stores",
        "location": location,
        "order[0][column]": 0,
        "order[0][dir]": "asc",
    }

    column_names = [
        "name",
        "enabled",
        "custom_name",
        "added_on",
        "sources",
        "coupon_count",
        "URL",
        "location",
    ]

    for index, column_name in enumerate(column_names):
        prefix = f"columns[{index}]"
        params[f"{prefix}[data]"] = column_name
        params[f"{prefix}[name]"] = ""
        params[f"{prefix}[searchable]"] = "true"
        params[f"{prefix}[orderable]"] = "false" if column_name == "sources" else "true"
        params[f"{prefix}[search][value]"] = ""
        params[f"{prefix}[search][regex]"] = "false"

    return params


def fetch_store_page(page: int, *, page_size: int, location: str, client: CouponApiClient) -> List[Dict[str, Any]]:
    response = client.request(
        "/account/AJAX/getStoresData.php",
        query=_stores_query(draw=page + 1, start=page * page_size, length=page_size, location=location),
    )
    payload = _decode_json(response)
    rows = payload.get("datatable")
    if not isinstance(rows, list):
        raise RuntimeError(f"Missing 'datatable' array in response from {response.url}.")
    return [row for row in rows if isinstance(row, dict)]


def update_store(
    store_name: str,
    *,
    account_id: str,
    enabled: bool,
    custom_name: str,
    location: str,
    client: CouponApiClient,
) -> Dict[str, Any]:
    response = client.request(
        "/account/AJAX/updateStores.php",
        form={
            "account_id": account_id,
            "store": store_name,
            "status": "true" if enabled else "false",
            "custom_name": custom_name,
            "location": location,
        },
    )
    return {
        "url": response.url,
        "status": response.status,
        "body": response.text,
    }


def _iter_disabled(rows: Iterable[Dict[str, Any]]) -> Iterable[Dict[str, Any]]:
    for row in rows:
        if str(row.get("enabled", "")).strip() == "0":
            yield row


def _filter_rows(rows: Iterable[Dict[str, Any]], store_query: str) -> Iterable[Dict[str, Any]]:
    query = store_query.strip().lower()
    if not query:
        yield from rows
        return

    for row in rows:
        name = str(row.get("name", "")).strip().lower()
        if query in name:
            yield row


def _take_limit(rows: Iterable[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    if limit <= 0:
        return list(rows)

    limited: List[Dict[str, Any]] = []
    for row in rows:
        limited.append(row)
        if len(limited) >= limit:
            break
    return limited


def _resolve_log_path(value: str, command_name: str) -> Path:
    if value.strip():
        return Path(value).expanduser().resolve()
    return _default_log_path(command_name)


def _print_store_rows(rows: Iterable[Dict[str, Any]]) -> None:
    for row in rows:
        print(
            json.dumps(
                {
                    "name": row.get("name"),
                    "enabled": row.get("enabled"),
                    "custom_name": row.get("custom_name"),
                    "coupon_count": row.get("coupon_count"),
                    "location": row.get("location"),
                    "url": row.get("URL"),
                },
                ensure_ascii=True,
            )
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Inspect or update CouponAPI store admin data using either a fresh authenticated cookie "
            "or COUPONAPI_USER / COUPONAPI_PASSWORD for automatic re-login."
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list-disabled", help="List disabled stores from a page.")
    list_parser.add_argument("--page", type=int, default=0, help="Zero-based page number.")
    list_parser.add_argument("--page-size", type=int, default=100, help="Number of rows to fetch.")
    list_parser.add_argument("--location", default="", help="Optional location filter.")
    list_parser.add_argument("--store-query", default="", help="Optional case-insensitive store-name match.")
    list_parser.add_argument("--limit", type=int, default=20, help="Max rows to print. Use 0 for all.")

    find_parser = subparsers.add_parser("find-store", help="Find stores by partial name match.")
    find_parser.add_argument("--store-query", required=True, help="Case-insensitive partial store-name match.")
    find_parser.add_argument("--page", type=int, default=0, help="Zero-based page number.")
    find_parser.add_argument("--page-size", type=int, default=100, help="Number of rows to fetch.")
    find_parser.add_argument("--location", default="", help="Optional location filter.")
    find_parser.add_argument("--limit", type=int, default=20, help="Max rows to print. Use 0 for all.")

    preview_parser = subparsers.add_parser(
        "preview-enable-disabled",
        help="Show the exact update payloads that would be sent for disabled stores on a page.",
    )
    preview_parser.add_argument("--page", type=int, default=0, help="Zero-based page number.")
    preview_parser.add_argument("--page-size", type=int, default=100, help="Number of rows to fetch.")
    preview_parser.add_argument("--location", default="", help="Optional location filter.")
    preview_parser.add_argument("--account-id", default=DEFAULT_ACCOUNT_ID, help="CouponAPI account id.")
    preview_parser.add_argument("--store-query", default="", help="Optional case-insensitive store-name match.")
    preview_parser.add_argument("--limit", type=int, default=20, help="Max rows to print. Use 0 for all.")

    apply_parser = subparsers.add_parser(
        "apply-all-disabled",
        help="Enable all matched disabled stores and append a JSONL progress log.",
    )
    apply_parser.add_argument("--page", type=int, default=0, help="Zero-based page number.")
    apply_parser.add_argument("--page-size", type=int, default=100, help="Number of rows to fetch.")
    apply_parser.add_argument("--location", default="", help="Optional location filter.")
    apply_parser.add_argument("--account-id", default=DEFAULT_ACCOUNT_ID, help="CouponAPI account id.")
    apply_parser.add_argument("--store-query", default="", help="Optional case-insensitive store-name match.")
    apply_parser.add_argument("--limit", type=int, default=0, help="Max updates to send. Use 0 for all.")
    apply_parser.add_argument("--sleep-ms", type=int, default=0, help="Pause between updates.")
    apply_parser.add_argument("--log-file", default="", help="JSONL log path. Defaults to a timestamped file.")
    apply_parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Do not skip stores already marked successful in the log file.",
    )
    apply_parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop immediately after the first failed update.",
    )
    apply_parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually send updates. Without this flag the script writes only the run summary.",
    )

    update_parser = subparsers.add_parser("update-store", help="Update a single store.")
    update_parser.add_argument("--store", required=True, help="Store domain/name as shown in CouponAPI.")
    update_parser.add_argument("--account-id", default=DEFAULT_ACCOUNT_ID, help="CouponAPI account id.")
    update_parser.add_argument(
        "--status",
        choices=("true", "false"),
        default="true",
        help="Whether the store should be enabled.",
    )
    update_parser.add_argument("--custom-name", default="", help="Optional custom store name.")
    update_parser.add_argument("--location", default="", help="Optional location value.")
    update_parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually send the update. Without this flag the script prints the payload only.",
    )

    return parser


def _run_apply_all_disabled(args: argparse.Namespace, client: CouponApiClient) -> int:
    rows = fetch_store_page(args.page, page_size=args.page_size, location=args.location, client=client)
    disabled_rows = list(_iter_disabled(rows))
    filtered_rows = list(_filter_rows(disabled_rows, args.store_query))
    unique_rows = _unique_rows_by_store(filtered_rows)
    log_path = _resolve_log_path(args.log_file, "apply-all-disabled")
    resume_enabled = not args.no_resume
    already_applied = _load_successful_store_names(log_path) if resume_enabled else set()

    pending_rows: List[Dict[str, Any]] = []
    skipped_existing = 0
    for row in unique_rows:
        store_name = _normalize_store_name(row.get("name"))
        if resume_enabled and store_name in already_applied:
            skipped_existing += 1
            continue
        pending_rows.append(row)

    if args.limit > 0:
        pending_rows = pending_rows[: args.limit]

    run_summary = {
        "event": "run_started",
        "command": "apply-all-disabled",
        "apply": bool(args.apply),
        "page": args.page,
        "page_size": args.page_size,
        "location": args.location,
        "account_id": args.account_id,
        "store_query": args.store_query,
        "fetched_rows": len(rows),
        "disabled_rows": len(disabled_rows),
        "matched_rows": len(filtered_rows),
        "unique_rows": len(unique_rows),
        "skipped_existing": skipped_existing,
        "pending_rows": len(pending_rows),
        "sleep_ms": args.sleep_ms,
        "resume_enabled": resume_enabled,
        "log_file": str(log_path),
    }
    _append_log(log_path, run_summary)

    print(
        f"Fetched {len(rows)} rows from page {args.page}; "
        f"disabled rows: {len(disabled_rows)}; matched rows: {len(filtered_rows)}; "
        f"unique rows: {len(unique_rows)}; skipped existing: {skipped_existing}; "
        f"pending updates: {len(pending_rows)}"
    )
    print(f"Log file: {log_path}")

    if not args.apply:
        print("Dry run only. Add --apply to send updates.")
        return 0

    success_count = 0
    error_count = 0
    total_pending = len(pending_rows)

    for index, row in enumerate(pending_rows, start=1):
        store_name = str(row.get("name") or "").strip()
        payload = {
            "account_id": args.account_id,
            "store": store_name,
            "status": "true",
            "custom_name": "",
            "location": "",
        }
        started = time.monotonic()

        try:
            result = update_store(
                store_name,
                account_id=args.account_id,
                enabled=True,
                custom_name="",
                location="",
                client=client,
            )
            elapsed_ms = int((time.monotonic() - started) * 1000)
            success_count += 1
            _append_log(
                log_path,
                {
                    "event": "update_success",
                    "index": index,
                    "total": total_pending,
                    "store": store_name,
                    "payload": payload,
                    "response_status": result["status"],
                    "response_body": _maybe_json(result["body"]),
                    "elapsed_ms": elapsed_ms,
                },
            )
            print(f"[{index}/{total_pending}] OK {store_name} ({elapsed_ms} ms)")
        except Exception as exc:
            elapsed_ms = int((time.monotonic() - started) * 1000)
            error_count += 1
            _append_log(
                log_path,
                {
                    "event": "update_error",
                    "index": index,
                    "total": total_pending,
                    "store": store_name,
                    "payload": payload,
                    "error": str(exc),
                    "elapsed_ms": elapsed_ms,
                },
            )
            print(f"[{index}/{total_pending}] ERROR {store_name}: {exc}", file=sys.stderr)
            if args.stop_on_error:
                _append_log(
                    log_path,
                    {
                        "event": "run_finished",
                        "command": "apply-all-disabled",
                        "status": "stopped_on_error",
                        "success_count": success_count,
                        "error_count": error_count,
                        "attempted_count": index,
                        "pending_rows": total_pending,
                        "log_file": str(log_path),
                    },
                )
                return 1

        if args.sleep_ms > 0 and index < total_pending:
            time.sleep(args.sleep_ms / 1000)

    _append_log(
        log_path,
        {
            "event": "run_finished",
            "command": "apply-all-disabled",
            "status": "completed" if error_count == 0 else "completed_with_errors",
            "success_count": success_count,
            "error_count": error_count,
            "attempted_count": total_pending,
            "log_file": str(log_path),
        },
    )
    print(f"Finished. success={success_count} errors={error_count}")
    return 0 if error_count == 0 else 1


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    client = _build_client()

    if args.command == "list-disabled":
        rows = fetch_store_page(args.page, page_size=args.page_size, location=args.location, client=client)
        disabled_rows = list(_iter_disabled(rows))
        filtered_rows = list(_filter_rows(disabled_rows, args.store_query))
        output_rows = _take_limit(filtered_rows, args.limit)
        print(
            f"Fetched {len(rows)} rows from page {args.page}; "
            f"disabled rows: {len(disabled_rows)}; matched rows: {len(filtered_rows)}; "
            f"printing: {len(output_rows)}"
        )
        _print_store_rows(output_rows)
        return 0

    if args.command == "find-store":
        rows = fetch_store_page(args.page, page_size=args.page_size, location=args.location, client=client)
        matched_rows = list(_filter_rows(rows, args.store_query))
        output_rows = _take_limit(matched_rows, args.limit)
        print(
            f"Fetched {len(rows)} rows from page {args.page}; "
            f"matched rows: {len(matched_rows)}; printing: {len(output_rows)}"
        )
        _print_store_rows(output_rows)
        return 0

    if args.command == "preview-enable-disabled":
        rows = fetch_store_page(args.page, page_size=args.page_size, location=args.location, client=client)
        disabled_rows = list(_iter_disabled(rows))
        filtered_rows = list(_filter_rows(disabled_rows, args.store_query))
        output_rows = _take_limit(filtered_rows, args.limit)
        print(
            f"Fetched {len(rows)} rows from page {args.page}; "
            f"disabled rows: {len(disabled_rows)}; matched rows: {len(filtered_rows)}; "
            f"printing: {len(output_rows)}"
        )
        for row in output_rows:
            print(
                json.dumps(
                    {
                        "account_id": args.account_id,
                        "store": row.get("name"),
                        "status": "true",
                        "custom_name": "",
                        "location": "",
                    },
                    ensure_ascii=True,
                )
            )
        return 0

    if args.command == "apply-all-disabled":
        return _run_apply_all_disabled(args, client)

    if args.command == "update-store":
        payload = {
            "account_id": args.account_id,
            "store": args.store,
            "status": args.status,
            "custom_name": args.custom_name,
            "location": args.location,
        }

        if not args.apply:
            print("Dry run only. Add --apply to send this update:")
            print(json.dumps(payload, ensure_ascii=True))
            return 0

        result = update_store(
            args.store,
            account_id=args.account_id,
            enabled=args.status == "true",
            custom_name=args.custom_name,
            location=args.location,
            client=client,
        )
        print(json.dumps(result, ensure_ascii=True))
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        raise SystemExit(130)

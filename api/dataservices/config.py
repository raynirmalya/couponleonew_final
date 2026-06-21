from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Tuple

from dotenv import load_dotenv


def _load_env_files() -> None:
    base_path = Path(__file__).resolve()

    for env_path in (
        base_path.parents[2] / ".env",
        base_path.parent / ".env",
        base_path.parents[3] / ".env",
    ):
        if env_path.is_file():
            load_dotenv(env_path, override=False)


def _env_first(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def _csv_env(name: str, default: Tuple[str, ...]) -> Tuple[str, ...]:
    raw = os.getenv(name)
    if not raw:
        return default
    values = tuple(item.strip() for item in raw.split(",") if item.strip())
    return values or default


_load_env_files()


class Config:
    API_PREFIX = os.getenv("API_PREFIX", "/couponleo/api").rstrip("/")
    APP_VERSION = os.getenv("APP_VERSION", "2.1.0")
    DATA_FILE = os.getenv("COUPONLEO_DATA_FILE", "").strip()
    DATA_SNAPSHOT_FILE = os.getenv(
        "COUPONLEO_DATA_SNAPSHOT_FILE",
        str(Path(__file__).resolve().parent / "data" / "local-couponleo-data.json"),
    ).strip()
    DATA_REFRESH_SECONDS = int(os.getenv("COUPONLEO_DATA_REFRESH_SECONDS", "300"))
    ENABLE_MUTATIONS = os.getenv("ENABLE_MUTATIONS", "false").lower() in {"1", "true", "yes", "on"}
    ENABLE_NEWSLETTER_SUBSCRIPTIONS = os.getenv("ENABLE_NEWSLETTER_SUBSCRIPTIONS", "true").lower() in {"1", "true", "yes", "on"}
    ENABLE_TELEMETRY = os.getenv("ENABLE_TELEMETRY", "true").lower() in {"1", "true", "yes", "on"}
    AUTH_STORAGE_BACKEND = "mysql"
    AUTH_ACTIVATION_TTL_HOURS = int(os.getenv("COUPONLEO_AUTH_ACTIVATION_TTL_HOURS", "72"))
    AUTH_RESET_TTL_HOURS = int(os.getenv("COUPONLEO_AUTH_RESET_TTL_HOURS", "2"))
    SUPPORT_EMAIL = os.getenv("COUPONLEO_SUPPORT_EMAIL", "support@couponleo.com").strip() or "support@couponleo.com"
    SUPPORT_NAME = os.getenv("COUPONLEO_SUPPORT_NAME", "CouponLeo Support").strip() or "CouponLeo Support"
    SITE_BASE_URL = os.getenv("COUPONLEO_SITE_BASE_URL", "http://127.0.0.1:5173").strip() or "http://127.0.0.1:5173"
    TELEMETRY_BATCH_LIMIT = int(os.getenv("COUPONLEO_TELEMETRY_BATCH_LIMIT", "50"))
    TELEMETRY_DEFAULT_WINDOW_DAYS = int(os.getenv("COUPONLEO_TELEMETRY_DEFAULT_WINDOW_DAYS", "7"))
    TELEMETRY_ADMIN_KEY = os.getenv("COUPONLEO_TELEMETRY_ADMIN_KEY", "").strip()
    TELEMETRY_STORE_RAW_IP = os.getenv("COUPONLEO_TELEMETRY_STORE_RAW_IP", "true").lower() in {"1", "true", "yes", "on"}
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", "2097152"))
    RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
    RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "180"))
    RATE_LIMIT_WRITE_REQUESTS = int(os.getenv("RATE_LIMIT_WRITE_REQUESTS", "30"))
    PROXY_FIX_X_FOR = int(os.getenv("PROXY_FIX_X_FOR", "1"))
    PROXY_FIX_X_PROTO = int(os.getenv("PROXY_FIX_X_PROTO", "1"))
    PROXY_FIX_X_HOST = int(os.getenv("PROXY_FIX_X_HOST", "1"))
    ALLOWED_ORIGINS = _csv_env(
        "ALLOWED_ORIGINS",
        ("https://couponleo.com", "https://www.couponleo.com")
    )
    ALLOWED_HOSTS = _csv_env(
        "ALLOWED_HOSTS",
        ("couponleo.com", "www.couponleo.com", "127.0.0.1", "localhost")
    )
    MYSQL_HOST = _env_first("COUPONLEO_DB_HOST", "CPLODB_HOST", "MYSQL_HOST", "DB_HOST", "host")
    MYSQL_PORT = int(_env_first("COUPONLEO_DB_PORT", "CPLODB_PORT", "MYSQL_PORT", "DB_PORT", "port", default="25060"))
    MYSQL_DB = _env_first("COUPONLEO_DB_NAME", "CPLODB_NAME", "MYSQL_DB", "MYSQL_DATABASE", "DB_NAME", "database2")
    MYSQL_USER = _env_first("COUPONLEO_DB_USER", "CPLODB_USER", "MYSQL_USER", "DB_USER", "DB_USERNAME1")
    MYSQL_PASSWORD = _env_first("COUPONLEO_DB_PASSWORD", "CPLODB_PASSWORD", "MYSQL_PASSWORD", "DB_PASSWORD1", "DB_PASSWORD", "DB_PASS")
    MYSQL_CONNECT_TIMEOUT = int(_env_first("COUPONLEO_DB_CONNECT_TIMEOUT", "MYSQL_CONNECT_TIMEOUT", default="5"))
    MYSQL_READ_TIMEOUT = int(_env_first("COUPONLEO_DB_READ_TIMEOUT", "MYSQL_READ_TIMEOUT", default="5"))
    MYSQL_WRITE_TIMEOUT = int(_env_first("COUPONLEO_DB_WRITE_TIMEOUT", "MYSQL_WRITE_TIMEOUT", default="5"))
    MYSQL_SSL_REQUIRED = _env_first(
        "COUPONLEO_DB_SSL",
        "CPLODB_SSL",
        "MYSQL_SSL_MODE",
        "DB_SSL_MODE",
        "sslmode",
        default="required",
    ).lower() in {"1", "true", "yes", "on", "required"}
    NEWSLETTER_DATA_FILE = os.getenv(
        "COUPONLEO_NEWSLETTER_DATA_FILE",
        str(Path(__file__).resolve().parent / "data" / "newsletter_subscriptions.json"),
    ).strip()
    SECURITY_HEADERS: Dict[str, str] = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
    }

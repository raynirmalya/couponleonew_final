from __future__ import annotations

import os
import uuid
from urllib.parse import urlparse

from dotenv import load_dotenv
from flask import Flask, abort, g, jsonify, request
from flask_compress import Compress
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from cache import rate_limiter
from config import Config

load_dotenv()

couponleoapi = Flask(__name__, static_url_path="", static_folder=".")
couponleoapi.config["CORS_HEADERS"] = "Content-Type"
couponleoapi.config["MAX_CONTENT_LENGTH"] = Config.MAX_CONTENT_LENGTH
couponleoapi.wsgi_app = ProxyFix(
    couponleoapi.wsgi_app,
    x_for=Config.PROXY_FIX_X_FOR,
    x_proto=Config.PROXY_FIX_X_PROTO,
    x_host=Config.PROXY_FIX_X_HOST,
)

Compress(couponleoapi)

API_PREFIX = f"{Config.API_PREFIX}/"
ALLOWED_ORIGINS = {origin.strip() for origin in Config.ALLOWED_ORIGINS if origin.strip()}
ALLOWED_HOSTS = {host.strip().lower() for host in Config.ALLOWED_HOSTS if host.strip()}
ALLOWED_METHODS = "GET, HEAD, POST, PUT, DELETE, OPTIONS"
READ_ONLY_METHODS = {"GET", "HEAD", "OPTIONS"}
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
EXTENSION_ORIGIN_PREFIXES = ("chrome-extension://", "moz-extension://")
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default

    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _is_loopback_host(host: str) -> bool:
    return bool(host) and host in LOOPBACK_HOSTS


def _newsletter_write_allowed(path: str) -> bool:
    normalized_path = (path or "").rstrip("/")
    newsletter_path = f"{Config.API_PREFIX}/newsletter/subscriptions"
    return normalized_path == newsletter_path and Config.ENABLE_NEWSLETTER_SUBSCRIPTIONS


def _telemetry_write_allowed(path: str) -> bool:
    normalized_path = (path or "").rstrip("/")
    telemetry_path = f"{Config.API_PREFIX}/telemetry/events"
    return normalized_path == telemetry_path and Config.ENABLE_TELEMETRY


def _telemetry_read_allowed(path: str) -> bool:
    normalized_path = (path or "").rstrip("/")
    telemetry_paths = {
        f"{Config.API_PREFIX}/telemetry/summary",
        f"{Config.API_PREFIX}/telemetry/events",
    }
    return normalized_path in telemetry_paths and Config.ENABLE_TELEMETRY


def _auth_write_allowed(path: str) -> bool:
    normalized_path = (path or "").rstrip("/")
    auth_paths = {
        f"{Config.API_PREFIX}/auth/sign-up",
        f"{Config.API_PREFIX}/auth/sign-in",
        f"{Config.API_PREFIX}/auth/activate",
        f"{Config.API_PREFIX}/auth/forgot-password",
        f"{Config.API_PREFIX}/auth/reset-password",
    }
    return normalized_path in auth_paths


def _mutation_exception_allowed(path: str) -> bool:
    return _newsletter_write_allowed(path) or _telemetry_write_allowed(path) or _auth_write_allowed(path)


def _loopback_origin_allowed(origin: str, host: str = "") -> bool:
    if not origin:
        return False

    try:
        parsed = urlparse(origin)
    except ValueError:
        return False

    origin_host = (parsed.hostname or "").strip().lower()
    return parsed.scheme in {"http", "https"} and _is_loopback_host(host) and _is_loopback_host(origin_host)


def _origin_allowed(origin: str, host: str = "") -> bool:
    return bool(origin) and (origin in ALLOWED_ORIGINS or _loopback_origin_allowed(origin, host))


def _extension_origin_allowed(origin: str) -> bool:
    return bool(origin) and origin.startswith(EXTENSION_ORIGIN_PREFIXES)


def _read_origin_allowed(origin: str, host: str = "") -> bool:
    return _origin_allowed(origin, host) or _extension_origin_allowed(origin)


def _host_allowed(host: str) -> bool:
    return not host or host in ALLOWED_HOSTS


def _client_key() -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    ip = forwarded or request.headers.get("CF-Connecting-IP") or request.remote_addr or "unknown"
    return f"{ip}:{request.method}:{request.path}"


@couponleoapi.before_request
def enforce_request_policy():
    path = request.path or "/"
    origin = (request.headers.get("Origin") or "").strip()
    host = (request.headers.get("X-Forwarded-Host") or request.host or "").split(":")[0].strip().lower()
    g.request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex

    if path in {"/", "/favicon.ico"}:
        abort(403)

    if not path.startswith(API_PREFIX):
        abort(403)

    if not _host_allowed(host):
        abort(400, description="Host not allowed.")

    if request.method not in READ_ONLY_METHODS | MUTATING_METHODS:
        abort(405, description="Method not allowed.")

    if request.method == "OPTIONS":
        if origin and not _read_origin_allowed(origin, host):
            abort(403)

        response = couponleoapi.make_response("")
        response.status_code = 204
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Request-Id"
        response.headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS
        response.headers["Access-Control-Max-Age"] = "86400"
        return response

    if request.method in MUTATING_METHODS:
        if not Config.ENABLE_MUTATIONS and not _mutation_exception_allowed(path):
            abort(405, description="Mutating endpoints are disabled.")
        if not _origin_allowed(origin, host):
            abort(403)
    elif origin and not _read_origin_allowed(origin, host):
        abort(403)

    limit = Config.RATE_LIMIT_WRITE_REQUESTS if request.method in MUTATING_METHODS else Config.RATE_LIMIT_MAX_REQUESTS
    allowed, retry_after = rate_limiter.hit(_client_key(), limit, Config.RATE_LIMIT_WINDOW_SECONDS)
    if not allowed:
        response = jsonify(
            {
                "error": 1,
                "status": 429,
                "message": "Rate limit exceeded.",
                "requestId": g.request_id
            }
        )
        response.status_code = 429
        response.headers["Retry-After"] = str(retry_after)
        return response


@couponleoapi.after_request
def after_request_func(response):
    origin = (request.headers.get("Origin") or "").strip()
    host = (request.headers.get("X-Forwarded-Host") or request.host or "").split(":")[0].strip().lower()
    telemetry_read_request = _telemetry_read_allowed(request.path) and request.method in {"GET", "HEAD", "OPTIONS"}

    if _read_origin_allowed(origin, host) and not telemetry_read_request:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Request-Id"
        response.headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS

    response.headers["Access-Control-Expose-Headers"] = "Content-Type, X-Request-Id, Retry-After"
    response.headers["X-Request-Id"] = getattr(g, "request_id", "")
    if telemetry_read_request:
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    elif request.method in {"GET", "HEAD"}:
        response.headers["Cache-Control"] = "public, max-age=120, stale-while-revalidate=600"
    else:
        response.headers["Cache-Control"] = "no-store"
    for header, value in Config.SECURITY_HEADERS.items():
        response.headers[header] = value

    return response


from routes.articles import articles_bp
from routes.auth import auth_bp, auth_store
from routes.categories import categories_bp
from routes.coupons import coupons_bp
from routes.locations import locations_bp
from routes.newsletter import newsletter_bp
from routes.stores import stores_bp
from routes.telemetry import telemetry_bp
from data.telemetry_repository import telemetry_repository

couponleoapi.register_blueprint(articles_bp, url_prefix=f"{Config.API_PREFIX}/articles")
couponleoapi.register_blueprint(auth_bp, url_prefix=f"{Config.API_PREFIX}/auth")
couponleoapi.register_blueprint(categories_bp, url_prefix=f"{Config.API_PREFIX}/categories")
couponleoapi.register_blueprint(coupons_bp, url_prefix=f"{Config.API_PREFIX}/coupons")
couponleoapi.register_blueprint(locations_bp, url_prefix=f"{Config.API_PREFIX}/locations")
couponleoapi.register_blueprint(newsletter_bp, url_prefix=f"{Config.API_PREFIX}/newsletter")
couponleoapi.register_blueprint(stores_bp, url_prefix=f"{Config.API_PREFIX}/stores")
couponleoapi.register_blueprint(telemetry_bp, url_prefix=f"{Config.API_PREFIX}/telemetry")


def _warm_optional_storage() -> None:
    try:
        auth_store.ensure_tables()
    except Exception as error:  # pragma: no cover - defensive startup logging only
        couponleoapi.logger.warning("Auth storage warmup skipped: %s", error)

    if Config.ENABLE_TELEMETRY:
        try:
            telemetry_repository.ensure_table()
        except Exception as error:  # pragma: no cover - defensive startup logging only
            couponleoapi.logger.warning("Telemetry storage warmup skipped: %s", error)


_warm_optional_storage()


@couponleoapi.route(f"{Config.API_PREFIX}/health", methods=["GET"])
def health_check():
    return jsonify(
        {
            "status": "healthy",
            "service": "couponleo-api",
            "version": Config.APP_VERSION,
            "authStorage": Config.AUTH_STORAGE_BACKEND,
            "mutationsEnabled": Config.ENABLE_MUTATIONS,
            "telemetryEnabled": Config.ENABLE_TELEMETRY,
        }
    )


@couponleoapi.route(f"{Config.API_PREFIX}/docs", methods=["GET"])
def api_docs():
    return jsonify(
        {
            "apiPrefix": Config.API_PREFIX,
            "endpoints": {
                "categories": [
                    f"{Config.API_PREFIX}/categories",
                    f"{Config.API_PREFIX}/categories/<id-or-slug>",
                    f"{Config.API_PREFIX}/categories/tree"
                ],
                "articles": [
                    f"{Config.API_PREFIX}/articles",
                    f"{Config.API_PREFIX}/articles/<id-or-slug>"
                ],
                "auth": [
                    f"{Config.API_PREFIX}/auth/sign-up",
                    f"{Config.API_PREFIX}/auth/activate",
                    f"{Config.API_PREFIX}/auth/sign-in",
                    f"{Config.API_PREFIX}/auth/forgot-password",
                    f"{Config.API_PREFIX}/auth/reset-password"
                ],
                "coupons": [
                    f"{Config.API_PREFIX}/coupons",
                    f"{Config.API_PREFIX}/coupons/featured",
                    f"{Config.API_PREFIX}/coupons/search?q=<query>&category=<slug>",
                    f"{Config.API_PREFIX}/coupons/store/<store-slug>"
                ],
                "stores": [
                    f"{Config.API_PREFIX}/stores",
                    f"{Config.API_PREFIX}/stores/analytics/summary",
                    f"{Config.API_PREFIX}/stores/match?url=https://www.amazon.in",
                    f"{Config.API_PREFIX}/stores/location/<location>"
                ],
                "locations": [
                    f"{Config.API_PREFIX}/locations",
                    f"{Config.API_PREFIX}/locations/<id-or-name>"
                ],
                "newsletter": [
                    f"{Config.API_PREFIX}/newsletter/subscriptions"
                ]
            }
        }
    )


@couponleoapi.route("/")
def home_page():
    abort(403)


@couponleoapi.route("/favicon.ico")
def favicon():
    abort(403)


@couponleoapi.errorhandler(PermissionError)
def handle_permission_error(error: PermissionError):
    response = jsonify(
        {
            "error": 1,
            "status": 405,
            "message": str(error),
            "requestId": getattr(g, "request_id", "")
        }
    )
    response.status_code = 405
    return response


@couponleoapi.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    response = jsonify(
        {
            "error": 1,
            "status": error.code or 500,
            "message": error.description,
            "requestId": getattr(g, "request_id", "")
        }
    )
    response.status_code = error.code or 500
    return response


@couponleoapi.errorhandler(Exception)
def handle_unexpected_error(_: Exception):
    response = jsonify(
        {
            "error": 1,
            "status": 500,
            "message": "Internal server error.",
            "requestId": getattr(g, "request_id", "")
        }
    )
    response.status_code = 500
    return response


if __name__ == "__main__":
    api_host = os.getenv("COUPONLEO_API_HOST", "127.0.0.1").strip() or "127.0.0.1"
    api_port = int(os.getenv("COUPONLEO_API_PORT", "5000"))
    api_debug = _env_flag("COUPONLEO_API_DEBUG", default=False)

    couponleoapi.run(
        host=api_host,
        debug=api_debug,
        use_reloader=api_debug,
        port=api_port,
        threaded=True,
    )

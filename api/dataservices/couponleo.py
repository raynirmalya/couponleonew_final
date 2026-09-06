from __future__ import annotations

import os
import time
import uuid
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from flask import Flask, abort, g, jsonify, make_response, redirect, request
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
API_ROOT = Config.API_PREFIX.rstrip("/")
ALLOWED_ORIGINS = {origin.strip() for origin in Config.ALLOWED_ORIGINS if origin.strip()}
ALLOWED_HOSTS = {host.strip().lower() for host in Config.ALLOWED_HOSTS if host.strip()}
ALLOWED_METHODS = "GET, HEAD, POST, PUT, DELETE, OPTIONS"
READ_ONLY_METHODS = {"GET", "HEAD", "OPTIONS"}
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
EXTENSION_ORIGIN_PREFIXES = ("chrome-extension://", "moz-extension://")
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
ALLOWED_LOGO_HOST_SUFFIXES = ("brandlogos.org", "brandreward.com", "cuelinks.com")
LOGO_PROXY_TTL_SECONDS = max(600, int(os.getenv("COUPONLEO_LOGO_PROXY_TTL_SECONDS", "86400")))
LOGO_PROXY_TIMEOUT_SECONDS = max(3, int(os.getenv("COUPONLEO_LOGO_PROXY_TIMEOUT_SECONDS", "8")))
_logo_proxy_cache: dict[str, tuple[float, bytes, str]] = {}


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default

    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _is_loopback_host(host: str) -> bool:
    return bool(host) and host in LOOPBACK_HOSTS


def _is_allowed_logo_host(host: str) -> bool:
    normalized_host = (host or "").strip().lower()
    return any(
        normalized_host == suffix or normalized_host.endswith(f".{suffix}")
        for suffix in ALLOWED_LOGO_HOST_SUFFIXES
    )


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


def _read_cache_control(path: str) -> str:
    normalized_path = (path or "").rstrip("/")
    collection_paths = {
        f"{Config.API_PREFIX}/categories",
        f"{Config.API_PREFIX}/coupons",
        f"{Config.API_PREFIX}/coupons/featured",
        f"{Config.API_PREFIX}/locations",
        f"{Config.API_PREFIX}/stores",
    }
    detail_prefixes = (
        f"{Config.API_PREFIX}/categories/",
        f"{Config.API_PREFIX}/coupons/store/",
        f"{Config.API_PREFIX}/stores/",
    )

    if normalized_path in collection_paths:
        return "public, max-age=600, stale-while-revalidate=3600"

    if any(normalized_path.startswith(prefix) for prefix in detail_prefixes):
        return "public, max-age=1200, stale-while-revalidate=7200"

    return "public, max-age=300, stale-while-revalidate=1800"


@couponleoapi.before_request
def enforce_request_policy():
    path = request.path or "/"
    origin = (request.headers.get("Origin") or "").strip()
    host = (request.headers.get("X-Forwarded-Host") or request.host or "").split(":")[0].strip().lower()
    g.request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex

    if path == "/favicon.ico":
        abort(403)

    if path not in {"/", API_ROOT} and not path.startswith(API_PREFIX):
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
    elif request.method in {"GET", "HEAD"} and not response.headers.get("Cache-Control"):
        response.headers["Cache-Control"] = _read_cache_control(request.path)
    elif request.method not in {"GET", "HEAD"}:
        response.headers["Cache-Control"] = "no-store"
    for header, value in Config.SECURITY_HEADERS.items():
        response.headers[header] = value

    return response


@couponleoapi.get(f"{Config.API_PREFIX}/assets/logo")
def proxy_logo_asset():
    target_url = (request.args.get("url") or "").strip()

    if not target_url:
        abort(400, description="A logo url query parameter is required.")

    parsed = urlparse(target_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        abort(400, description="A valid http or https logo url is required.")

    if not _is_allowed_logo_host(parsed.hostname or ""):
        abort(403, description="Logo host not allowed.")

    cached_payload = _logo_proxy_cache.get(target_url)
    now = time.time()
    if cached_payload and cached_payload[0] > now:
        _, payload, content_type = cached_payload
        response = make_response(payload)
        response.headers["Content-Type"] = content_type
        response.headers["Cache-Control"] = f"public, max-age={LOGO_PROXY_TTL_SECONDS}, stale-while-revalidate=604800"
        response.headers["X-Logo-Proxy-Cache"] = "HIT"
        return response

    request_headers = {
        "User-Agent": "CouponLeoLogoProxy/1.0",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    }

    try:
        upstream_request = Request(target_url, headers=request_headers)
        with urlopen(upstream_request, timeout=LOGO_PROXY_TIMEOUT_SECONDS) as upstream_response:
            payload = upstream_response.read()
            content_type = upstream_response.headers.get_content_type() or "image/png"
    except Exception:
        abort(502, description="Unable to fetch the requested logo.")

    if not payload:
        abort(502, description="The requested logo response was empty.")

    _logo_proxy_cache[target_url] = (now + LOGO_PROXY_TTL_SECONDS, payload, content_type)
    if len(_logo_proxy_cache) > 1024:
        expired_keys = [
            cache_key for cache_key, (expires_at, _, _) in _logo_proxy_cache.items()
            if expires_at <= now
        ]
        for cache_key in expired_keys[:256]:
            _logo_proxy_cache.pop(cache_key, None)

    response = make_response(payload)
    response.headers["Content-Type"] = content_type
    response.headers["Cache-Control"] = f"public, max-age={LOGO_PROXY_TTL_SECONDS}, stale-while-revalidate=604800"
    response.headers["X-Logo-Proxy-Cache"] = "MISS"
    return response


from routes.articles import articles_bp
from routes.auth import auth_bp, auth_store
from routes.categories import categories_bp
from routes.coupons import coupons_bp
from routes.locations import locations_bp
from routes.newsletter import newsletter_bp
from routes.stores import stores_bp
from routes.telemetry import telemetry_bp
from data.repository import repository
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

    try:
        repository.ensure_store_schema()
    except Exception as error:  # pragma: no cover - defensive startup logging only
        couponleoapi.logger.warning("Store schema warmup skipped: %s", error)

    if Config.ENABLE_TELEMETRY:
        try:
            telemetry_repository.ensure_table()
        except Exception as error:  # pragma: no cover - defensive startup logging only
            couponleoapi.logger.warning("Telemetry storage warmup skipped: %s", error)

    if _env_flag("COUPONLEO_WARM_SNAPSHOT", False):
        try:
            repository._refresh_data_async_if_needed()
        except Exception as error:  # pragma: no cover - defensive startup logging only
            couponleoapi.logger.warning("Coupon catalog warmup skipped: %s", error)


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


@couponleoapi.route("/", methods=["GET"])
def api_root_redirect():
    return redirect(API_ROOT, code=302)


@couponleoapi.route(API_ROOT, methods=["GET"])
@couponleoapi.route(f"{API_ROOT}/", methods=["GET"])
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

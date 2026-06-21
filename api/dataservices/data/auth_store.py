from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import smtplib
import uuid
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from threading import Lock
from typing import Any, Dict
from urllib.parse import urlencode, urlparse

from config import Config

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:  # pragma: no cover - safe fallback for environments without MySQL support
    pymysql = None
    DictCursor = None


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LENGTH = 8
PASSWORD_ITERATIONS = 600_000
ALLOWED_CONTEXT_KEYS = {"close", "intent", "mode", "next", "returnUrl"}
LOCAL_PREVIEW_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _clean_text(value: Any, limit: int = 0) -> str:
    text = str(value or "").strip()
    return text[:limit] if limit > 0 else text


def _lower_text(value: Any, limit: int = 0) -> str:
    return _clean_text(value, limit=limit).lower()


def _pad_base64(value: str) -> str:
    remainder = len(value) % 4
    if remainder == 0:
        return value
    return value + ("=" * (4 - remainder))


def _encode_token_bytes(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _decode_token_bytes(value: str) -> bytes:
    return base64.urlsafe_b64decode(_pad_base64(value))


def _hash_password(password: str, *, salt: bytes | None = None) -> str:
    salt_bytes = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_encode_token_bytes(salt_bytes)}${_encode_token_bytes(digest)}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = stored_hash.split("$", 3)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    try:
        iterations = int(iterations_raw)
        salt = _decode_token_bytes(salt_raw)
        expected = _decode_token_bytes(digest_raw)
    except (TypeError, ValueError):
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _infer_name_from_email(email: str) -> str:
    handle = email.split("@", 1)[0]
    parts = re.split(r"[._-]+", handle)
    normalized = [part for part in parts if part]
    if not normalized:
        return "CouponLeo Shopper"
    return " ".join(part[:1].upper() + part[1:] for part in normalized)


def _parse_datetime(value: Any) -> datetime | None:
    raw = _clean_text(value)
    if not raw:
        return None

    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _sanitize_context(payload: Any) -> Dict[str, str]:
    if not isinstance(payload, dict):
        return {}

    normalized: Dict[str, str] = {}
    for key in ALLOWED_CONTEXT_KEYS:
        value = _clean_text(payload.get(key), limit=240)
        if not value:
            continue

        if key in {"next", "returnUrl"} and (not value.startswith("/") or value.startswith("//")):
            continue

        if key != "returnUrl" and len(value) > 120:
            value = value[:120]

        normalized[key] = value

    return normalized


def _prefer_local_preview(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    return (parsed.hostname or "").strip().lower() in LOCAL_PREVIEW_HOSTS


def _activation_subject() -> str:
    return "Activate your CouponLeo account"


def _password_reset_subject() -> str:
    return "Reset your CouponLeo password"


def _activation_text(account: Dict[str, Any], activation_url: str, expires_at: str) -> str:
    return (
        f"Hello {account['fullName']},\n\n"
        "Welcome to CouponLeo.\n\n"
        "Activate your account before signing in:\n"
        f"{activation_url}\n\n"
        f"This activation link expires at {expires_at}.\n\n"
        "If you did not request this account, you can ignore this email.\n"
    )


def _password_reset_text(account: Dict[str, Any], reset_url: str, expires_at: str) -> str:
    return (
        f"Hello {account['fullName']},\n\n"
        "We received a request to reset your CouponLeo password.\n\n"
        "Choose a new password here:\n"
        f"{reset_url}\n\n"
        f"This reset link expires at {expires_at}.\n\n"
        "If you did not request a password reset, you can ignore this email.\n"
    )


def _activation_html(account: Dict[str, Any], activation_url: str, expires_at: str) -> str:
    full_name = account["fullName"]
    return (
        "<html><body style=\"font-family:Arial,sans-serif;color:#1f2a44;line-height:1.6;\">"
        f"<p>Hello {full_name},</p>"
        "<p>Welcome to CouponLeo.</p>"
        "<p>Activate your account before signing in:</p>"
        f"<p><a href=\"{activation_url}\" "
        "style=\"display:inline-block;padding:12px 18px;border-radius:999px;background:#4567ea;color:#ffffff;text-decoration:none;font-weight:700;\">"
        "Activate account"
        "</a></p>"
        f"<p>This activation link expires at {expires_at}.</p>"
        "<p>If you did not request this account, you can ignore this email.</p>"
        "</body></html>"
    )


def _password_reset_html(account: Dict[str, Any], reset_url: str, expires_at: str) -> str:
    full_name = account["fullName"]
    return (
        "<html><body style=\"font-family:Arial,sans-serif;color:#1f2a44;line-height:1.6;\">"
        f"<p>Hello {full_name},</p>"
        "<p>We received a request to reset your CouponLeo password.</p>"
        "<p>Choose a new password here:</p>"
        f"<p><a href=\"{reset_url}\" "
        "style=\"display:inline-block;padding:12px 18px;border-radius:999px;background:#4567ea;color:#ffffff;text-decoration:none;font-weight:700;\">"
        "Reset password"
        "</a></p>"
        f"<p>This reset link expires at {expires_at}.</p>"
        "<p>If you did not request a password reset, you can ignore this email.</p>"
        "</body></html>"
    )


def _load_smtp_settings() -> Dict[str, Any] | None:
    host = _clean_text(
        os.getenv("COUPONLEO_AUTH_SMTP_HOST") or os.getenv("COUPONLEO_NEWSLETTER_SMTP_HOST")
    )
    from_email = _clean_text(
        os.getenv("COUPONLEO_AUTH_FROM_EMAIL") or os.getenv("COUPONLEO_NEWSLETTER_FROM_EMAIL") or Config.SUPPORT_EMAIL
    )
    if not host or not from_email:
        return None

    return {
        "host": host,
        "port": int(_clean_text(os.getenv("COUPONLEO_AUTH_SMTP_PORT") or os.getenv("COUPONLEO_NEWSLETTER_SMTP_PORT")) or "587"),
        "username": _clean_text(os.getenv("COUPONLEO_AUTH_SMTP_USERNAME") or os.getenv("COUPONLEO_NEWSLETTER_SMTP_USERNAME")),
        "password": _clean_text(os.getenv("COUPONLEO_AUTH_SMTP_PASSWORD") or os.getenv("COUPONLEO_NEWSLETTER_SMTP_PASSWORD")),
        "from_email": from_email,
        "from_name": _clean_text(
            os.getenv("COUPONLEO_AUTH_FROM_NAME") or os.getenv("COUPONLEO_NEWSLETTER_FROM_NAME") or Config.SUPPORT_NAME
        ) or "CouponLeo",
        "use_ssl": _lower_text(os.getenv("COUPONLEO_AUTH_SMTP_SSL") or os.getenv("COUPONLEO_NEWSLETTER_SMTP_SSL")) in {"1", "true", "yes", "on"},
        "use_starttls": _lower_text(
            os.getenv("COUPONLEO_AUTH_SMTP_STARTTLS") or os.getenv("COUPONLEO_NEWSLETTER_SMTP_STARTTLS") or "true"
        ) in {"1", "true", "yes", "on"},
    }


def _send_email(*, recipient: str, subject: str, text_body: str, html_body: str, smtp_settings: Dict[str, Any]) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{smtp_settings['from_name']} <{smtp_settings['from_email']}>"
    message["To"] = recipient
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    if smtp_settings["use_ssl"]:
        with smtplib.SMTP_SSL(smtp_settings["host"], smtp_settings["port"], timeout=20) as server:
            if smtp_settings["username"]:
                server.login(smtp_settings["username"], smtp_settings["password"])
            server.send_message(message)
        return

    with smtplib.SMTP(smtp_settings["host"], smtp_settings["port"], timeout=20) as server:
        server.ehlo()
        if smtp_settings["use_starttls"]:
            server.starttls()
            server.ehlo()
        if smtp_settings["username"]:
            server.login(smtp_settings["username"], smtp_settings["password"])
        server.send_message(message)


class AuthStoreError(ValueError):
    def __init__(self, message: str, *, code: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class CouponleoAuthStore:
    def __init__(
        self,
        activation_ttl_hours: int = 72,
        reset_ttl_hours: int = 2,
    ) -> None:
        self._activation_ttl_hours = max(1, activation_ttl_hours)
        self._reset_ttl_hours = max(1, reset_ttl_hours)
        self._lock = Lock()
        self._tables_ready = False
        self._schema_sql = (Path(__file__).resolve().parent / "auth_schema.sql").read_text(encoding="utf-8")

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
            raise RuntimeError("pymysql is required for CouponLeo auth MySQL access.")

        connection_kwargs = {
            "host": Config.MYSQL_HOST,
            "port": int(Config.MYSQL_PORT),
            "user": Config.MYSQL_USER,
            "password": Config.MYSQL_PASSWORD,
            "database": Config.MYSQL_DB,
            "cursorclass": DictCursor,
            "charset": "utf8mb4",
            "connect_timeout": max(1, int(Config.MYSQL_CONNECT_TIMEOUT)),
            "read_timeout": max(1, int(Config.MYSQL_READ_TIMEOUT)),
            "write_timeout": max(1, int(Config.MYSQL_WRITE_TIMEOUT)),
            "autocommit": False,
        }

        if Config.MYSQL_SSL_REQUIRED:
            connection_kwargs["ssl"] = {"ssl": {}}

        return pymysql.connect(**connection_kwargs)

    def ensure_tables(self) -> bool:
        if self._tables_ready:
            return True

        if not self._db_configured():
            return False

        statements = [statement.strip() for statement in self._schema_sql.split(";") if statement.strip()]
        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                for statement in statements:
                    cursor.execute(statement)
            connection.commit()
        finally:
            connection.close()

        self._tables_ready = True
        return True

    def _ensure_storage_ready(self) -> None:
        if not self._db_configured():
            raise AuthStoreError(
                "CouponLeo auth storage is not configured for database persistence.",
                code="auth_storage_unavailable",
                status_code=503,
            )

        try:
            self.ensure_tables()
        except Exception as error:
            raise AuthStoreError(
                "CouponLeo auth storage is unavailable right now. Please try again shortly.",
                code="auth_storage_unavailable",
                status_code=503,
            ) from error

    def sign_up(self, payload: Dict[str, Any], site_base_url: str) -> Dict[str, Any]:
        normalized = self._normalize_sign_up_payload(payload)
        now = _utc_now()
        expires_at = now + timedelta(hours=self._activation_ttl_hours)
        activation_token = secrets.token_urlsafe(32)

        with self._lock:
            self._ensure_storage_ready()
            connection = self._connect_mysql()
            try:
                with connection.cursor() as cursor:
                    existing = deepcopy(self._load_account(cursor, normalized["email"], for_update=True) or {})
                    if existing.get("status") == "active":
                        raise AuthStoreError(
                            "An account with this email already exists. Please sign in.",
                            code="account_exists",
                            status_code=409,
                        )

                    account = {
                        "id": existing.get("id") or uuid.uuid4().hex,
                        "email": normalized["email"],
                        "fullName": normalized["fullName"] or _infer_name_from_email(normalized["email"]),
                        "provider": "email",
                        "status": "pending_activation",
                        "createdAt": existing.get("createdAt") or now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                        "updatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                        "activatedAt": None,
                        "lastSignInAt": existing.get("lastSignInAt"),
                        "passwordHash": _hash_password(normalized["password"]),
                        "activationTokenHash": _hash_token(activation_token),
                        "activationRequestedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                        "activationExpiresAt": expires_at.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                        "resetTokenHash": "",
                        "resetRequestedAt": None,
                        "resetExpiresAt": None,
                    }
                    self._upsert_account(cursor, account)
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()

        activation_url = self._build_activation_url(site_base_url, normalized["email"], activation_token, normalized["context"])
        delivery = self._store_activation_message(account, activation_url)

        return {
            "account": self._public_account(account),
            "activation": {
                "email": account["email"],
                "activationToken": activation_token,
                "activationUrl": activation_url,
                "deliveryMode": delivery["deliveryMode"],
                "deliveryMessage": delivery["deliveryMessage"],
                "expiresAt": account["activationExpiresAt"],
            },
        }

    def activate_account(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        email = _lower_text(payload.get("email"), limit=254)
        token = _clean_text(payload.get("token"), limit=240)
        if not EMAIL_PATTERN.match(email) or not token:
            raise AuthStoreError(
                "A valid activation email and token are required.",
                code="activation_invalid",
                status_code=400,
            )

        with self._lock:
            self._ensure_storage_ready()
            connection = self._connect_mysql()
            try:
                with connection.cursor() as cursor:
                    account = self._load_account(cursor, email, for_update=True)
                    if not account:
                        raise AuthStoreError(
                            "We could not find an account for this activation link.",
                            code="account_not_found",
                            status_code=404,
                        )

                    if account.get("status") == "active":
                        connection.rollback()
                        return {
                            "account": self._public_account(account),
                            "message": "Account already activated. You can sign in now.",
                        }

                    expires_at = _parse_datetime(account.get("activationExpiresAt"))
                    if expires_at and expires_at < _utc_now():
                        raise AuthStoreError(
                            "Activation link expired. Please sign up again to request a fresh email.",
                            code="activation_expired",
                            status_code=410,
                        )

                    if not hmac.compare_digest(_hash_token(token), _clean_text(account.get("activationTokenHash"))):
                        raise AuthStoreError(
                            "Activation link is invalid. Please use the latest email.",
                            code="activation_invalid",
                            status_code=400,
                        )

                    account["status"] = "active"
                    account["activatedAt"] = _utc_now_iso()
                    account["updatedAt"] = account["activatedAt"]
                    account["activationTokenHash"] = ""
                    self._upsert_account(cursor, account)
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()

        return {
            "account": self._public_account(account),
            "message": "Account activated. You can sign in now.",
        }

    def request_password_reset(self, payload: Dict[str, Any], site_base_url: str) -> Dict[str, Any]:
        email = _lower_text(payload.get("email"), limit=254)
        if not EMAIL_PATTERN.match(email):
            raise AuthStoreError(
                "A valid email address is required.",
                code="validation_error",
                status_code=400,
            )

        generic_message = "If an account exists for this email, a reset link has been prepared."
        reset_context = _sanitize_context(payload.get("resetContext"))

        with self._lock:
            self._ensure_storage_ready()
            connection = self._connect_mysql()
            try:
                with connection.cursor() as cursor:
                    account = self._load_account(cursor, email, for_update=True)
                    if not account or _clean_text(account.get("provider"), limit=24).lower() != "email":
                        connection.rollback()
                        return {
                            "email": email,
                            "message": generic_message,
                            "deliveryMode": "masked",
                            "deliveryMessage": generic_message,
                            "expiresAt": None,
                            "resetUrl": None,
                            "resetReady": False,
                        }

                    now = _utc_now()
                    expires_at = now + timedelta(hours=self._reset_ttl_hours)
                    reset_token = secrets.token_urlsafe(32)
                    account["resetTokenHash"] = _hash_token(reset_token)
                    account["resetRequestedAt"] = now.replace(microsecond=0).isoformat().replace("+00:00", "Z")
                    account["resetExpiresAt"] = expires_at.replace(microsecond=0).isoformat().replace("+00:00", "Z")
                    account["updatedAt"] = account["resetRequestedAt"]
                    self._upsert_account(cursor, account)
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()

        reset_url = self._build_password_reset_url(site_base_url, email, reset_token, reset_context)
        delivery = self._store_password_reset_message(account, reset_url)

        return {
            "email": email,
            "message": generic_message,
            "deliveryMode": delivery["deliveryMode"],
            "deliveryMessage": delivery["deliveryMessage"],
            "expiresAt": account["resetExpiresAt"],
            "resetUrl": reset_url,
            "resetReady": True,
        }

    def reset_password(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        email = _lower_text(payload.get("email"), limit=254)
        token = _clean_text(payload.get("token"), limit=240)
        password = _clean_text(payload.get("password"), limit=240)

        if not EMAIL_PATTERN.match(email):
            raise AuthStoreError(
                "A valid email address is required.",
                code="validation_error",
                status_code=400,
            )
        if not token:
            raise AuthStoreError(
                "A valid reset token is required.",
                code="reset_invalid",
                status_code=400,
            )
        if len(password) < MIN_PASSWORD_LENGTH:
            raise AuthStoreError(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters long.",
                code="validation_error",
                status_code=400,
            )

        with self._lock:
            self._ensure_storage_ready()
            connection = self._connect_mysql()
            try:
                with connection.cursor() as cursor:
                    account = self._load_account(cursor, email, for_update=True)
                    if not account:
                        raise AuthStoreError(
                            "We could not find an account for this reset link.",
                            code="account_not_found",
                            status_code=404,
                        )

                    expires_at = _parse_datetime(account.get("resetExpiresAt"))
                    if expires_at and expires_at < _utc_now():
                        raise AuthStoreError(
                            "Reset link expired. Please request a fresh password reset.",
                            code="reset_expired",
                            status_code=410,
                        )

                    if not hmac.compare_digest(_hash_token(token), _clean_text(account.get("resetTokenHash"))):
                        raise AuthStoreError(
                            "Reset link is invalid. Please use the latest email.",
                            code="reset_invalid",
                            status_code=400,
                        )

                    account["passwordHash"] = _hash_password(password)
                    account["resetTokenHash"] = ""
                    account["resetRequestedAt"] = None
                    account["resetExpiresAt"] = None
                    account["updatedAt"] = _utc_now_iso()
                    self._upsert_account(cursor, account)
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()

        requires_activation = _clean_text(account.get("status"), limit=32) != "active"
        message = (
            "Password updated. Activate your account before signing in."
            if requires_activation
            else "Password updated. You can sign in now."
        )
        return {
            "email": email,
            "accountStatus": _clean_text(account.get("status"), limit=32) or "pending_activation",
            "requiresActivation": requires_activation,
            "message": message,
        }

    def authenticate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        email = _lower_text(payload.get("email"), limit=254)
        password = _clean_text(payload.get("password"), limit=240)
        if not EMAIL_PATTERN.match(email) or not password:
            raise AuthStoreError(
                "A valid email and password are required.",
                code="invalid_credentials",
                status_code=400,
            )

        with self._lock:
            self._ensure_storage_ready()
            connection = self._connect_mysql()
            try:
                with connection.cursor() as cursor:
                    account = self._load_account(cursor, email, for_update=True)
                    if not account:
                        raise AuthStoreError(
                            "No account found for this email. Create your account first.",
                            code="account_not_found",
                            status_code=404,
                        )

                    if not _verify_password(password, _clean_text(account.get("passwordHash"))):
                        raise AuthStoreError(
                            "Invalid email or password.",
                            code="invalid_credentials",
                            status_code=401,
                        )

                    if account.get("status") != "active":
                        raise AuthStoreError(
                            "Activation not done yet. Please activate your account before signing in.",
                            code="activation_required",
                            status_code=403,
                        )

                    account["lastSignInAt"] = _utc_now_iso()
                    account["updatedAt"] = account["lastSignInAt"]
                    self._upsert_account(cursor, account)
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()

        return {
            "session": {
                "fullName": _clean_text(account.get("fullName"), limit=120) or _infer_name_from_email(email),
                "email": email,
                "provider": "email",
                "signedInAt": _clean_text(account.get("lastSignInAt")) or _utc_now_iso(),
            },
            "account": self._public_account(account),
        }

    def _normalize_sign_up_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        full_name = _clean_text(payload.get("fullName"), limit=120)
        email = _lower_text(payload.get("email"), limit=254)
        password = _clean_text(payload.get("password"), limit=240)

        if not full_name:
            raise AuthStoreError("Full name is required.", code="validation_error", status_code=400)
        if not EMAIL_PATTERN.match(email):
            raise AuthStoreError("A valid email address is required.", code="validation_error", status_code=400)
        if len(password) < MIN_PASSWORD_LENGTH:
            raise AuthStoreError(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters long.",
                code="validation_error",
                status_code=400,
            )

        return {
            "fullName": full_name,
            "email": email,
            "password": password,
            "context": _sanitize_context(payload.get("activationContext")),
        }

    def _load_account(self, cursor, email: str, *, for_update: bool = False) -> Dict[str, Any] | None:
        query = """
            SELECT
                account_uid,
                email,
                full_name,
                provider,
                status,
                password_hash,
                activation_token_hash,
                activation_requested_at,
                activation_expires_at,
                reset_token_hash,
                reset_requested_at,
                reset_expires_at,
                created_at,
                updated_at,
                activated_at,
                last_sign_in_at
            FROM auth_accounts
            WHERE email = %s
            LIMIT 1
        """
        if for_update:
            query += " FOR UPDATE"

        cursor.execute(query, [email])
        row = cursor.fetchone()
        if not row:
            return None

        return {
            "id": _clean_text(row.get("account_uid"), limit=64),
            "email": _lower_text(row.get("email"), limit=254),
            "fullName": _clean_text(row.get("full_name"), limit=120),
            "provider": _clean_text(row.get("provider"), limit=24) or "email",
            "status": _clean_text(row.get("status"), limit=32) or "pending_activation",
            "passwordHash": _clean_text(row.get("password_hash")),
            "activationTokenHash": _clean_text(row.get("activation_token_hash")),
            "activationRequestedAt": self._iso_datetime(row.get("activation_requested_at")),
            "activationExpiresAt": self._iso_datetime(row.get("activation_expires_at")),
            "resetTokenHash": _clean_text(row.get("reset_token_hash")),
            "resetRequestedAt": self._iso_datetime(row.get("reset_requested_at")),
            "resetExpiresAt": self._iso_datetime(row.get("reset_expires_at")),
            "createdAt": self._iso_datetime(row.get("created_at")),
            "updatedAt": self._iso_datetime(row.get("updated_at")),
            "activatedAt": self._iso_datetime(row.get("activated_at")),
            "lastSignInAt": self._iso_datetime(row.get("last_sign_in_at")),
        }

    def _upsert_account(self, cursor, account: Dict[str, Any]) -> None:
        cursor.execute(
            """
            INSERT INTO auth_accounts (
                account_uid,
                email,
                full_name,
                provider,
                status,
                password_hash,
                activation_token_hash,
                activation_requested_at,
                activation_expires_at,
                reset_token_hash,
                reset_requested_at,
                reset_expires_at,
                created_at,
                updated_at,
                activated_at,
                last_sign_in_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                full_name = VALUES(full_name),
                provider = VALUES(provider),
                status = VALUES(status),
                password_hash = VALUES(password_hash),
                activation_token_hash = VALUES(activation_token_hash),
                activation_requested_at = VALUES(activation_requested_at),
                activation_expires_at = VALUES(activation_expires_at),
                reset_token_hash = VALUES(reset_token_hash),
                reset_requested_at = VALUES(reset_requested_at),
                reset_expires_at = VALUES(reset_expires_at),
                updated_at = VALUES(updated_at),
                activated_at = VALUES(activated_at),
                last_sign_in_at = VALUES(last_sign_in_at)
            """,
            [
                _clean_text(account.get("id"), limit=64) or uuid.uuid4().hex,
                _lower_text(account.get("email"), limit=254),
                _clean_text(account.get("fullName"), limit=120),
                _clean_text(account.get("provider"), limit=24) or "email",
                _clean_text(account.get("status"), limit=32) or "pending_activation",
                _clean_text(account.get("passwordHash")),
                _clean_text(account.get("activationTokenHash")),
                self._datetime_for_db(account.get("activationRequestedAt")),
                self._datetime_for_db(account.get("activationExpiresAt")),
                _clean_text(account.get("resetTokenHash")),
                self._datetime_for_db(account.get("resetRequestedAt")),
                self._datetime_for_db(account.get("resetExpiresAt")),
                self._datetime_for_db(account.get("createdAt")) or _utc_now().replace(tzinfo=None),
                self._datetime_for_db(account.get("updatedAt")) or _utc_now().replace(tzinfo=None),
                self._datetime_for_db(account.get("activatedAt")),
                self._datetime_for_db(account.get("lastSignInAt")),
            ],
        )

    def _store_activation_message(self, account: Dict[str, Any], activation_url: str) -> Dict[str, str]:
        subject = _activation_subject()
        text_body = _activation_text(account, activation_url, _clean_text(account.get("activationExpiresAt")))
        html_body = _activation_html(account, activation_url, _clean_text(account.get("activationExpiresAt")))

        delivery_mode = "preview"
        delivery_message = "Activation link prepared for the local preview flow."
        smtp_settings = None if _prefer_local_preview(activation_url) else _load_smtp_settings()
        if smtp_settings:
            try:
                _send_email(
                    recipient=account["email"],
                    subject=subject,
                    text_body=text_body,
                    html_body=html_body,
                    smtp_settings=smtp_settings,
                )
                delivery_mode = "smtp"
                delivery_message = "Activation email sent."
            except Exception:
                delivery_mode = "preview"
                delivery_message = "Activation email could not be sent, so a local preview link was prepared."

        self._append_outbox_message(
            {
                "id": uuid.uuid4().hex,
                "kind": "account_activation",
                "email": account["email"],
                "subject": subject,
                "text": text_body,
                "html": html_body,
                "activationUrl": activation_url,
                "deliveryMode": delivery_mode,
                "createdAt": _utc_now_iso(),
            }
        )

        return {
            "deliveryMode": delivery_mode,
            "deliveryMessage": delivery_message,
        }

    def _store_password_reset_message(self, account: Dict[str, Any], reset_url: str) -> Dict[str, str]:
        subject = _password_reset_subject()
        text_body = _password_reset_text(account, reset_url, _clean_text(account.get("resetExpiresAt")))
        html_body = _password_reset_html(account, reset_url, _clean_text(account.get("resetExpiresAt")))

        delivery_mode = "preview"
        delivery_message = "Password reset link prepared for the local preview flow."
        smtp_settings = None if _prefer_local_preview(reset_url) else _load_smtp_settings()
        if smtp_settings:
            try:
                _send_email(
                    recipient=account["email"],
                    subject=subject,
                    text_body=text_body,
                    html_body=html_body,
                    smtp_settings=smtp_settings,
                )
                delivery_mode = "smtp"
                delivery_message = "Password reset email sent."
            except Exception:
                delivery_mode = "preview"
                delivery_message = "Password reset email could not be sent, so a local preview link was prepared."

        self._append_outbox_message(
            {
                "id": uuid.uuid4().hex,
                "kind": "password_reset",
                "email": account["email"],
                "subject": subject,
                "text": text_body,
                "html": html_body,
                "resetUrl": reset_url,
                "deliveryMode": delivery_mode,
                "createdAt": _utc_now_iso(),
            }
        )

        return {
            "deliveryMode": delivery_mode,
            "deliveryMessage": delivery_message,
        }

    def _append_outbox_message(self, message: Dict[str, Any]) -> None:
        try:
            self._ensure_storage_ready()
        except AuthStoreError:
            return

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO auth_outbox_messages (
                        message_uid,
                        kind,
                        email,
                        subject,
                        text_body,
                        html_body,
                        action_url,
                        delivery_mode,
                        created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        _clean_text(message.get("id"), limit=64) or uuid.uuid4().hex,
                        _clean_text(message.get("kind"), limit=32),
                        _lower_text(message.get("email"), limit=254),
                        _clean_text(message.get("subject"), limit=255),
                        str(message.get("text") or ""),
                        str(message.get("html") or ""),
                        _clean_text(message.get("activationUrl") or message.get("resetUrl"), limit=2048),
                        _clean_text(message.get("deliveryMode"), limit=24) or "preview",
                        self._datetime_for_db(message.get("createdAt")) or _utc_now().replace(tzinfo=None),
                    ],
                )
            connection.commit()
        except Exception:
            connection.rollback()
        finally:
            connection.close()

    def _datetime_for_db(self, value: Any) -> datetime | None:
        parsed = _parse_datetime(value)
        if not parsed:
            return None
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed

    def _iso_datetime(self, value: Any) -> str | None:
        parsed = _parse_datetime(value)
        if not parsed:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        else:
            parsed = parsed.astimezone(timezone.utc)
        return parsed.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    def _build_activation_url(
        self,
        site_base_url: str,
        email: str,
        token: str,
        context: Dict[str, str],
    ) -> str:
        base_url = _clean_text(site_base_url) or "http://127.0.0.1:5173"
        base_url = base_url.rstrip("/")
        query = {
            "email": email,
            "activationToken": token,
        }
        for key, value in context.items():
            query[key] = value
        return f"{base_url}/sign-in?{urlencode(query)}"

    def _build_password_reset_url(
        self,
        site_base_url: str,
        email: str,
        token: str,
        context: Dict[str, str],
    ) -> str:
        base_url = _clean_text(site_base_url) or "http://127.0.0.1:5173"
        base_url = base_url.rstrip("/")
        query = {
            "email": email,
            "resetToken": token,
        }
        for key, value in context.items():
            query[key] = value
        return f"{base_url}/forgot-password?{urlencode(query)}"

    def _public_account(self, account: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": _clean_text(account.get("id"), limit=64),
            "fullName": _clean_text(account.get("fullName"), limit=120),
            "email": _lower_text(account.get("email"), limit=254),
            "provider": "email",
            "status": _clean_text(account.get("status"), limit=32) or "pending_activation",
            "createdAt": _clean_text(account.get("createdAt"), limit=48),
            "updatedAt": _clean_text(account.get("updatedAt"), limit=48),
            "activatedAt": _clean_text(account.get("activatedAt"), limit=48) or None,
            "lastSignInAt": _clean_text(account.get("lastSignInAt"), limit=48) or None,
        }

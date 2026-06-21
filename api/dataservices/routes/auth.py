from __future__ import annotations

from urllib.parse import urlparse

from flask import Blueprint, g, jsonify, request

from config import Config
from data.auth_store import AuthStoreError, CouponleoAuthStore


auth_bp = Blueprint("auth", __name__)
auth_store = CouponleoAuthStore(
    activation_ttl_hours=Config.AUTH_ACTIVATION_TTL_HOURS,
    reset_ttl_hours=Config.AUTH_RESET_TTL_HOURS,
)


def _site_base_url() -> str:
    origin = (request.headers.get("Origin") or "").strip()
    if origin:
        parsed = urlparse(origin)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return origin.rstrip("/")

    return Config.SITE_BASE_URL.rstrip("/")


def _auth_error_response(error: AuthStoreError):
    response = jsonify(
        {
            "error": 1,
            "status": error.status_code,
            "code": error.code,
            "message": str(error),
            "requestId": getattr(g, "request_id", ""),
        }
    )
    response.status_code = error.status_code
    return response


@auth_bp.post("/sign-up")
def sign_up():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        response = jsonify(
            {
                "error": 1,
                "status": 400,
                "code": "validation_error",
                "message": "A JSON sign-up payload is required.",
                "requestId": getattr(g, "request_id", ""),
            }
        )
        response.status_code = 400
        return response

    try:
        result = auth_store.sign_up(payload, _site_base_url())
    except AuthStoreError as error:
        return _auth_error_response(error)

    response = jsonify({"data": result})
    response.status_code = 201
    return response


@auth_bp.post("/activate")
def activate_account():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        response = jsonify(
            {
                "error": 1,
                "status": 400,
                "code": "activation_invalid",
                "message": "A JSON activation payload is required.",
                "requestId": getattr(g, "request_id", ""),
            }
        )
        response.status_code = 400
        return response

    try:
        result = auth_store.activate_account(payload)
    except AuthStoreError as error:
        return _auth_error_response(error)

    return jsonify({"data": result})


@auth_bp.post("/sign-in")
def sign_in():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        response = jsonify(
            {
                "error": 1,
                "status": 400,
                "code": "invalid_credentials",
                "message": "A JSON sign-in payload is required.",
                "requestId": getattr(g, "request_id", ""),
            }
        )
        response.status_code = 400
        return response

    try:
        result = auth_store.authenticate(payload)
    except AuthStoreError as error:
        return _auth_error_response(error)

    return jsonify({"data": result})


@auth_bp.post("/forgot-password")
def forgot_password():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        response = jsonify(
            {
                "error": 1,
                "status": 400,
                "code": "validation_error",
                "message": "A JSON forgot-password payload is required.",
                "requestId": getattr(g, "request_id", ""),
            }
        )
        response.status_code = 400
        return response

    try:
        result = auth_store.request_password_reset(payload, _site_base_url())
    except AuthStoreError as error:
        return _auth_error_response(error)

    return jsonify({"data": result})


@auth_bp.post("/reset-password")
def reset_password():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        response = jsonify(
            {
                "error": 1,
                "status": 400,
                "code": "validation_error",
                "message": "A JSON reset-password payload is required.",
                "requestId": getattr(g, "request_id", ""),
            }
        )
        response.status_code = 400
        return response

    try:
        result = auth_store.reset_password(payload)
    except AuthStoreError as error:
        return _auth_error_response(error)

    return jsonify({"data": result})

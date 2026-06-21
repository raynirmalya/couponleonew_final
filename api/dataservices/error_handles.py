# error_handles.py
from flask import jsonify

def not_found(message="Resource not found"):
    return jsonify({
        "error": 1,
        "status": 404,
        "message": message
    }), 404

def bad_request(message="Bad request"):
    return jsonify({
        "error": 1,
        "status": 400,
        "message": message
    }), 400

def server_error(message="Internal server error"):
    return jsonify({
        "error": 1,
        "status": 500,
        "message": message
    }), 500

def forbidden(message="Forbidden"):
    return jsonify({
        "error": 1,
        "status": 403,
        "message": message
    }), 403

def success_response(data=None, message="Success", **kwargs):
    response = {
        "status": 200,
        "message": message
    }
    if data is not None:
        response["data"] = data
    response.update(kwargs)
    return jsonify(response), 200

def paginated_response(data, pagination):
    return jsonify({
        "status": 200,
        "data": data,
        "pagination": pagination
    }), 200
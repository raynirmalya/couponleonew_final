# utils/db_utils.py
from typing import List, Dict, Any, Optional, Tuple
from flask import jsonify
import traceback

def row_tuples_to_dicts(cursor, rows) -> List[Dict[str, Any]]:
    """Convert DB rows (tuples) to list of dicts using cursor.description"""
    if not cursor or not cursor.description:
        return []
    col_names = [desc[0] for desc in cursor.description]
    result = []
    for r in rows:
        # If rows are already dict-like (some drivers), normalize:
        if isinstance(r, dict):
            result.append(r)
            continue
        rowd = {}
        for i, col in enumerate(col_names):
            try:
                rowd[col] = r[i]
            except Exception:
                rowd[col] = None
        result.append(rowd)
    return result

def make_error_response(message: str = "Internal server error", code: int = 500):
    return jsonify({"error": 1, "status": code, "message": message}), code

def make_ok_list_response(data: List[Dict], code: int = 200):
    return jsonify({"status": code, "count": len(data), "data": data}), code

def make_ok_single_response(obj: Dict, code: int = 200):
    return jsonify({"status": code, "data": obj}), code

def make_ok_message(message: str = "OK", code: int = 200):
    return jsonify({"status": code, "message": message}), code

def safe_close(cursor, conn):
    try:
        if cursor:
            cursor.close()
    except Exception:
        pass
    try:
        if conn:
            conn.close()
    except Exception:
        pass

# utils.py
import math
from datetime import datetime, date
import json
from flask import request

def get_record_start_position(request_obj):
    """Get start position for pagination"""
    start = request_obj.args.get('start', 0, type=int)
    return max(0, start)

def get_pagination_params():
    """Get pagination parameters from request"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    
    # Validate parameters
    page = max(1, page)
    limit = max(1, min(limit, 100))
    
    return page, limit

def calculate_pagination_metadata(total_count, page, limit):
    """Calculate pagination metadata"""
    total_pages = max(1, math.ceil(total_count / limit))
    current_page = min(page, total_pages)
    has_next = current_page < total_pages
    has_prev = current_page > 1
    offset = (current_page - 1) * limit
    
    return {
        'total_count': total_count,
        'total_pages': total_pages,
        'current_page': current_page,
        'has_next': has_next,
        'has_prev': has_prev,
        'limit': limit,
        'offset': offset
    }

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

def build_where_clause(filters):
    """Build WHERE clause from filters dictionary"""
    if not filters:
        return "", []
    
    conditions = []
    params = []
    
    for key, value in filters.items():
        if value is not None:
            if isinstance(value, str):
                conditions.append(f"{key} = %s")
                params.append(value)
            elif isinstance(value, list):
                placeholders = ', '.join(['%s'] * len(value))
                conditions.append(f"{key} IN ({placeholders})")
                params.extend(value)
            elif isinstance(value, dict):
                if 'like' in value:
                    conditions.append(f"{key} LIKE %s")
                    params.append(f"%{value['like']}%")
                elif 'gt' in value:
                    conditions.append(f"{key} > %s")
                    params.append(value['gt'])
                elif 'lt' in value:
                    conditions.append(f"{key} < %s")
                    params.append(value['lt'])
    
    if conditions:
        return "WHERE " + " AND ".join(conditions), params
    return "", params
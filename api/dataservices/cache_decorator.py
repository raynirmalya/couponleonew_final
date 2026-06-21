# # utils/cache_decorator.py
# from functools import wraps
# from flask import request, jsonify
# from cache import cache_get, cache_set

# def cache_api(prefix, ttl=300):
#     def decorator(fn):
#         @wraps(fn)
#         def wrapper(*args, **kwargs):

#             args_key = ":".join(str(v) for v in args)
#             query_key = "&".join(
#                 f"{k}={v}" for k, v in sorted(request.args.items())
#             )

#             cache_key = f"{prefix}:{args_key}:{query_key}"

#             cached = cache_get(cache_key)
#             if cached:
#                 return jsonify(cached), 200

#             response, status = fn(*args, **kwargs)

#             if status == 200:
#                 cache_set(cache_key, response.json, ttl)

#             return response, status
#         return wrapper
#     return decorator



# cache_decorator.py
import json
from functools import wraps
from flask import request, make_response
from cache import redis_client

def cache_api(key_prefix, ttl=300):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            cache_key = f"{key_prefix}:{request.full_path}"

            cached = redis_client.get(cache_key)
            if cached:
                data = json.loads(cached)
                return make_response(data["body"], data["status"], data["headers"])

            result = fn(*args, **kwargs)

            # ✅ HANDLE BOTH CASES
            if isinstance(result, tuple):
                response, status = result
            else:
                response = result
                status = response.status_code

            body = response.get_data(as_text=True)
            headers = dict(response.headers)

            redis_client.setex(
                cache_key,
                ttl,
                json.dumps({
                    "body": body,
                    "status": status,
                    "headers": headers
                })
            )

            return response, status

        return wrapper
    return decorator

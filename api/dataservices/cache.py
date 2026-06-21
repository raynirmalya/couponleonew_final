from __future__ import annotations

import hashlib
import os
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Deque, Dict, Tuple

try:
    import redis
except Exception:
    redis = None


redis_client = None

if redis is not None and os.getenv("REDIS_URL"):
    try:
        redis_client = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
        redis_client.ping()
    except Exception:
        redis_client = None


class RequestRateLimiter:
    def __init__(self) -> None:
        self._lock = Lock()
        self._windows: Dict[str, Deque[float]] = defaultdict(deque)

    def hit(self, key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
        if redis_client is not None:
            return self._hit_redis(key, limit, window_seconds)
        return self._hit_local(key, limit, window_seconds)

    def _hit_local(self, key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
        now = time.time()
        with self._lock:
            bucket = self._windows[key]
            while bucket and bucket[0] <= now - window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                return False, retry_after
            bucket.append(now)
            return True, 0

    def _hit_redis(self, key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
        bucket = int(time.time() // window_seconds)
        key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
        redis_key = f"couponleo:rate:{key_hash}:{bucket}"
        retry_after = max(1, window_seconds - int(time.time() % window_seconds))

        pipe = redis_client.pipeline()
        pipe.incr(redis_key)
        pipe.expire(redis_key, window_seconds + 1)
        count, _ = pipe.execute()

        return count <= limit, 0 if count <= limit else retry_after


rate_limiter = RequestRateLimiter()

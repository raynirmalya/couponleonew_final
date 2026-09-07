"""Warm lazy routes and reject oversized/diagnostic headers on the UI upstream.
Usage: python3 deploy/check-response-headers.py http://127.0.0.1:4173
"""
import json
import sys
import urllib.request

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173").rstrip("/")
paths = ["/", "/stores/lenovo-com", "/categories/womens-clothing", "/stores", "/categories", "/top-deals", "/about", "/contact", "/sign-in", "/robots.txt", "/favicon.ico", "/sitemap.xml"]
for locale in ["de", "fr", "es", "it", "pt", "nl", "hi", "ja", "ar"]:
    paths.extend([f"/{locale}", f"/{locale}/stores/lenovo-com", f"/{locale}/categories/womens-clothing"])
failures = []
maximum = 0
for path in paths + ["/", "/robots.txt"]:
    request = urllib.request.Request(base + path, headers={"Host": "couponleo.com", "X-Forwarded-Proto": "https"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
            size = sum(len(key) + len(value) + 4 for key, value in response.headers.items()) + 32
            maximum = max(maximum, size)
            passed = response.status == 200 and response.headers.get("Server-Timing") is None and size < 4096
            if not passed:
                failures.append(path)
            print(json.dumps({"route": path, "status": response.status, "header_bytes": size, "passed": passed}), flush=True)
    except Exception as error:
        failures.append(path)
        print(json.dumps({"route": path, "error": str(error)}), flush=True)
print(json.dumps({"requests": len(paths) + 2, "maximum_header_bytes": maximum, "failures": failures}), flush=True)
if failures:
    raise SystemExit(1)

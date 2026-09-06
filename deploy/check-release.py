"""Read-only release checks: python3 deploy/check-release.py http://127.0.0.1:4173"""
import json
import sys
import time
import urllib.error
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

base = (sys.argv[1] if len(sys.argv) > 1 else "https://couponleo.com").rstrip("/")
client = urllib.request.build_opener(NoRedirect)
checks = [
    ("/", 200, "G-HM2CS6185Y"),
    ("/stores/lenovo-com", 200, 'class="couponleo-deal-card"'),
    ("/categories/womens-clothing", 200, 'class="couponleo-deal-card"'),
    ("/hi/stores/lenovo-com", 200, 'class="couponleo-deal-card"'),
    ("/home", 301, None),
    ("/index-2", 301, None),
    ("/about-us", 301, None),
    ("/couponleo-release-missing-route", 404, None),
    ("/stores/couponleo-release-missing-store", 404, None),
    ("/categories/couponleo-release-missing-category", 404, None),
    ("/stores/lenovo-com?country=India", 200, "in India"),
    ("/sign-in", 200, "G-HM2CS6185Y"),
    ("/robots.txt", 200, "Sitemap:"),
    ("/sitemap.xml", 200, "sitemapindex"),
    ("/google94823beaed3ffc8e.html", 200, "google-site-verification: google94823beaed3ffc8e.html"),
]
failures = []
for path, expected, marker in checks:
    start = time.monotonic()
    try:
        response = client.open(urllib.request.Request(base + path, headers=({'Host': sys.argv[2], 'X-Forwarded-Proto': 'https'} if len(sys.argv) > 2 else {})), timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    body = response.read().decode("utf-8", errors="replace")
    passed = response.status == expected and (marker is None or marker in body)
    if marker == 'class="couponleo-deal-card"':
        passed = passed and body.count(marker) <= 12
    print(json.dumps({"route": path, "status": response.status, "seconds": round(time.monotonic()-start, 3), "bytes": len(body.encode()), "passed": passed}), flush=True)
    if not passed:
        failures.append(path)
if failures:
    raise SystemExit("Release checks failed: " + ", ".join(failures))

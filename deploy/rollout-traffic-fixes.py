"""One-time CouponLeo rollout after preview checks and committing fix/coupon-discovery."""
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

main = Path("/root/code/couponleonew_final")
backup = Path("/root/backups/couponleo-traffic-fix-20260906")
release = Path("/srv/couponleo-ui/releases/20260906-traffic-fixes")
configs = [Path("/etc/nginx/sites-enabled/couponleo.com.conf"), Path("/etc/nginx/sites-enabled/couponleo-api")]

def run(*args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True)

def health(url):
    for attempt in range(12):
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(2)
    raise RuntimeError("Service failed health check: " + url)

# A healthy independent preview keeps requests served while canonical services restart.
health("http://127.0.0.1:4174/stores/lenovo-com")
health("http://127.0.0.1:9601/couponleo/api/stores/lenovo-com")
originals = {p: p.read_bytes() for p in configs}
for p, data in originals.items():
    (backup / (p.name + ".rollout-before")).write_bytes(data)
duplicate = Path("/etc/nginx/sites-enabled/couponleo.com.conf.bak-google-verification-20260829")
duplicate_backup = backup / duplicate.name
if duplicate.exists():
    assert not duplicate_backup.exists()
    duplicate.rename(duplicate_backup)
try:
    for p, data in originals.items():
        p.write_bytes(data.replace(b"127.0.0.1:4173", b"127.0.0.1:4174").replace(b"127.0.0.1:9600", b"127.0.0.1:9601"))
    run("nginx", "-t")
    run("systemctl", "reload", "nginx")
except Exception:
    for p, data in originals.items():
        p.write_bytes(data)
    if duplicate_backup.exists():
        duplicate_backup.rename(duplicate)
    raise
print("Public traffic now served by tested preview", flush=True)
run("systemctl", "stop", "cpleo-api.service")
# Preserve the last generated summary from the original running service.
status = subprocess.check_output(["git", "status", "--porcelain"], cwd=main, text=True).splitlines()
assert all(line[3:] == "api/dataservices/data/analytics-summary.json" for line in status), status
if status:
    run("git", "add", "api/dataservices/data/analytics-summary.json", cwd=main)
    run("git", "commit", "-m", "Preserve final pre-release CouponLeo analytics summary", cwd=main)
run("git", "merge", "--no-edit", "fix/coupon-discovery", cwd=main)
for source, destination in [
    ("cpleo-api-traffic-fixes.conf", "/etc/systemd/system/cpleo-api.service.d/traffic-fixes.conf"),
    ("couponleo-ui-release.conf", "/etc/systemd/system/couponleo-ui.service.d/release.conf"),
]:
    target = Path(destination)
    assert not target.exists(), str(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes((main / "deploy" / source).read_bytes())
current = Path("/srv/couponleo-ui/current")
assert not current.exists() and not current.is_symlink()
next_link = current.with_name("current.next")
next_link.symlink_to(release)
next_link.replace(current)
run("systemctl", "daemon-reload")
run("systemctl", "restart", "cpleo-api.service", "couponleo-ui.service")
health("http://127.0.0.1:9600/couponleo/api/stores/lenovo-com")
health("http://127.0.0.1:4173/stores/lenovo-com")
run(sys.executable, str(main / "deploy/check-release.py"), "http://127.0.0.1:4173")
for p, data in originals.items():
    p.write_bytes(data)
run("nginx", "-t")
run("systemctl", "reload", "nginx")
print("Canonical services active; verify public URLs before stopping preview", flush=True)

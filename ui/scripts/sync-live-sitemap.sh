#!/usr/bin/env bash
set -euo pipefail

source_root=/root/code/couponleonew_final
data_dir="$source_root/api/dataservices/data"
public_dir=/srv/couponleo-ui/current/public
summary_file="$data_dir/seo-groupings-summary.json"
temp_file="$(mktemp "$data_dir/.seo-groupings-summary.XXXXXX")"
trap 'rm -f "$temp_file"' EXIT

curl --fail --silent --show-error --max-time 90 \
  http://127.0.0.1:9600/couponleo/api/seo/groupings \
  --output "$temp_file"

python3 - "$temp_file" "$summary_file" <<'PY'
import json
import os
import sys

source, destination = sys.argv[1:]
with open(source, encoding="utf-8") as file:
    data = json.load(file)
if not isinstance(data.get("countries"), list) or not isinstance(data.get("groups"), list):
    raise SystemExit("SEO groupings API returned an invalid response")
if not data["countries"]:
    raise SystemExit("SEO groupings API returned no eligible countries")
os.replace(source, destination)
print(f"SEO groups synced: {len(data['countries'])} countries, {len(data['groups'])} groups")
PY

cd "$source_root/ui"
COUPONLEO_PUBLIC_DIRECTORY="$public_dir" node scripts/generate-sitemap.mjs

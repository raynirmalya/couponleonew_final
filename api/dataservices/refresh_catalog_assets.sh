#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_DIR="$(cd "${ROOT_DIR}/../../ui" && pwd)"
PYTHON_BIN="${COUPONLEO_PYTHON_BIN:-/root/code/venv/bin/python}"
NODE_BIN="${COUPONLEO_NODE_BIN:-/usr/bin/node}"
API_ENV_FILE="${CPLEO_SECRETS_FILE:-/etc/code-secrets/cpleo.env}"
LIVE_PUBLIC_SOURCE_DIR="${COUPONLEO_LIVE_PUBLIC_SOURCE_DIRECTORY:-/root/code/new_cpleo/ui/public}"
LIVE_PUBLIC_DIST_DIR="${COUPONLEO_LIVE_PUBLIC_DIRECTORY:-/root/code/new_cpleo/ui/dist/analog/public}"
MIN_AVAILABLE_MEMORY_MB="${COUPONLEO_SUMMARY_MIN_AVAILABLE_MEMORY_MB:-2048}"
SUMMARY_GENERATE_TIMEOUT_SECONDS="${COUPONLEO_SUMMARY_GENERATE_TIMEOUT_SECONDS:-900}"

if [[ -f "${API_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${API_ENV_FILE}"
  set +a
fi

if [[ -r /proc/meminfo ]]; then
  mem_available_kb="$(awk '/MemAvailable:/ { print $2; exit }' /proc/meminfo)"
  if [[ -n "${mem_available_kb}" ]]; then
    mem_available_mb="$((mem_available_kb / 1024))"
    if (( mem_available_mb < MIN_AVAILABLE_MEMORY_MB )); then
      echo "Skipping CouponLeo summary refresh: ${mem_available_mb} MiB available; ${MIN_AVAILABLE_MEMORY_MB} MiB required."
      exit 0
    fi
  fi
fi

cd "${ROOT_DIR}"
timeout "${SUMMARY_GENERATE_TIMEOUT_SECONDS}" "${PYTHON_BIN}" generate_catalog_summaries.py

cd "${UI_DIR}"
"${NODE_BIN}" scripts/generate-sitemap.mjs
COUPONLEO_PUBLIC_DIRECTORY="${LIVE_PUBLIC_SOURCE_DIR}" "${NODE_BIN}" scripts/generate-sitemap.mjs
COUPONLEO_PUBLIC_DIRECTORY="${LIVE_PUBLIC_DIST_DIR}" "${NODE_BIN}" scripts/generate-sitemap.mjs

install -D -m 644 "${UI_DIR}/public/robots.txt" "${LIVE_PUBLIC_SOURCE_DIR}/robots.txt"
install -D -m 644 "${UI_DIR}/public/robots.txt" "${LIVE_PUBLIC_DIST_DIR}/robots.txt"

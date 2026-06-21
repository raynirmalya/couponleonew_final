#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_DIR="$(cd "${ROOT_DIR}/../../ui" && pwd)"
PYTHON_BIN="${COUPONLEO_PYTHON_BIN:-/root/code/venv/bin/python}"
NODE_BIN="${COUPONLEO_NODE_BIN:-/usr/bin/node}"
API_ENV_FILE="${CPLEO_SECRETS_FILE:-/etc/code-secrets/cpleo.env}"
LIVE_PUBLIC_SOURCE_DIR="${COUPONLEO_LIVE_PUBLIC_SOURCE_DIRECTORY:-/root/code/new_cpleo/ui/public}"
LIVE_PUBLIC_DIST_DIR="${COUPONLEO_LIVE_PUBLIC_DIRECTORY:-/root/code/new_cpleo/ui/dist/analog/public}"

if [[ -f "${API_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${API_ENV_FILE}"
  set +a
fi

cd "${ROOT_DIR}"
"${PYTHON_BIN}" generate_catalog_summaries.py

cd "${UI_DIR}"
"${NODE_BIN}" scripts/generate-sitemap.mjs
COUPONLEO_PUBLIC_DIRECTORY="${LIVE_PUBLIC_SOURCE_DIR}" "${NODE_BIN}" scripts/generate-sitemap.mjs
COUPONLEO_PUBLIC_DIRECTORY="${LIVE_PUBLIC_DIST_DIR}" "${NODE_BIN}" scripts/generate-sitemap.mjs

install -D -m 644 "${UI_DIR}/public/robots.txt" "${LIVE_PUBLIC_SOURCE_DIR}/robots.txt"
install -D -m 644 "${UI_DIR}/public/robots.txt" "${LIVE_PUBLIC_DIST_DIR}/robots.txt"

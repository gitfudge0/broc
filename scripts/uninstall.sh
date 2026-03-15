#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${OSTYPE:-}" != darwin* && "${OSTYPE:-}" != linux* ]]; then
  echo "Unsupported OS: ${OSTYPE:-unknown}. Broc uninstall supports macOS and Linux." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run the Broc uninstaller." >&2
  exit 1
fi

cd "${ROOT_DIR}"
node scripts/uninstall.mjs "$@"

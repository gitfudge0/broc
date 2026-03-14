#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${OSTYPE:-}" != darwin* && "${OSTYPE:-}" != linux* ]]; then
  echo "Unsupported OS: ${OSTYPE:-unknown}. Broc install supports macOS and Linux." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]')"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Node.js 20+ is required. Found $(node -v)." >&2
  exit 1
fi

cd "${ROOT_DIR}"

echo "Installing dependencies..."
npm ci

echo "Building Broc runtime..."
npm run build:runtime

echo "Staging Broc into the managed runtime directory..."
node dist/cli.mjs stage-install --copy "$@"

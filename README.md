# Broc

Broc is a repo-installed, staged-runtime browser control package for AI agents.

The install flow builds from this checkout once, stages a stable runtime under your home directory, installs the production runtime dependencies it needs, downloads a managed Chromium, prepares the native messaging bridge, and prints the MCP config you paste into your agent client.

## Quick Start

```bash
./scripts/install.sh
```

After install:

```bash
broc mcp-config --copy
```

Paste the generated config into your MCP client. The staged wrapper path is absolute, self-contained, and does not point at the repo checkout.

## Uninstall

```bash
./scripts/uninstall.sh
```

This removes Broc-owned staged/runtime assets outside the repo checkout:

- staged installs and active install marker
- managed Chromium runtime cache
- managed Broc profile
- stable wrapper under the Broc data directory
- Broc setup state and best-effort legacy native manifests

It does not remove the repo checkout or your MCP client config snippet. Remove the client config manually if you no longer want Broc configured.

## User-Facing Commands

The installed runtime exposes:

- `broc` to start the MCP server on stdio
- `broc launch` to launch the managed Chromium browser
- `broc status --json` for health checks
- `broc mcp-config --client=generic|claude-code|codex --copy` to print or copy the MCP config
- `broc reset` to fully uninstall the staged runtime, managed browser, and managed profile

## What The Installer Handles

`./scripts/install.sh` performs:

- Node/npm prerequisite checks
- `npm ci`
- `npm run build:runtime`
- staging `dist/` into a stable home-directory install root
- staging `package.json`, `package-lock.json`, and production `node_modules/`
- managed Chromium download
- managed profile creation
- profile-local native messaging manifest setup
- wrapper creation at the staged `broc` path
- MCP config generation and clipboard copy when supported

## Managed Runtime Layout

- Linux config: `~/.config/broc`
- Linux cache: `~/.cache/broc`
- Linux data: `${XDG_DATA_HOME:-~/.local/share}/broc`
- macOS config/data: `~/Library/Application Support/broc`
- macOS cache: `~/Library/Caches/broc`

The stable wrapper lives at `<dataDir>/bin/broc`.

## Development

The staged runtime is the supported end-user path. Firefox/Chrome repo flows remain available for repo/dev compatibility only:

- `npm run dev`
- `npm test`
- `npm run build`
- `npm run build:runtime`
- `npm run setup -- --browser=firefox|chrome|chromium`
- `npm run launch -- --browser=firefox|chrome|chromium`

Architecture details and protocol internals are in [DOCS.md](./DOCS.md).

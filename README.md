# Broc

Broc is a repo-installed, staged-runtime browser control package for AI agents.

The install flow builds from this checkout once, stages a stable runtime under your home directory, installs the runtime dependencies it needs, downloads a managed Chromium, prepares the native messaging bridge, creates a public `broc` command, wires `PATH` when needed, detects likely MCP clients, and prints the exact MCP config you paste into your agent client.

## Quick Start

```bash
./scripts/install.sh
```

After install, open a new shell if Broc updated your `PATH`, then start the managed browser and stack when you want an interactive Broc session:

```bash
broc
```

To configure your MCP client afterward:

```bash
broc mcp-config --client=codex --copy
```

Supported config targets are `generic`, `codex`, `claude-code`, and `opencode`. Generated MCP config starts `broc serve`, which keeps MCP available without opening the browser until a browser-backed task needs it. Install prints client-specific instructions but does not modify any MCP client config files.

## Uninstall

```bash
broc uninstall
```

Equivalent shell entrypoint:

```bash
./scripts/uninstall.sh
```

This removes Broc-owned staged/runtime assets outside the repo checkout:

- staged installs and active install marker
- managed Chromium runtime cache
- managed Broc profile
- stable wrapper under the Broc data directory
- public `broc` executable and managed `PATH` block
- Broc setup state and best-effort legacy native manifests

It does not remove the repo checkout or your MCP client config snippet. Remove the client config manually if you no longer want Broc configured.

## User-Facing Commands

The installed runtime exposes:

- `broc` to start the MCP server only; browser-backed MCP tasks launch the managed browser on demand
- `broc launch` to explicitly launch the managed Chromium browser and start the MCP server
- `broc serve` as the explicit MCP-only entrypoint for integrations
- `broc status --json` for health checks
- `broc mcp-config --client=generic|claude-code|codex|opencode --copy` to print or copy the MCP config
- `broc uninstall` to fully uninstall the staged runtime, managed browser, and managed profile
- `broc reset` as a compatibility alias for `broc uninstall`

## Canvas Feature

Broc now ships with a persistent canvas feature for long-running tasks.

- Agents can create and update canvases with MCP tools such as `canvas_create`, `canvas_update`, `canvas_set_agent_view`, `canvas_set_user_view`, `canvas_append_event`, `canvas_add_artifact`, `canvas_get`, `canvas_list`, and `canvas_open`.
- Canvases persist across restarts under the Broc data directory.
- The user-facing canvas UI is served locally by the MCP server and opens in the managed browser.
- Each task has its own durable canvas record, while the UI presents a unified task list for switching between tasks.

Persistent canvas storage lives here:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/broc/canvases`
- macOS: `~/Library/Application Support/broc/canvases`

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
- public `broc` command creation in a user bin directory
- shell `PATH` setup when needed
- MCP client detection and config instructions

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

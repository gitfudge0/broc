# Broc — Documentation

AI agent browser control via native messaging.

No human-facing UI — this extension exists purely as a programmatic interface for AI agent control via the Model Context Protocol (MCP).

---

## Table of Contents

1. [Installation](#installation)
2. [Architecture](#architecture)
3. [MCP Tools](#mcp-tools)
4. [Protocol](#protocol)
5. [Safety](#safety)
6. [Development](#development)

---

## Installation

### Prerequisites

- **OS:** macOS or Linux for the staged-runtime installer flow
- **Node.js:** 20+
- **npm:** available on `PATH`

### Quick Start

```bash
# 1. Clone the repo
git clone <repo-url> broc
cd broc

# 2. Install Broc into the staged home-directory runtime
./scripts/install.sh

# 3. Open a new shell if PATH changed, then start Broc's MCP server
broc

# 4. Launch the managed browser when you actually need it
broc launch

# 5. Print or copy the MCP config for your client
broc mcp-config --client=codex --copy
```

The installer runs `npm ci`, builds the Chromium-only runtime bundle, stages a stable install under your home directory, installs the production runtime dependencies needed by that staged copy, provisions managed Chromium, prepares the managed profile, installs the profile-local native messaging manifest, writes the stable managed wrapper path used by MCP clients, creates a public `broc` executable in a user bin directory, updates shell `PATH` config when needed, detects likely MCP clients, and prints client-specific configuration instructions.

After install, the MCP client must launch the staged wrapper, not the repo checkout. `broc mcp-config` always emits the correct absolute command path, and the staged runtime does not depend on the source checkout remaining present. Generated MCP config runs `broc serve`, so clients get tools without eagerly opening the browser; browser-backed requests can launch the managed browser on demand. Broc does not edit MCP client config files automatically.

### Uninstall

```bash
broc uninstall
```

Equivalent shell entrypoint:

```bash
./scripts/uninstall.sh
```

This removes Broc-owned staged/runtime artifacts outside the repo checkout:

- staged installs and the active install marker
- managed Chromium runtime cache
- the managed Broc profile
- the staged wrapper under the Broc data directory
- the public `broc` executable and managed shell PATH block
- Broc state files and best-effort legacy Broc native manifests

It does not remove the repo checkout and it does not edit MCP client configuration automatically. Remove the Broc MCP config snippet manually if you no longer want Broc configured.

### Staged Runtime Layout

- Linux
  - config: `~/.config/broc`
  - cache: `~/.cache/broc`
  - data: `${XDG_DATA_HOME:-~/.local/share}/broc`
- macOS
  - config/data: `~/Library/Application Support/broc`
  - cache: `~/Library/Caches/broc`

Stable wrapper:

- `<dataDir>/bin/broc`

Public CLI:

- `~/.local/bin/broc` by default
- `~/bin/broc` when `~/bin` already exists and is already on `PATH`

Versioned staged install:

- `<dataDir>/installs/<installVersion>/`
  - includes `dist/`, `package.json`, `package-lock.json`, and production `node_modules/`

Active install marker:

- `<dataDir>/active-install.json`

### Product Runtime Build Output

`npm run build:runtime` produces the assets staged by the installer:

| Path | Purpose |
|------|---------|
| `dist/chrome/background.js` | Chromium background worker |
| `dist/chrome/content.js` | Chromium content script |
| `dist/chrome/manifest.json` | Chromium MV3 manifest |
| `dist/bridge.mjs` | Native messaging bridge host |
| `dist/mcp-server.mjs` | MCP server |
| `dist/cli.mjs` | CLI entry point |

### Native Messaging Host

The staged installer uses the managed Chromium profile-local native messaging manifest and points it at the staged `bridge.mjs`. End users do not need to install a native host manually.

**Chromium manifest** uses `allowed_origins`:
```json
{
  "name": "broc",
  "description": "Broc native messaging host for AI agent interaction",
  "path": "/absolute/path/to/<dataDir>/installs/<installVersion>/dist/bridge.mjs",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://jmdfepifjgmfnngjdkceknidfmaeoeie/"]
}
```

### Extension Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the currently active tab |
| `scripting` | Inject content scripts on demand |
| `storage` | Persist session state across suspensions |
| `tabs` | List and query open tabs |
| `nativeMessaging` | Connect to the native messaging bridge |
| `webNavigation` | Receive navigation events |
| `host_permissions: <all_urls>` | Required by Chrome MV3 for `scripting.executeScript()` from a service worker |

### MCP Client Configuration

```json
{
  "mcpServers": {
    "broc": {
      "command": "/absolute/path/to/<dataDir>/bin/broc",
      "args": ["serve"]
    }
  }
}
```

### CLI Commands

| Command | Description |
|---------|-------------|
| *(none)* | Start the MCP server only; browser-backed MCP requests launch the managed browser on demand |
| `launch` | Explicitly launch the managed Chromium browser and start the MCP server |
| `serve` | Start only the MCP server for agent integrations and MCP clients |
| `status` | Show build, setup, and bridge status |
| `mcp-config` | Print the staged-wrapper MCP config |
| `uninstall` | Fully uninstall the staged runtime and managed browser state |
| `reset` | Compatibility alias for `uninstall` |
| `snapshot` | Capture and pretty-print current page |
| `help` | Show usage information |

Legacy compatibility commands still exist for repo/development workflows: `setup`, `teardown`, `install`, `uninstall-native-host`. They are repo/dev compatibility paths, not supported staged-runtime targets.

**Options:** `--url=<url>` (open URL in a fresh tab after launch; default `https://www.google.com`), `--no-mcp` (launch browser only), `--json` (machine-readable output for `status` and `snapshot`), `--client=generic|claude-code|codex|opencode`, `--copy`

**Snapshot options:** `--verbose` / `-v`, `--json`, `--tab=<id>`

### Health and Troubleshooting

- `broc status --json` prints the canonical machine-readable health report for CLI callers.
- `browser_status` is the MCP-side health tool and returns the same bridge phase data plus a human-readable summary.
- `broc` and `broc serve` start MCP without launching the browser. Use `broc launch` for an immediate full-stack session.
- The MCP server still starts in degraded mode when the bridge is absent. In that state, `browser_status` still works and bridge-backed tools return targeted remediation instead of crashing the process at startup.
- Browser-backed MCP tools attempt a managed browser autostart when no bridge session exists yet.
- When Broc is not installed, `status` points back to `./scripts/install.sh`. If Broc was already removed, `./scripts/uninstall.sh` is not needed.
- Chromium stderr lines such as Wayland image-description warnings or `google_apis ... DEPRECATED_ENDPOINT` are not treated as bridge health failures.
- If launch reports `Unknown request type: open_tab`, the browser is running a stale extension worker. The launcher now warns and continues, and a fresh `npm run build` + relaunch updates the generated dist manifest version so Chrome-family profiles reload the extension code.

---

## Architecture

```
AI Agent  ←─ MCP/stdio ─→  MCP Server  ─┐
                                         │ Unix socket
                           CLI           ─┤ /tmp/broc-<uid>.sock
                                         │
                                      Bridge  ←─ native messaging (stdin/stdout) ─→  Extension
                                                                                          │
                                                                                     Content Script
                                                                                          │
                                                                                      Web Page
```

### Components

**MCP Server** (`src/mcp/server.ts`) — Entry point for AI agents. Exposes 14 MCP tools, implements the safety pipeline, formats snapshots as text, supports degraded startup when the bridge is unavailable, and manages bridge client lifecycle.

**Bridge Client** (`src/mcp/bridge-client.ts`) — Lives in the MCP server or CLI process. Connects to the bridge via a Unix socket (`/tmp/broc-<uid>.sock`). Handles request/response correlation, timeouts (30s default), and push event routing. Does not spawn the bridge — the browser extension does that.

**Bridge Host** (`src/bridge/host.ts`) — Standalone Node.js process launched by the browser via native messaging.
- **stdin/stdout**: Exclusively the native messaging protocol with the browser extension (length-prefixed JSON as required by the WebExtensions API).
- **Unix socket** (`/tmp/broc-<uid>.sock`): MCP server and CLI connect here to send requests and receive responses/events.
- **PID file** (`/tmp/broc-<uid>.pid`): Written on startup; clients use it to check if the bridge is running.
- Handles `ping`/`pong` locally (responds to socket clients without forwarding to the extension).
- Cleans up socket and PID file on exit.

**Background Script** (`src/background/index.ts`) — Extension orchestrator.
- Firefox: MV3 event page (non-persistent)
- Chrome: MV3 service worker
- Manages sessions (`sessionId` ↔ `tabId`), persists to `storage.session`
- Content script injection with retry (linear backoff: 500ms × (attempt+1), max 3 retries)
- Bridge connection with exponential backoff reconnection (10 attempts, 1s–30s, jitter)

**Content Script** (`src/content/`) — Injected per-tab on demand.
- `snapshot.ts`: DOM walker, filters interesting elements, caps at 5,000 elements, redacts sensitive values
- `actions.ts`: 8 action executors (click, type, press, scroll, navigate, select, wait, extract)
- `index.ts`: Message listener, dialog interception, SPA navigation detection, DOM mutation observer

### Browser Compatibility

The codebase uses `browser.*` namespace everywhere (Firefox-native). For Chrome, the build prepends a polyfill shim that assigns `globalThis.browser = chrome`. Chrome MV3 APIs already return Promises, so the shim is sufficient without a full polyfill library.

Key differences handled:
- **Manifest:** Firefox uses `browser_specific_settings.gecko` + `background.scripts`; Chrome uses `key` + `background.service_worker`
- **Background runtime:** Firefox uses event pages; Chrome uses service workers. Both require synchronous top-level listener registration.
- **Restricted URLs:** Both browsers' restricted URL patterns are included; mismatches are harmless (Firefox patterns won't match Chrome URLs and vice versa)

---

## MCP Tools

### Observation Tools

**`browser_status`** — Report browser automation health and bridge readiness.
- No params
- Returns: Human-readable summary plus canonical JSON health report

**`browser_snapshot`** — Capture structured page snapshot with element refs.
- Params: `tabId?` (number)
- Returns: Text element tree (max 5,000 elements)

**`browser_screenshot`** — Capture visible area as PNG.
- Params: `tabId?` (number)
- Returns: base64 PNG image

**`browser_tabs`** — List all open tabs.
- No params
- Returns: Tab list with IDs, URLs, titles, active status

### Action Tools

All mutating actions return a fresh snapshot after execution.

**`browser_click`** — Click element by ref.
- Params: `ref` (required), `button?`, `clickCount?`, `modifiers?`

**`browser_type`** — Type text into input.
- Params: `ref` (required), `text` (required), `clear?`, `submit?`
- Note: `submit: true` elevates to high risk

**`browser_press`** — Press keyboard key.
- Params: `key` (required), `ref?`, `modifiers?`

**`browser_scroll`** — Scroll page or element.
- Params: `direction` (required: up/down/left/right), `amount?`, `ref?`

**`browser_navigate`** — Navigate to URL or back/forward/reload.
- Params: `url` (required)

**`browser_select`** — Select dropdown option.
- Params: `ref` (required), `values` (required: string[])

**`browser_wait`** — Wait for element state.
- Params: `ref?`, `selector?`, `timeout?` (default 5000), `state?` (default "visible")
- With no ref/selector: fixed-delay sleep (max 10s)

**`browser_extract`** — Extract text/HTML/attribute.
- Params: `ref?`, `selector?`, `extract` (required: text/innerHTML/outerHTML/attribute), `attribute?`
- Sensitive values redacted automatically

### Safety Tools

**`browser_approve`** — Approve/deny pending high-risk action.
- Params: `approvalId` (required), `decision` (required: approve/deny)
- Approvals expire after 2 minutes

**`browser_audit_log`** — View action audit log.
- Params: `count?` (default 20), `sessionId?`
- Max 1,000 entries (circular buffer)

---

## Protocol

### Transport

There are two distinct transport channels:

**Native messaging (extension ↔ bridge):** Length-prefixed JSON over stdin/stdout — required by the WebExtensions native messaging API:
```
[4 bytes: uint32 LE length][N bytes: UTF-8 JSON payload]
```

**Unix socket (MCP server/CLI ↔ bridge):** The same length-prefixed framing over a Unix domain socket at `/tmp/broc-<uid>.sock`.

Max message size: 1 MB.

### Message Types

| Direction | Types |
|-----------|-------|
| Request (MCP → Extension) | `observe`, `act`, `list_tabs`, `interrupt`, `ping` |
| Response (Extension → MCP) | `observe_result`, `act_result`, `list_tabs_result`, `interrupt_result`, `error` |
| Push events | `navigation`, `dom_change`, `dialog`, `tab_closed`, `tab_activated` |

Every request/response carries `type`, `id`, and `sessionId`. The bridge handles `ping`/`pong` locally.

### Action Types

`click`, `type`, `press`, `scroll`, `navigate`, `select`, `wait`, `extract`

### Push Events

**`navigation`** — From `webNavigation.onCommitted` and SPA detection (pushState/replaceState/popstate). Kinds: `new`, `reload`, `back_forward`, `push_state`, `replace_state`.

**`dom_change`** — Debounced (500ms) after 5+ significant mutations (childList changes, attribute changes on interactive elements).

**`dialog`** — Intercepted native dialogs. Auto-dismiss: alert swallowed, confirm → false, prompt → null, beforeunload recorded.

**`tab_closed` / `tab_activated`** — Tab lifecycle events.

### Error Codes

**Protocol errors** (top-level): `invalid_request`, `tab_not_found`, `session_not_found`, `content_script_error`, `native_messaging_error`, `internal_error`, `not_supported`, `rate_limited`

**Action errors** (in `act_result.result.error`): `target_not_found`, `not_interactable`, `stale_ref`, `navigation_started`, `permission_denied`, `timeout`, `invalid_action`, `execution_error`

---

## Safety

### Pipeline

Every action goes through: risk assessment → rate limit check → approval gate → execution → audit log.

### Risk Levels

| Level | Actions |
|-------|---------|
| `none` | extract, wait |
| `read` | scroll |
| `low` | click, type, press, select (may elevate) |
| `high` | navigate (no approval required) |

### High-Risk Triggers

Clicks/types are elevated when target text matches patterns:
- **Purchase:** buy, checkout, pay, place order, subscribe, upgrade
- **Destructive:** delete, remove, destroy, cancel account, deactivate
- **Send/Submit:** send, submit, post, publish, share, transfer
- **Auth:** log in, sign out, sign up, reset password, authorize
- **Download:** download, export, install
- **Form submit:** `<input type="submit">` or `<button type="submit">`

### Rate Limits

60 actions/minute overall, 5 high-risk/minute (sliding window).

### Sensitive Data Redaction

- **Snapshot:** Password, hidden, and sensitive-named fields show `[REDACTED]`
- **Extract:** Blocked attributes (`cookie`, `authorization`, `x-api-key`, `x-auth-token`) → `[REDACTED - sensitive attribute]`
- **HTML extract:** `value="..."` redacted on password/hidden inputs

### Restricted URLs

Content scripts cannot be injected on browser-internal pages, extension pages, or browser vendor domains (AMO, Chrome Web Store, etc.).

---

## Development

### npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch, launch browser with the built extension, and start MCP |
| `npm test` | Run tests (Vitest) |
| `npm run build` | Build all bundles (Firefox + Chrome + Node) |
| `npm run clean` | Remove repo build artifacts only |
| `npm run setup` | End-user setup flow (build + install + managed profiles) |
| `npm run launch` | End-user runtime flow (browser + MCP) |

### Recommended Usage

```bash
npm run dev
npm run dev -- --browser=firefox
npm run test -- --watch
npm run clean
npm run clean -- --all
```

`npm run dev` defaults to Chrome. `concurrently` runs the build watcher and launch supervisor together, `wait-on` delays the first launch until the initial build artifacts exist, and `nodemon` restarts the launch session when the built extension or CLI artifacts change. Use `npm run dev -- --browser=<name>` to override the default browser for the launch session.

### Advanced Direct Commands

These remain available, but they are no longer top-level npm scripts:

- `node dist/cli.mjs status`
- `node dist/cli.mjs teardown`
- `node dist/cli.mjs uninstall-native-host`
- `npx tsc --noEmit`
- `npx web-ext lint --source-dir dist/firefox`

### Debug Logging

**Extension:** `browser.storage.local.set({ debug: true })` in browser console.

**Node (bridge/MCP):** `BROC_DEBUG=1 node dist/cli.mjs`

### Using a Different Firefox Binary

```bash
FIREFOX=zen-browser npm run dev -- --browser=firefox
FIREFOX=/path/to/firefox-nightly npm run dev -- --browser=firefox
```

### Uninstall

```bash
node dist/cli.mjs teardown --browser=firefox   # Managed setup cleanup
node dist/cli.mjs uninstall-native-host --browser=chrome   # Legacy native-host-only cleanup
npm run clean -- --all                         # Full repo + managed cleanup
```

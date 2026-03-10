# Broc - Firefox Extension for AI Agents

An AI-agent-only Firefox extension that exposes structured page observation and typed action primitives over a local bridge (native messaging), controlled by an MCP/CLI tool.

---

## Phase 1: Foundation & Schemas

Define the transport layer, shared types, and project scaffolding.

- [x] Initialize project: `package.json`, TypeScript config, build tooling, `web-ext` config
- [x] Define shared JSON message schemas
  - [x] `observe` request/response (snapshot)
  - [x] `act` request/response (action + result)
  - [x] `event` push messages (navigation, DOM change, dialog, console error)
  - [x] `interrupt` request (cancel/stop)
  - [x] Error envelope with structured error codes (`target_not_found`, `not_interactable`, `navigation_started`, `permission_denied`, `timeout`, `stale_ref`)
- [x] Define `ElementRef` schema: `ref`, `tag`, `role`, accessible name, text summary, value/state, visibility, enabled/editable/clickable, bounding box, frame id, locator candidates
- [x] Define `PageSnapshot` schema: URL, title, viewport size, scroll position, focused element ref, loading state, frame tree, element list
- [x] Define `Action` schema: `click`, `type`, `press`, `scroll`, `navigate`, `wait`, `select`, `extract` with per-action params
- [x] Write `manifest.json` (Manifest V3, Firefox)
  - [x] Permissions: `activeTab`, `scripting`, `storage`, `tabs`, `nativeMessaging`
  - [x] Background: non-persistent event page
  - [x] Content script registration (on-demand via `scripting.executeScript`)
  - [x] `browser_specific_settings` with explicit add-on ID
- [x] Scaffold directory structure: `src/background/`, `src/content/`, `src/shared/`, `src/bridge/`

---

## Phase 2: Snapshot Engine (Content Script)

Build the content script that captures a structured page snapshot.

- [x] DOM walker: traverse visible DOM tree, skip hidden/zero-size elements
- [x] Element metadata extraction
  - [x] Tag name, id, class list
  - [x] ARIA role (explicit + implicit from tag)
  - [x] Accessible name: `aria-label`, `aria-labelledby`, associated `<label>`, `placeholder`, `alt`, `title`, inner text fallback
  - [x] Value and state: `value`, `checked`, `selected`, `disabled`, `readonly`, `contenteditable`
  - [x] Interactability flags: visible, enabled, clickable, editable, focusable
  - [x] Bounding box (viewport-relative via `getBoundingClientRect`)
- [x] Stable ref assignment: deterministic integer refs per snapshot, mapped to internal weak references for action targeting
- [x] Locator candidate generation (Playwright-style priority)
  - [x] `role` + accessible name
  - [x] `label` text
  - [x] `placeholder`
  - [x] Visible text content
  - [x] `alt` text
  - [x] `title` attribute
  - [x] `data-testid`
  - [x] CSS selector fallback (shortest unique path)
- [x] Frame-aware snapshot: detect and recurse into same-origin iframes, tag elements with frame path
- [x] Viewport and page metadata: URL, title, viewport dimensions, scroll position, `document.readyState`, focused element
- [x] Sensitive data redaction: strip password field values, hidden input values, auth tokens
- [x] Snapshot size management: truncate long text, cap element count, mark truncation in response

---

## Phase 3: Action Executor (Content Script)

Build the content script primitives that execute typed actions on the page.

- [x] Ref resolver: map `ref` from snapshot back to live DOM element, return structured error if stale or missing
- [x] `click` action
  - [x] Scroll element into view
  - [x] Check interactability (visible, enabled, not obscured)
  - [x] Dispatch mousedown/mouseup/click sequence
  - [x] Handle target that opens navigation or dialog
- [x] `type` action
  - [x] Focus element, clear if requested
  - [x] Dispatch input events character-by-character or as bulk value set
  - [x] Support `submit` flag to press Enter after typing
- [x] `press` action: dispatch keyboard event for named key (`Enter`, `Escape`, `Tab`, `ArrowDown`, etc.)
- [x] `scroll` action: scroll viewport or specific element by direction/amount
- [x] `select` action: set value on `<select>` elements, dispatch change event
- [x] `navigate` action: set `window.location` or call `history.back()`/`history.forward()`
- [x] `wait` action: wait for selector to appear, element to become visible, or fixed timeout
- [x] `extract` action: return text content, attribute value, or innerHTML for a target ref or selector
- [x] Post-action resnapshot: after every mutating action, automatically generate and return a fresh snapshot
- [x] Error handling: structured errors for stale ref, not interactable, timeout, navigation interruption

---

## Phase 4: Background Orchestrator

Build the background event page that coordinates content scripts, tabs, and the bridge.

- [x] Tab/frame session registry: track active sessions per tab, manage content script injection
- [x] On-demand content script injection via `scripting.executeScript`
- [x] Message routing: relay `observe`/`act` from bridge to correct tab/frame content script
- [x] Screenshot capture: `tabs.captureVisibleTab()` on request, return as base64 data URL
- [x] Page version tracking: increment version on navigation and significant DOM mutations, reject stale actions
- [x] Navigation detection: listen to `webNavigation.onCommitted`, `webNavigation.onCompleted`, push `event` to bridge
- [x] Session state persistence: save active session metadata to `storage.session`, restore on event page wake
- [x] Event page lifecycle: register all listeners synchronously at top level, handle `runtime.onSuspend` gracefully
- [x] Permission checks: verify tab URL is not restricted (about:*, AMO, reader mode, etc.) before injecting

---

## Phase 5: Native Messaging Bridge

Connect the extension to the local CLI/MCP tool via native messaging.

- [x] Native host manifest JSON (`broc.json`)
  - [x] `name`, `description`, `path`, `type: "stdio"`, `allowed_extensions`
  - [x] Platform-specific install locations documented (Linux, macOS, Windows) — in CLI help and install command
- [x] Native host process (Node.js or Python)
  - [x] Read length-prefixed JSON from stdin
  - [x] Write length-prefixed JSON to stdout
  - [x] Validate incoming message schema (type checking, required fields, known message types)
  - [x] Route messages to/from the extension background page
  - [x] Log all traffic to stderr for debugging
- [x] Extension-side bridge connection
  - [x] `runtime.connectNative()` in background page
  - [x] Reconnect on port disconnect (event page suspension, host crash)
  - [x] Message queue: buffer outgoing messages during reconnection
- [x] Session management: associate bridge messages with tab sessions via `sessionId`
- [x] Health check / ping-pong for connection liveness (bridge handles `ping` → `pong`, client exposes `ping()` method)

---

## Phase 6: MCP Server / CLI Tool

Expose browser control as MCP tools for AI agents.

- [x] MCP server scaffold (TypeScript, stdio transport)
- [x] Tool: `browser_snapshot` - observe active tab, return structured snapshot
- [x] Tool: `browser_screenshot` - capture visible tab as image
- [x] Tool: `browser_click` - click element by ref
- [x] Tool: `browser_type` - type text into element by ref
- [x] Tool: `browser_press` - press a keyboard key
- [x] Tool: `browser_scroll` - scroll viewport or element
- [x] Tool: `browser_navigate` - go to URL, back, forward
- [x] Tool: `browser_select` - select option in dropdown
- [x] Tool: `browser_wait` - wait for element or timeout
- [x] Tool: `browser_extract` - extract text/attribute from element
- [x] Tool: `browser_tabs` - list open tabs, switch active tab
- [x] CLI wrapper: `broc` command with install/uninstall/status/help subcommands, default starts MCP server
- [x] Connection management: launch native host, establish session, handle reconnects
- [x] Response formatting: return snapshots in agent-friendly compact format

---

## Phase 7: Safety & Approvals

Add guardrails for destructive or sensitive actions.

- [x] Action classification: tag actions with `sideEffectLevel` (`none`, `read`, `low`, `high`)
- [x] High-risk action detection: form submit, purchase buttons, delete/remove, send/post, download triggers
- [x] Approval gate: pause execution and surface approval request through MCP tool response
- [x] Sensitive data redaction hardening
  - [x] Password fields, credit card inputs, OTP fields
  - [x] `type="hidden"` values
  - [x] Cookie/localStorage/sessionStorage content (never expose)
  - [x] Auth headers in extracted network data
- [x] Action audit log: every action with before/after snapshot refs, timestamps, tab/frame IDs
- [x] Rate limiting: cap actions-per-second to prevent runaway loops

---

## Phase 8: Hardening & Edge Cases

Handle real-world complexity.

- [x] Shadow DOM: pierce open shadow roots during snapshot, generate shadow-aware selectors (`>>>` notation)
- [x] Cross-origin iframes: detect, report as opaque frames in snapshot, skip content (try/catch around `contentDocument`)
- [x] SPA navigation: detect history pushState/replaceState as navigation events (monkey-patched in content script)
- [x] Dialogs: detect `alert`, `confirm`, `prompt`, `beforeunload`; report via events; auto-dismiss with configurable response
- [x] Infinite scroll / lazy loading: detect and report scroll-triggered content changes (`scrollTriggeredNewContent` flag)
- [x] Dynamic DOM churn: debounce mutation events (500ms), invalidate stale refs gracefully (5-mutation threshold)
- [x] File upload inputs: documented as unsupported due to browser security restrictions; returns `not_supported` error
- [x] Multi-tab support: concurrent sessions across tabs with isolated state (implicit via session registry)
- [x] Error recovery: content script injection retries (3 attempts), bridge reconnection with exponential backoff (10 attempts), stale ref detection on disconnection

---

## Phase 9: Developer Experience

Polish for real-world use.

- [x] Installation script: automate native host manifest setup per platform
- [x] `web-ext` dev workflow: hot reload extension during development
- [x] Debug logging: verbose mode toggled via storage flag, visible in browser console and stderr
- [x] Snapshot inspector: CLI command to pretty-print current page snapshot for debugging
- [x] Integration tests: automated test suite (85 tests across safety, logger, bridge-protocol modules)
- [x] Documentation
  - [x] Extension installation guide (`docs/installation.md`)
  - [x] Native host setup per OS (`docs/native-host-setup.md`)
  - [x] MCP tool reference with params and examples (`docs/mcp-tools.md`)
  - [x] Protocol specification with message schemas, lifecycle, error codes (`docs/protocol.md`)
  - [x] Architecture overview (included in `docs/protocol.md`)

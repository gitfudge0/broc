---
name: broc-agent
description: Use Broc for agent browser automation with a CLI-first runtime model and MCP browser tools. Trigger this skill when Claude needs to control a browser through Broc, decide whether to use `broc` CLI commands or MCP tools, troubleshoot Broc readiness, or execute browser tasks with or without screenshots in clients such as OpenCode, Codex, or generic MCP hosts.
---

# Broc Agent

Use Broc as two layers:

- CLI for lifecycle and diagnostics
- MCP tools for page inspection and interaction

Keep the browser lazy by default. Prefer MCP integrations that run `broc serve`; launch the managed browser only when a browser-backed task actually needs it or when the user explicitly asks for a visible session.

## Runtime Model

- Use `broc` or `broc serve` to expose MCP tools without eagerly opening the browser.
- Use `broc launch` when the user wants the managed browser opened immediately.
- When launching from an agent workflow, start `broc launch` in the background and then re-check `browser_status` until Broc is ready. Do not block on the launch command itself.
- Use `broc status --json` for CLI-side health checks.
- Use `broc snapshot --json` for CLI-side inspection and debugging.
- Use `broc mcp-config --client=<name>` to generate integration config; prefer generated configs that run `serve`.

## Operating Loop

1. Call `browser_status` if runtime readiness is unclear.
2. Call `browser_snapshot` before acting.
3. Use refs only from the latest snapshot.
4. Take the smallest safe action.
5. Re-snapshot after navigation or any action that can change page state.
6. Use `browser_tabs` when tab focus or active context is unclear.

## CLI vs MCP

- Reach for CLI when you need to start or diagnose Broc itself.
- Reach for MCP tools when you need to inspect pages, click, type, navigate, wait, extract, or review safety prompts.
- Do not use CLI commands to simulate page actions that MCP tools already cover.
- If MCP is attached but the browser is absent, allow browser-backed MCP tools to trigger the managed browser on demand.
- When you explicitly launch the browser, start it in the background, treat launch as fire-and-forget, and check readiness with `browser_status` instead of blocking on the launch command.

## Tool Selection

- Observation: `browser_status`, `browser_snapshot`, `browser_tabs`, `browser_extract`
- Visual confirmation: `browser_screenshot` only when layout, rendering, or non-textual state matters
- Actions: `browser_click`, `browser_type`, `browser_press`, `browser_scroll`, `browser_navigate`, `browser_select`, `browser_wait`
- Safety: `browser_approve`, `browser_audit_log`

If the client namespaces tool names, use the exact exposed tool name from the client and map it by suffix. Example: `browser-control_browser_snapshot` is the same operation as `browser_snapshot`.

## Safety Rules

- Expect approval for submissions, purchases, deletions, downloads, auth actions, or form submits.
- Prefer inspection before action.
- Verify the resulting page state after every approved or destructive action.
- Prefer targeted extract or snapshot data over broad HTML dumps.

## Screenshots

- Skip screenshots for forms, tables, text extraction, and most navigation tasks.
- Use screenshots for visual QA, pixel/layout checks, canvases, charts, maps, image-based CAPTCHAs, or when the user explicitly asks what the page looks like.
- When using screenshots, still take a structural snapshot first so actions use stable refs.

## References

- Read `references/mcp-tools.md` for the CLI/MCP split and tool-by-tool selection rules.
- Read `references/examples.md` for example workflows with and without screenshots.
- Read `references/troubleshooting.md` when Broc is degraded, refs go stale, or the browser is missing.

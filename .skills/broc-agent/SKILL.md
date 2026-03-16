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
- Use `broc launch &` when the user wants the managed browser opened immediately.
- When launching from an agent workflow, start `broc launch &` in the background and then re-check `browser_status` until Broc is ready. Do not block on the launch command itself.
- Use `broc status --json` for CLI-side health checks.
- Use `broc snapshot --json` for CLI-side inspection and debugging.
- Use `broc mcp-config --client=<name>` to generate integration config; prefer generated configs that run `serve`.

## Operating Loop

1. Call `browser_status` if runtime readiness is unclear.
2. Create or update a notebook for any non-trivial task so the task has durable history and a user-visible result view.
3. Record the user request in the notebook before doing substantial work.
4. Call `browser_snapshot` before acting.
5. Use refs only from the latest snapshot.
6. Take the smallest safe action.
7. After every meaningful action or page change, update the notebook before moving on.
8. Re-snapshot after navigation or any action that can change page state.
9. Use `browser_tabs` when tab focus or active context is unclear.

## Notebook Discipline

- Use notebook for any task that is multi-step, long-running, likely to produce artifacts, or where the user will benefit from a persistent result view.
- Create the notebook early with `notebook_create` and include the task goal in the initial notebook state.
- Treat the notebook as the durable task record: keep a simple history of what the agent did, what the user asked for, and what results were produced.
- Keep the user request visible in the notebook, either in `view.summary`, a dedicated section, or highlights.
- Use `notebook_append_event` after every meaningful action, and expect Broc to also mirror every browser action and browser event into the linked notebook timeline so the record includes clicks, typing, navigation, waits, extracts, snapshots, screenshots, approvals, and page transitions.
- Every task completed inside the workflow must be appended to the notebook timeline with `notebook_append_event`; do not leave completed subtasks implied only by the final summary.
- Use `notebook_set_view` for the parts the user should see: requested outputs, findings, summaries, artifacts, current status, and next actions.
- Use `notebook_add_artifact` for screenshots, extracts, saved files, generated reports, or any output the user may want to revisit.
- Keep the notebook current through the task, not only at the end.
- Do not wait until the task is done to add findings. If the agent visits five promising pages, the notebook should already show those five pages, why they mattered, and any artifacts captured from them.
- When exploring multiple candidates, keep a running list of candidates reviewed, links visited, and keep/reject decisions in the notebook.
- When the task finishes, append a final completion event and call `notebook_open` so the finished notebook is visible to the user.

## Notebook Defaults

- In the notebook view, track at least: what the user asked for, current status, key findings so far, links/pages reviewed, and the final result or deliverables.
- Put user-facing research output in `view.sections`, `view.highlights`, and `view.summary`; do not invent ad hoc top-level keys for final results when the content should be rendered in the notebook UI.
- When a browser workflow changes tabs, pages, or state in important ways, add a short event describing it.
- When the task finishes, ensure the notebook view reads like a clean result page rather than a raw debug dump.
- For research tasks, keep the notebook view populated during the task with sections such as `Task Request`, `Pages Reviewed`, `Promising Finds`, `Rejected Options`, and `Next Steps`.

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
- Notebook: `notebook_create`, `notebook_update`, `notebook_set_view`, `notebook_append_event`, `notebook_add_artifact`, `notebook_get`, `notebook_list`, `notebook_open`

If the client namespaces tool names, use the exact exposed tool name from the client and map it by suffix. Example: `browser-control_browser_snapshot` is the same operation as `browser_snapshot`.

## Safety Rules

- Expect approval for submissions, purchases, deletions, downloads, auth actions, or form submits.
- Prefer inspection before action.
- Verify the resulting page state after every approved or destructive action.
- Prefer targeted extract or snapshot data over broad HTML dumps.

## User Intervention

- Stop and prompt the user when the workflow requires CAPTCHA solving, MFA, passkeys, device approval, SSO consent, payment confirmation, or secrets the agent does not have.
- Stop and prompt the user when Broc reaches a restricted or non-automatable page.
- Treat `browser_approve` as a checkpoint for destructive, irreversible, security-sensitive, or account-affecting actions; summarize the action before asking the user to proceed.
- After the user completes a manual step, call `browser_status` and then continue from a fresh `browser_snapshot`.

## Screenshots

- Skip screenshots for forms, tables, text extraction, and most navigation tasks.
- Use screenshots for visual QA, pixel/layout checks, notebooks, charts, maps, image-based CAPTCHAs, or when the user explicitly asks what the page looks like.
- When using screenshots, still take a structural snapshot first so actions use stable refs.
- For visual decision-making tasks such as design research, inspiration gathering, layout comparison, or style selection, take screenshots as evidence and save the important ones to the notebook as artifacts.
- When a screenshot is part of the reasoning, add a notebook event describing what the screenshot showed and why it mattered.
- If the client or Broc host exposes screenshot-based X/Y coordinate clicking, use it to probe visually ambiguous targets from the screenshot, then record the action and result in the notebook.
- After any coordinate-based click or screenshot-driven exploration step, re-snapshot, note what changed, and save any important before/after screenshots to the notebook.

## References

- Read `references/mcp-tools.md` for the CLI/MCP split and tool-by-tool selection rules.
- Read `references/examples.md` for example workflows with and without screenshots.
- Read `references/troubleshooting.md` when Broc is degraded, refs go stale, or the browser is missing.

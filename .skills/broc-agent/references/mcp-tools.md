# Broc CLI and MCP Tools

## CLI Commands

- `broc` - start the MCP server only; this is the idle-safe default for integrations
- `broc serve` - explicit MCP-only entrypoint
- `broc launch` - open the managed browser and start the Broc stack immediately; in agent workflows, launch it in the background and do not rely on the command itself as the readiness signal
- `broc launch --no-mcp` - open only the managed browser runtime when MCP is already attached elsewhere
- `broc status --json` - inspect install, bridge, and runtime readiness
- `broc snapshot --json` - inspect the current page from the CLI side
- `broc mcp-config --client=<generic|claude-code|codex|opencode>` - print client config

## MCP Observation Tools

- `browser_status` - check whether Broc is ready; use first when runtime state is unclear
- `browser_snapshot` - inspect the current page and get refs for actions
- `browser_tabs` - list tabs when context may have changed
- `browser_extract` - read text, HTML, or an attribute from a ref or selector
- `browser_screenshot` - capture visible page state when visual evidence matters

## MCP Action Tools

- `browser_click` - click an element ref
- `browser_type` - type into an input; `submit=true` is higher risk
- `browser_press` - send keys such as `Enter`, `Escape`, or arrows
- `browser_scroll` - move the page or a scrollable element
- `browser_navigate` - navigate to a URL or use `back`, `forward`, `reload`
- `browser_select` - choose dropdown values
- `browser_wait` - wait for visibility, attachment, detachment, or a timeout

## MCP Safety Tools

- `browser_approve` - approve or deny a pending high-risk action
- `browser_audit_log` - inspect recent action history

## MCP Notebook Tools

- `notebook_create` - create a persistent task notebook early for long-running or multi-step work
- `notebook_update` - update task title, status, tags, or linked browser context
- `notebook_set_view` - store the user-facing task summary, requested outputs, findings, deliverables, and current structured state
- `notebook_append_event` - add durable timeline entries for important actions and milestones; use this continuously, not just at the end, even though Broc now auto-mirrors browser actions into linked notebooks
- `notebook_add_artifact` - persist screenshots, extracts, files, reports, or other outputs the user may want later
- `notebook_get` - inspect a task notebook
- `notebook_list` - inspect all current notebook tasks
- `notebook_open` - open the user-facing notebook UI

## Selection Rules

- Use `browser_snapshot` instead of `browser_screenshot` unless the task is visual.
- Use `browser_extract` for exact values instead of reading large snapshots repeatedly.
- Use `browser_wait` after navigation or async UI changes instead of blind sleeps.
- Use `browser_status` and `broc status --json` for diagnosis, not to force startup.
- After `broc launch`, use `browser_status` to decide when the browser and bridge are actually ready. If you started launch from an agent, run it in the background and then re-check status.
- If the tool name is namespaced by the MCP host, match it by the trailing Broc tool name.
- Use notebook for any task that is multi-step, long-running, or produces user-visible results or artifacts.
- Put what the user asked for into the notebook early so the task record stays grounded in the request.
- Keep a simple event history in the notebook that explains what the agent did and why major state changes happened.
- After every meaningful action, page opened, candidate reviewed, finding captured, task completed, or conclusion reached, update the notebook before moving on.
- Every completed task or subtask should be appended to the notebook timeline with `notebook_append_event`.
- Keep polished results, findings, and artifacts in the notebook view, especially in `summary`, `highlights`, and `sections` so the notebook UI can render them.
- For research or curation tasks, keep a running record of links visited, links worth keeping, links rejected, and the rationale.
- For visual tasks, capture screenshots as evidence, save the important ones as artifacts, and connect them to findings in the notebook view.
- When the task is complete, append a final completion event and call `notebook_open`.
- If the host supports screenshot-based coordinate clicking, use it for visually ambiguous targets and log the action/result in the notebook.

## Built-In Broc Guidance

- Prompt: `browse_workflow`
- Prompt: `browser_safety_policy`
- Resource: `broc://guide/browser-workflow`
- Resource: `broc://guide/browser-safety`

Read them when the client exposes prompts/resources and you want Broc-native guidance.

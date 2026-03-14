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

## Selection Rules

- Use `browser_snapshot` instead of `browser_screenshot` unless the task is visual.
- Use `browser_extract` for exact values instead of reading large snapshots repeatedly.
- Use `browser_wait` after navigation or async UI changes instead of blind sleeps.
- Use `browser_status` and `broc status --json` for diagnosis, not to force startup.
- After `broc launch`, use `browser_status` to decide when the browser and bridge are actually ready. If you started launch from an agent, run it in the background and then re-check status.
- If the tool name is namespaced by the MCP host, match it by the trailing Broc tool name.

## Built-In Broc Guidance

- Prompt: `browse_workflow`
- Prompt: `browser_safety_policy`
- Resource: `broc://guide/browser-workflow`
- Resource: `broc://guide/browser-safety`

Read them when the client exposes prompts/resources and you want Broc-native guidance.

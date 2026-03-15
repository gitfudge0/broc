# Broc Usage Examples

## Without Screenshots

Use this pattern for forms, search flows, tables, and text-first tasks.

Example request:
"Open the dashboard, find the current plan name, and tell me whether billing is monthly or annual."

Recommended flow:

1. Ensure Broc tools are available through `broc` or `broc serve`.
2. Call `browser_status` if readiness is unclear.
3. Call `browser_snapshot`.
4. Use `browser_click`, `browser_type`, `browser_navigate`, or `browser_wait` as needed.
5. Re-snapshot after meaningful changes.
6. Use `browser_extract` for the final values.

Example interaction shape:

- `browser_snapshot`
- `browser_click` on the billing/settings ref
- `browser_wait` for the settings panel
- `browser_snapshot`
- `browser_extract` for plan name
- `browser_extract` for billing cadence

## With Screenshots

Use this pattern when the user asks about layout, visual regressions, charts, maps, or image-heavy state.

Example request:
"Open the analytics page and confirm whether the chart legend overlaps the graph on desktop."

Recommended flow:

1. Call `browser_status` if readiness is unclear.
2. Call `browser_snapshot` first to get page structure.
3. Navigate or click into the relevant view.
4. Call `browser_screenshot` once the page is in the right state.
5. Use the screenshot for visual judgment; use snapshot refs for any follow-up actions.

Example interaction shape:

- `browser_snapshot`
- `browser_navigate` to the analytics URL
- `browser_wait` for the chart container
- `browser_snapshot`
- `browser_screenshot`

## CLI + MCP Combined

Use CLI for runtime control, then MCP for browser work.

Example request:
"Check whether Broc is healthy, then sign in and extract the account email."

Recommended flow:

1. Run `broc status --json` if the runtime itself may be unhealthy.
2. If the user wants a visible browser immediately, run `broc launch` in the background and then check `browser_status` until Broc is ready.
3. Otherwise let MCP browser-backed tools lazy-start the browser.
4. Use `browser_snapshot` and `browser_type` to fill the form.
5. If submit triggers approval, use `browser_approve`.
6. Re-snapshot and `browser_extract` the account email.

## High-Risk Action Example

Example request:
"Delete the draft post titled Launch Notes."

Recommended flow:

1. Inspect with `browser_snapshot`.
2. Find the delete control and verify it targets the right item.
3. Call `browser_click`.
4. If Broc returns an approval request, summarize the action clearly and call `browser_approve` only after confirmation is appropriate.
5. Re-snapshot and verify the draft no longer appears.

## Manual Step Example

Example request:
"Log in and open the account security page."

Recommended flow:

1. Use `browser_snapshot` to reach the login form.
2. If the flow requires a password, MFA code, passkey, CAPTCHA, or SSO approval, stop and ask the user to complete that step.
3. After the user confirms they are done, call `browser_status`.
4. Take a fresh `browser_snapshot`.
5. Continue to the security page.

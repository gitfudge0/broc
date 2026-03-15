# Broc Usage Examples

## Without Screenshots

Use this pattern for forms, search flows, tables, and text-first tasks.

Example request:
"Open the dashboard, find the current plan name, and tell me whether billing is monthly or annual."

Recommended flow:

1. Ensure Broc tools are available through `broc` or `broc serve`.
2. Create a canvas with the user request captured in the goal or user view.
3. Call `browser_status` if readiness is unclear.
4. Call `browser_snapshot`.
5. Use `browser_click`, `browser_type`, `browser_navigate`, or `browser_wait` as needed.
6. Re-snapshot after meaningful changes.
7. Use `browser_extract` for the final values.
8. Update the canvas with the findings and a short event history.

Example interaction shape:

- `canvas_create`
- `canvas_set_user_view` with the user request and expected result
- `browser_snapshot`
- `browser_click` on the billing/settings ref
- `browser_wait` for the settings panel
- `browser_snapshot`
- `browser_extract` for plan name
- `browser_extract` for billing cadence
- `canvas_append_event` for milestones
- `canvas_set_user_view` with the final answer

## With Screenshots

Use this pattern when the user asks about layout, visual regressions, charts, maps, or image-heavy state.

Example request:
"Open the analytics page and confirm whether the chart legend overlaps the graph on desktop."

Recommended flow:

1. Create a canvas so the screenshot and final visual judgment have a persistent home.
2. Call `browser_status` if readiness is unclear.
3. Call `browser_snapshot` first to get page structure.
4. Navigate or click into the relevant view.
5. Call `browser_screenshot` once the page is in the right state.
6. Save the screenshot to the canvas as an artifact.
7. Use the screenshot for visual judgment; use snapshot refs for any follow-up actions.

Example interaction shape:

- `canvas_create`
- `canvas_set_user_view` with the request and what visual question is being answered
- `browser_snapshot`
- `browser_navigate` to the analytics URL
- `browser_wait` for the chart container
- `browser_snapshot`
- `browser_screenshot`
- `canvas_add_artifact`
- `canvas_append_event` describing the screenshot and conclusion
- `canvas_set_user_view`

## CLI + MCP Combined

Use CLI for runtime control, then MCP for browser work.

Example request:
"Check whether Broc is healthy, then sign in and extract the account email."

Recommended flow:

1. Run `broc status --json` if the runtime itself may be unhealthy.
2. If the user wants a visible browser immediately, run `broc launch` in the background and then check `browser_status` until Broc is ready.
3. Otherwise let MCP browser-backed tools lazy-start the browser.
4. Create a canvas and record the requested outcome.
5. Use `browser_snapshot` and `browser_type` to fill the form.
6. If submit triggers approval, use `browser_approve`.
7. Re-snapshot and `browser_extract` the account email.
8. Update the canvas with the result and any notable steps the user may want to review later.

## High-Risk Action Example

Example request:
"Delete the draft post titled Launch Notes."

Recommended flow:

1. Inspect with `browser_snapshot`.
2. Find the delete control and verify it targets the right item.
3. Call `browser_click`.
4. If Broc returns an approval request, summarize the action clearly and call `browser_approve` only after confirmation is appropriate.
5. Re-snapshot and verify the draft no longer appears.

## Canvas-First Result Example

Example request:
"Audit this signup flow, capture the problems you found, and leave me a clean result I can review later."

Recommended flow:

1. Create a canvas immediately.
2. Put the user request into the user view.
3. Keep the working checklist and notes in the agent view.
4. Append events for major actions taken during the audit.
5. Save screenshots and extracts as artifacts.
6. Finish by updating the user view with findings, evidence, and recommended follow-ups.

Example interaction shape:

- `canvas_create`
- `canvas_set_user_view` with request summary
- `canvas_set_agent_view` with plan/checklist
- `browser_snapshot`
- `browser_screenshot`
- `canvas_add_artifact`
- `canvas_append_event`
- `canvas_set_user_view` with final findings
- `canvas_open`

## Research And Curation Example

Example request:
"Go to Pinterest and collect strong examples of modernism-inspired web UI design."

Recommended flow:

1. Create a canvas immediately and put the request into the user view.
2. Add an agent-view checklist for search terms, boards, and evaluation criteria.
3. Each time a result is opened, append an event with the page title or link and why it is being reviewed.
4. For visually judged candidates, capture a screenshot and save it as a canvas artifact.
5. Update the user view during the task with sections like `Pages Reviewed`, `Promising Finds`, and `Rejected Options`.
6. When a design is worth keeping, add the link, short rationale, and screenshot artifact reference to the user view right away.
7. When a design is rejected, record a short reason so the user can see the search process.
8. Finish with a curated result set rather than a blank canvas plus a final summary.

Example interaction shape:

- `canvas_create`
- `canvas_set_user_view` with request and evaluation criteria
- `canvas_set_agent_view` with search plan
- `browser_snapshot`
- `browser_click` on a Pinterest result
- `canvas_append_event` with visited link and reason for review
- `browser_screenshot`
- `canvas_add_artifact`
- `canvas_set_user_view` with kept/rejected result entry
- repeat for additional candidates
- `canvas_open`

## Screenshot-Led Exploration Example

Example request:
"Inspect this visual gallery and figure out what a floating control does."

Recommended flow:

1. Take a structural snapshot first.
2. Take a screenshot because the target is visually ambiguous.
3. If the host supports screenshot-based X/Y coordinate clicking, click the target by coordinates from the screenshot.
4. Immediately take a fresh snapshot or follow-up screenshot.
5. Record the before/after evidence and what changed in the canvas timeline and artifacts.

Example interaction shape:

- `browser_snapshot`
- `browser_screenshot`
- coordinate-based click from screenshot, if supported by the host
- `browser_snapshot`
- `browser_screenshot`
- `canvas_add_artifact`
- `canvas_append_event`

## Manual Step Example

Example request:
"Log in and open the account security page."

Recommended flow:

1. Use `browser_snapshot` to reach the login form.
2. If the flow requires a password, MFA code, passkey, CAPTCHA, or SSO approval, stop and ask the user to complete that step.
3. After the user confirms they are done, call `browser_status`.
4. Take a fresh `browser_snapshot`.
5. Continue to the security page.

# Broc Troubleshooting

## Browser Not Running

- Call `browser_status` first.
- If MCP is attached and you are about to do browser work, let the browser-backed tool trigger lazy startup.
- If the user explicitly wants the browser opened now, run `broc launch` in the background and then use `browser_status` to check readiness.

## MCP Attached But No Tools Work

- Run `broc status --json`.
- Check whether Broc was installed and whether the bridge is degraded.
- Regenerate config with `broc mcp-config --client=<name>` if the client may still be using an older launch-style config.

## Stale Ref Errors

- Take a fresh `browser_snapshot`.
- Re-find the target ref from the latest page state.
- Retry with the new ref only.

## Wrong Tab Or Lost Context

- Call `browser_tabs`.
- Identify the correct active tab or target tab ID.
- Re-snapshot that tab before acting.

## Restricted Or Non-Automatable Pages

- Browser internal pages, extension pages, and vendor-restricted pages cannot be automated.
- Explain the limitation and move the workflow back to a normal web page when possible.

## Approval Requested

- Treat the approval request as a checkpoint.
- Restate what the action will do.
- After approval, verify the resulting page state with a fresh snapshot or extract.

## Manual Intervention Needed

- If the site requires CAPTCHA solving, MFA, passkeys, SSO approval, payment confirmation, or a secret the agent does not have, pause and ask the user to handle that step.
- If the page is restricted or the browser refuses automation on it, explain the limitation and ask the user to move the flow back to a normal automatable page.
- After the user finishes the manual action, re-check `browser_status` and continue from a fresh `browser_snapshot`.

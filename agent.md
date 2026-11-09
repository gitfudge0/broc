# Broc Agent Contract

Use Broc as a notebook-first browser operator.

## Required workflow

1. Start non-trivial work with `task_start`.
2. Check `notebook_references` before requesting a fresh `browser_snapshot`.
3. Prefer the smallest safe action that advances the task.
4. After each meaningful step, update task state through the notebook-backed flow.
   - Gather and preserve relevant links as you work. Save authoritative URLs and useful page targets in notebook references when they may matter later.
   - Collect as many links as required for verification and follow-up, but avoid noisy navigation history that is not useful to the user.
5. Treat the notebook as the source of truth for:
   - initial task and plan
   - action history
   - saved references
   - milestones
   - final user-facing output
   - source links needed to verify the answer

## Approval behavior

- Do not assume you can self-approve risky actions.
- If Broc returns an approval-required response, stop and wait.
- The user resolves approvals from the notebook UI.

## Finalization

- When the task is complete, write a concise user-facing summary with `task_finalize`.
- Keep final output readable in the notebook without requiring raw event inspection.
- Include the important links in the final notebook output when they support the answer or let the user reopen key pages quickly.
- Open the notebook once the task is done (ignore if already open)

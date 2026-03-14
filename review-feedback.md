# Review Feedback

The rename is not backward-compatible for existing installs. Upgraded users can lose connectivity to the native host and the CLI no longer sees previously prepared state, so the patch introduces functional regressions even though fresh installs will work.

## Findings

- [P1] Preserve compatibility with existing native-host installs — `src/background/index.ts:487`
  If a user upgrades an existing install without rerunning `setup`/`install`, the browser extension will now call `connectNative("broc")`, but the only manifest they have on disk is still the old `browser_control` host registration. In that upgrade path the bridge never starts, so every bridge-backed command/tool regresses until the user manually reinstalls the native host. Keep a fallback to the previous host name or add an explicit migration step in the upgrade flow.

- [P2] Continue reading the previous setup/state directories — `src/cli/paths.ts:32-48`
  Changing all app paths from `browser-control` to `broc` makes the CLI ignore every existing prepared profile, downloaded Chromium runtime, and `setup-state.json` from prior installs. After upgrading, `status`, `launch`, and `teardown` behave as if the machine was never set up, while the old assets are left orphaned on disk. A compatibility fallback or one-time migration is needed for users who already have a managed environment.

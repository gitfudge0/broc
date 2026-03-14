export function buildHelpText(): string {
  return `
Broc - AI agent browser control via native messaging

Managed runtime: Chromium (installed via ./scripts/install.sh)

Usage:
  broc [command] [options]

Commands:
  (none)       Start the MCP server (default, for use with AI agents)
  launch       Launch the managed Chromium browser and start the MCP server
  status       Show build, setup, and bridge readiness
  mcp-config   Print the MCP config that points to the staged broc wrapper
  reset        Fully uninstall the staged runtime, managed browser, and managed profile
  snapshot     Capture and pretty-print the current page snapshot
  help         Show this help message

Common Options:
  --url=<url>        URL to open in a fresh tab after launch (default: https://www.google.com)
  --no-mcp           Launch browser only; skip starting the MCP server
  --json             For status/snapshot, output machine-readable JSON
  --client=<name>    MCP config target: generic, claude-code, codex
  --copy             Copy generated MCP config to the clipboard when supported

Snapshot Options:
  --verbose, -v      Show element tags, bounding boxes, and locators
  --tab=<id>         Target a specific tab by ID (default: active tab)

Quick Start:
  1. ./scripts/install.sh
  2. broc mcp-config --copy
  3. Paste the config into your MCP client

Uninstall:
  1. ./scripts/uninstall.sh
  2. Remove the MCP client config snippet manually if no longer needed

Notes:
  - install.sh stages a stable runtime under your home directory.
  - uninstall.sh removes Broc-owned staged/runtime assets but leaves the repo checkout intact.
  - launch defaults to the managed Chromium browser.
  - use status --json or the browser_status MCP tool for canonical health checks.
  - setup/install/teardown/uninstall remain available for repo/dev compatibility only.
  - mcp-config emits an absolute command path; it never points at the repo checkout.
`.trim();
}

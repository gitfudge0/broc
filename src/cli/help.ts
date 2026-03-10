export function buildHelpText(): string {
  return `
Broc - AI agent browser control via native messaging

Supports Firefox, Chrome, and Chromium.

Usage:
  broc [command] [options]

Commands:
  (none)       Start the MCP server (default, for use with AI agents)
  setup        Build/install/prepare browser setup for managed launching
  launch       Launch a browser and start the MCP server
  teardown     Remove managed setup artifacts created by setup
  status       Show build, setup, and bridge readiness
  install      Legacy: install only the native messaging host manifest
  uninstall    Legacy: remove only the native messaging host manifest
  snapshot     Capture and pretty-print the current page snapshot
  help         Show this help message

Common Options:
  --browser=<name>   Target browser: firefox, chrome, chromium
  --url=<url>        URL to open in a fresh tab after launch (default: https://www.google.com)
  --no-mcp           Launch browser only; skip starting the MCP server
  --json             For status/snapshot, output machine-readable JSON

Snapshot Options:
  --verbose, -v      Show element tags, bounding boxes, and locators
  --tab=<id>         Target a specific tab by ID (default: active tab)

Quick Start:
  1. npm install
  2. npm run setup -- --browser=firefox
  3. npm run launch -- --browser=firefox

Notes:
  - setup is the primary install path and prepares managed profiles.
  - launch requires a browser selection and runs as the normal long-lived command.
  - launch always opens the requested URL in a fresh tab after the bridge connects.
  - if the browser is running a stale extension worker, launch warns and falls back for that run.
  - use --no-mcp when you only want the browser session.
  - broc with no subcommand is still MCP-only/manual mode.
  - use status --json or the browser_status MCP tool for canonical health checks.
  - install/uninstall remain available for low-level native-host management.
`.trim();
}

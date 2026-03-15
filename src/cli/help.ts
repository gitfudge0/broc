export function buildHelpText(): string {
  return `
Broc browser control

Usage:
  broc [command] [options]

Commands:
  (none), serve     Start the MCP server only
  launch            Launch the managed Chromium browser
  status            Show runtime and bridge status
  mcp-config        Print MCP config for the installed broc command
  snapshot          Print a snapshot of the current page
  uninstall         Remove the installed runtime and managed browser data
  reset             Alias for uninstall
  help               Show this help message

Options:
  --url=<url>       Open a URL after launch
  --no-mcp          Launch the browser without starting MCP

mcp-config options:
  --client=<name>   One of: generic, claude-code, codex, opencode
  --copy            Copy the generated config when supported

status options:
  --json            Output machine-readable JSON

snapshot options:
  --json            Output machine-readable JSON
  --verbose, -v     Include more element detail
  --tab=<id>        Target a specific tab
`.trim();
}

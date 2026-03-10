export function parseNoMcpFlag(argv: string[]): boolean {
  return argv.includes("--no-mcp");
}

export function parseJsonFlag(argv: string[]): boolean {
  return argv.includes("--json");
}

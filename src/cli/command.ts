export function resolveCliCommand(argv: string[]): string {
  const command = argv.find((arg) => !arg.startsWith("-"));
  return command || "";
}

export function stripResolvedCommand(argv: string[], command: string): string[] {
  if (!command) {
    return [...argv];
  }

  const index = argv.indexOf(command);
  if (index === -1) {
    return [...argv];
  }

  return [...argv.slice(0, index), ...argv.slice(index + 1)];
}

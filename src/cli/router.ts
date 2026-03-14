export interface CliCommandHandlers {
  setup: () => Promise<void>;
  launch: () => Promise<void>;
  serve: () => Promise<void>;
  teardown: () => Promise<void>;
  install: () => Promise<void>;
  uninstall: () => Promise<void>;
  uninstallNativeHost: () => Promise<void>;
  status: () => Promise<void>;
  mcpConfig: () => Promise<void>;
  reset: () => Promise<void>;
  stageInstall: () => Promise<void>;
  snapshot: () => Promise<void>;
  help: () => Promise<void> | void;
  unknown: (command: string) => Promise<void> | never;
}

export async function routeCliCommand(
  command: string,
  handlers: CliCommandHandlers,
): Promise<void> {
  switch (command) {
    case "setup":
      await handlers.setup();
      return;
    case "launch":
      await handlers.launch();
      return;
    case "serve":
      await handlers.serve();
      return;
    case "teardown":
      await handlers.teardown();
      return;
    case "install":
      await handlers.install();
      return;
    case "uninstall":
      await handlers.uninstall();
      return;
    case "uninstall-native-host":
      await handlers.uninstallNativeHost();
      return;
    case "status":
      await handlers.status();
      return;
    case "mcp-config":
      await handlers.mcpConfig();
      return;
    case "reset":
      await handlers.reset();
      return;
    case "stage-install":
      await handlers.stageInstall();
      return;
    case "snapshot":
      await handlers.snapshot();
      return;
    case "help":
    case "--help":
    case "-h":
      await handlers.help();
      return;
    case "":
      await handlers.serve();
      return;
    default:
      await handlers.unknown(command);
  }
}

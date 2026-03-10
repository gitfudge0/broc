export interface CliCommandHandlers {
  setup: () => Promise<void>;
  launch: () => Promise<void>;
  teardown: () => Promise<void>;
  install: () => Promise<void>;
  uninstall: () => Promise<void>;
  status: () => Promise<void>;
  snapshot: () => Promise<void>;
  help: () => Promise<void> | void;
  start: () => Promise<void>;
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
    case "teardown":
      await handlers.teardown();
      return;
    case "install":
      await handlers.install();
      return;
    case "uninstall":
      await handlers.uninstall();
      return;
    case "status":
      await handlers.status();
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
      await handlers.start();
      return;
    default:
      await handlers.unknown(command);
  }
}

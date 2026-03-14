import { existsSync } from "fs";
import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const distCli = resolve(repoRoot, "dist", "cli.mjs");

function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env },
    });

    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0 || code === null) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

export async function runUninstall(dependencyOverrides = {}) {
  const deps = {
    exists: existsSync,
    runCommand,
    log: (message) => console.log(message),
    ...dependencyOverrides,
  };

  if (!deps.exists(distCli)) {
    if (!deps.exists(resolve(repoRoot, "package.json"))) {
      throw new Error("No Broc runtime build was found in this checkout.");
    }
    await deps.runCommand("npm", ["run", "build:runtime"]);
  }

  await deps.runCommand("node", [distCli, "reset"]);

  deps.log("Broc uninstall complete.");
  deps.log("  staged runtime removed");
  deps.log("  managed Chromium removed");
  deps.log("  managed profile removed");
  deps.log("  repo checkout left intact");
  deps.log("  remove the MCP client config snippet manually if you no longer want Broc configured");
}

if (process.argv[1] === __filename) {
  runUninstall().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

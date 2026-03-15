import { existsSync } from "fs";
import { rm } from "fs/promises";
import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const distDir = resolve(repoRoot, "dist");
const distCli = resolve(distDir, "cli.mjs");

export function parseCleanArgs(argv) {
  return {
    all: argv.includes("--all"),
  };
}

function runNode(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("node", args, {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env },
    });

    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0 || code === null) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Command exited with code ${code}`));
      }
    });
  });
}

export async function runClean(argv, dependencyOverrides = {}) {
  const options = parseCleanArgs(argv);
  const deps = {
    exists: existsSync,
    runNode,
    removeDir: (path) => rm(path, { recursive: true, force: true }),
    ...dependencyOverrides,
  };

  if (options.all && deps.exists(distCli)) {
    await deps.runNode([distCli, "teardown"]).catch(() => {});
    await deps.runNode([distCli, "uninstall-native-host"]).catch(() => {});
  }

  await deps.removeDir(distDir);
}

if (process.argv[1] === __filename) {
  runClean(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

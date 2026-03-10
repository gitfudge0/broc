import { existsSync } from "fs";
import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const distCli = resolve(repoRoot, "dist", "cli.mjs");

export function planRepoCli(argv) {
  const [command = "", ...rest] = argv;
  return {
    command,
    args: rest,
    needsBuild: command === "setup",
    needsDist: command !== "setup",
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

export async function runRepoCli(argv) {
  const plan = planRepoCli(argv);

  if (plan.needsBuild) {
    await runNode(["build.mjs"]);
  } else if (plan.needsDist && !existsSync(distCli)) {
    throw new Error("dist/cli.mjs is missing. Run 'npm run setup -- --browser=<name>' first.");
  }

  const cliArgs = [distCli];
  if (plan.command) {
    cliArgs.push(plan.command, ...plan.args);
  }
  await runNode(cliArgs);
}

if (process.argv[1] === __filename) {
  runRepoCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

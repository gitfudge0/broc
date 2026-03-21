import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { getAppPaths, getRepoPaths } from "../cli/paths.js";
import { ensureNotebookStore } from "./store.js";
import { getStandaloneNotebookUrl, startNotebookServer } from "./server.js";

const DEFAULT_NOTEBOOK_DEV_PORT = 43123;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const appPaths = getAppPaths();
  const repoPaths = getRepoPaths(resolve(__dirname));

  await ensureNotebookStore(appPaths);
  const { port } = await startNotebookServer({
    appPaths,
    repoPaths,
    port: DEFAULT_NOTEBOOK_DEV_PORT,
    stateKey: "standalone-dev",
  });

  const url = getStandaloneNotebookUrl({ port });
  console.log(`Notebook dev server ready at ${url}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

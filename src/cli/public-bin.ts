import { chmod, lstat, mkdir, readFile, readlink, symlink, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { delimiter, resolve } from "path";
import type { PublicBinInstallResult } from "./types.js";

const MANAGED_SCRIPT_MARKER = "# broc-managed-public-executable";

function expandHome(path: string): string {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
}

function resolveHome(env: NodeJS.ProcessEnv): string {
  return env.HOME || homedir();
}

function isOnPath(dir: string, envPath = process.env.PATH || ""): boolean {
  return envPath.split(delimiter).filter(Boolean).some((entry) => resolve(entry) === resolve(dir));
}

export function resolvePublicBinDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = resolveHome(env);
  const localBin = resolve(home, ".local", "bin");
  const homeBin = resolve(home, "bin");

  if (existsSync(homeBin) && isOnPath(homeBin, env.PATH) && !isOnPath(localBin, env.PATH)) {
    return homeBin;
  }

  return localBin;
}

function buildManagedScript(targetPath: string): string {
  return `#!/usr/bin/env bash
${MANAGED_SCRIPT_MARKER}
exec "${targetPath}" "$@"
`;
}

async function isManagedTarget(path: string, targetPath: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      return resolve(expandHome(await readlink(path))) === resolve(targetPath);
    }
    if (!stats.isFile()) {
      return false;
    }
    const content = await readFile(path, "utf-8");
    return content.includes(MANAGED_SCRIPT_MARKER);
  } catch {
    return false;
  }
}

export async function installPublicExecutable(
  managedWrapperPath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublicBinInstallResult> {
  const publicBinDir = resolvePublicBinDir(env);
  const executablePath = resolve(publicBinDir, "broc");

  await mkdir(publicBinDir, { recursive: true });

  if (existsSync(executablePath) && !await isManagedTarget(executablePath, managedWrapperPath)) {
    throw new Error(`Refusing to overwrite existing non-Broc executable at ${executablePath}`);
  }

  if (existsSync(executablePath)) {
    await unlink(executablePath);
  }

  try {
    await symlink(managedWrapperPath, executablePath);
    return {
      publicBinDir,
      executablePath,
      mode: "symlink",
      updated: true,
    };
  } catch {
    await writeFile(executablePath, buildManagedScript(managedWrapperPath));
    await chmod(executablePath, 0o755);
    return {
      publicBinDir,
      executablePath,
      mode: "script",
      updated: true,
    };
  }
}

export async function removePublicExecutable(path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    const stats = await lstat(path);
    if (!stats.isFile() && !stats.isSymbolicLink()) {
      return;
    }
    if (stats.isSymbolicLink()) {
      await unlink(path);
      return;
    }
    const content = await readFile(path, "utf-8").catch(() => null);
    if (!content?.includes(MANAGED_SCRIPT_MARKER)) {
      return;
    }
    await unlink(path);
  } catch {
    // Best-effort cleanup.
  }
}

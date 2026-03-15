import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { delimiter, dirname } from "path";
import { homedir } from "os";
import type { PathSetupResult } from "./types.js";

const BEGIN_MARKER = "# >>> broc >>>";
const END_MARKER = "# <<< broc <<<";

function normalizeLines(content: string): string {
  if (content.length === 0) return "";
  return content.endsWith("\n") ? content : `${content}\n`;
}

function resolveHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME || homedir();
}

export function isDirOnPath(dir: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.PATH || "").split(delimiter).filter(Boolean).some((entry) => entry === dir);
}

function shellName(shell = process.env.SHELL || ""): string {
  return shell.split("/").at(-1) || "";
}

function buildShellBlock(shell: string, publicBinDir: string): string {
  if (shell === "fish") {
    return `${BEGIN_MARKER}\nfish_add_path ${JSON.stringify(publicBinDir)}\n${END_MARKER}\n`;
  }
  return `${BEGIN_MARKER}\nexport PATH=${JSON.stringify(publicBinDir)}:$PATH\n${END_MARKER}\n`;
}

export function getPathSetupTargets(shell = process.env.SHELL || "", env: NodeJS.ProcessEnv = process.env): string[] {
  const home = resolveHome(env);
  switch (shellName(shell)) {
    case "zsh":
      return [`${home}/.zshrc`];
    case "bash": {
      const bashrc = `${home}/.bashrc`;
      const bashProfile = `${home}/.bash_profile`;
      if (existsSync(bashProfile)) {
        try {
          const content = readFileSync(bashProfile, "utf-8");
          if (content.includes(".bashrc")) {
            return [bashrc];
          }
        } catch {
          // Fall back to updating both files.
        }
        return [bashrc, bashProfile];
      }
      return [bashrc];
    }
    case "fish":
      return [`${home}/.config/fish/conf.d/broc.fish`];
    default:
      return [`${home}/.profile`];
  }
}

export function upsertManagedPathBlock(content: string, shell: string, publicBinDir: string): string {
  const block = buildShellBlock(shellName(shell), publicBinDir);
  const managedPattern = new RegExp(`${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, "g");
  const normalized = normalizeLines(content);
  if (managedPattern.test(normalized)) {
    return normalized.replace(managedPattern, block);
  }
  return normalized.length > 0 ? `${normalized}${block}` : block;
}

async function writeManagedBlock(path: string, shell: string, publicBinDir: string): Promise<boolean> {
  let current = "";
  try {
    current = await readFile(path, "utf-8");
  } catch {
    // Missing file is fine.
  }
  const next = upsertManagedPathBlock(current, shell, publicBinDir);
  if (next === normalizeLines(current)) {
    return false;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next);
  return true;
}

export async function ensurePathSetup(
  publicBinDir: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PathSetupResult> {
  if (isDirOnPath(publicBinDir, env)) {
    return {
      publicBinDir,
      alreadyOnPath: true,
      updatedFiles: [],
      manualInstructions: [],
      activationHint: null,
      warnings: [],
    };
  }

  const shell = env.SHELL || "";
  const targets = getPathSetupTargets(shell, env);
  const updatedFiles: string[] = [];
  const warnings: string[] = [];

  for (const target of targets) {
    try {
      const changed = await writeManagedBlock(target, shell, publicBinDir);
      if (changed) {
        updatedFiles.push(target);
      }
    } catch (error) {
      warnings.push(`Could not update ${target}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const activationHint = updatedFiles[0]
    ? `Run 'source ${updatedFiles[0]}' or open a new shell before using broc.`
    : null;

  const manualInstructions = updatedFiles.length === 0
    ? [`Add ${publicBinDir} to PATH manually.`]
    : [];

  return {
    publicBinDir,
    alreadyOnPath: false,
    updatedFiles,
    manualInstructions,
    activationHint,
    warnings,
  };
}

export async function removeManagedPathBlocks(files: string[] | undefined): Promise<void> {
  for (const file of files ?? []) {
    try {
      const current = await readFile(file, "utf-8");
      const next = current.replace(new RegExp(`${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, "g"), "");
      if (next !== current) {
        await writeFile(file, next);
      }
    } catch {
      // Best-effort cleanup.
    }
  }
}

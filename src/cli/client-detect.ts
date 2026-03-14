import { existsSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { resolveExecutable } from "./runtime.js";
import type { DetectedClient } from "./types.js";

interface ClientProbe {
  client: DetectedClient["client"];
  binaryNames: string[];
  configPaths: string[];
  directoryPaths: string[];
}

function buildProbes(home: string): ClientProbe[] {
  return [
    {
      client: "codex",
      binaryNames: ["codex"],
      configPaths: [
        resolve(home, ".codex", "config.toml"),
        resolve(home, ".config", "codex", "config.toml"),
      ],
      directoryPaths: [
        resolve(home, ".codex"),
        resolve(home, ".config", "codex"),
      ],
    },
    {
      client: "claude-code",
      binaryNames: ["claude", "claude-code"],
      configPaths: [
        resolve(home, ".claude.json"),
        resolve(home, ".claude", "settings.json"),
        resolve(home, ".config", "claude-code", "config.json"),
      ],
      directoryPaths: [
        resolve(home, ".claude"),
        resolve(home, ".config", "claude-code"),
      ],
    },
    {
      client: "opencode",
      binaryNames: ["opencode"],
      configPaths: [
        resolve(home, ".config", "opencode", "config.json"),
        resolve(home, ".opencode", "config.json"),
      ],
      directoryPaths: [
        resolve(home, ".config", "opencode"),
        resolve(home, ".opencode"),
      ],
    },
  ];
}

function detectClient(probe: ClientProbe, env: NodeJS.ProcessEnv): DetectedClient {
  for (const configPath of probe.configPaths) {
    if (existsSync(configPath)) {
      return {
        client: probe.client,
        status: "detected",
        method: "config",
        evidence: configPath,
      };
    }
  }

  for (const binary of probe.binaryNames) {
    const path = resolveExecutable(binary, env);
    if (path) {
      return {
        client: probe.client,
        status: "likely_installed",
        method: "binary",
        evidence: path,
      };
    }
  }

  for (const directoryPath of probe.directoryPaths) {
    if (existsSync(directoryPath)) {
      return {
        client: probe.client,
        status: "likely_installed",
        method: "directory",
        evidence: directoryPath,
      };
    }
  }

  return {
    client: probe.client,
    status: "not_found",
    method: null,
    evidence: null,
  };
}

export function detectInstalledClients(
  home = process.env.HOME || homedir(),
  env: NodeJS.ProcessEnv = process.env,
): DetectedClient[] {
  try {
    return buildProbes(home).map((probe) => detectClient(probe, env));
  } catch {
    return buildProbes(home).map((probe) => ({
      client: probe.client,
      status: "not_found",
      method: null,
      evidence: null,
    }));
  }
}

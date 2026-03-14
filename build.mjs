import * as esbuild from "esbuild";
import { cp, mkdir, chmod, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";

const watch = process.argv.includes("--watch");
const runtimeOnly = process.argv.includes("--runtime");
const EXTENSION_BUILD_STATE_PATH = "dist/.extension-build.json";

// ---- Browser-specific extension configs ----

/** @type {esbuild.BuildOptions} */
const sharedExtensionBase = {
  bundle: true,
  sourcemap: true,
  format: "iife",
  logLevel: "info",
};

/** @type {esbuild.BuildOptions} */
const firefoxExtension = {
  ...sharedExtensionBase,
  target: "firefox128",
};

/** @type {esbuild.BuildOptions} */
const chromeExtension = {
  ...sharedExtensionBase,
  target: "chrome130",
};

/** @type {esbuild.BuildOptions} */
const sharedNode = {
  bundle: true,
  sourcemap: true,
  target: "node20",
  format: "esm",
  platform: "node",
  logLevel: "info",
};

const mcpServerExternals = ["@modelcontextprotocol/sdk/*", "zod", "@puppeteer/browsers"];
const cliExternals = ["@puppeteer/browsers"];

// ---- Static file copying ----

async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

function buildManifestVersion(packageVersion, serial) {
  const parts = packageVersion.split(".");
  if (parts.length !== 3) {
    throw new Error(`Unsupported package version format: ${packageVersion}`);
  }
  if (serial > 65535) {
    throw new Error("Extension build serial exceeded 65535. Reset dist/.extension-build.json or bump package.json version.");
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.${serial}`;
}

async function nextExtensionBuildMetadata() {
  await ensureDir("dist");

  let lastSerial = 0;
  if (existsSync(EXTENSION_BUILD_STATE_PATH)) {
    const current = await readJson(EXTENSION_BUILD_STATE_PATH);
    lastSerial = typeof current.lastSerial === "number" ? current.lastSerial : 0;
  }

  const next = { lastSerial: lastSerial + 1 };
  await writeFile(EXTENSION_BUILD_STATE_PATH, JSON.stringify(next, null, 2) + "\n");
  return next;
}

async function writeGeneratedManifests() {
  const [firefoxManifest, chromeManifest, pkg, buildState] = await Promise.all([
    readJson("src/manifest.firefox.json"),
    readJson("src/manifest.chrome.json"),
    readJson("package.json"),
    nextExtensionBuildMetadata(),
  ]);

  const generatedVersion = buildManifestVersion(pkg.version, buildState.lastSerial);

  firefoxManifest.version = generatedVersion;
  firefoxManifest.version_name = pkg.version;
  chromeManifest.version = generatedVersion;
  chromeManifest.version_name = pkg.version;

  await ensureDir("dist/chrome");
  await writeFile("dist/chrome/manifest.json", JSON.stringify(chromeManifest, null, 2) + "\n");
  if (!runtimeOnly) {
    await ensureDir("dist/firefox");
    await writeFile("dist/firefox/manifest.json", JSON.stringify(firefoxManifest, null, 2) + "\n");
  }
}

/**
 * Copy browser-specific manifest and shared static files.
 */
async function copyStatic() {
  await writeGeneratedManifests();

  // Native host manifest template (shared — used by CLI install command)
  await cp("src/bridge/broc.json", "dist/broc.json");
}

/**
 * Read the browser polyfill source to prepend to Chrome builds.
 * The polyfill assigns `globalThis.browser = chrome` if browser is undefined.
 */
async function getChromePolyfillBanner() {
  // Build the polyfill separately to get the JS output
  const result = await esbuild.build({
    entryPoints: ["src/browser-polyfill.ts"],
    bundle: true,
    write: false,
    format: "iife",
    target: "chrome130",
  });
  return result.outputFiles[0].text;
}

// ---- Build functions ----

/**
 * Build extension scripts for a specific browser.
 */
async function buildExtension(browser, options, banner = {}) {
  const outdir = `dist/${browser}`;

  const background = esbuild.build({
    ...options,
    entryPoints: ["src/background/index.ts"],
    outfile: `${outdir}/background.js`,
    banner,
  });

  const content = esbuild.build({
    ...options,
    entryPoints: ["src/content/index.ts"],
    outfile: `${outdir}/content.js`,
    banner,
  });

  return Promise.all([background, content]);
}

/**
 * Build Node.js binaries (bridge, MCP server, CLI) — shared across browsers.
 */
async function buildNode() {
  const bridge = esbuild.build({
    ...sharedNode,
    entryPoints: ["src/bridge/host.ts"],
    outfile: "dist/bridge.mjs",
    banner: { js: "#!/usr/bin/env node" },
  });

  const mcpServer = esbuild.build({
    ...sharedNode,
    entryPoints: ["src/mcp/server.ts"],
    outfile: "dist/mcp-server.mjs",
    banner: { js: "#!/usr/bin/env node" },
    external: mcpServerExternals,
  });

  const cli = esbuild.build({
    ...sharedNode,
    entryPoints: ["src/cli.ts"],
    outfile: "dist/cli.mjs",
    banner: { js: "#!/usr/bin/env node" },
    external: cliExternals,
  });

  await Promise.all([bridge, mcpServer, cli]);

  // Make executables
  await chmod("dist/bridge.mjs", 0o755);
  await chmod("dist/mcp-server.mjs", 0o755);
  await chmod("dist/cli.mjs", 0o755);
}

// ---- Main ----

if (watch) {
  // Watch mode: build both browsers and node, then watch for changes
  // For watch mode, we rebuild both browsers on every change
  const polyfillBanner = await getChromePolyfillBanner();
  const chromeBanner = { js: polyfillBanner };

  // Firefox watch contexts
  const fxBgCtx = await esbuild.context({
    ...firefoxExtension,
    entryPoints: ["src/background/index.ts"],
    outfile: "dist/firefox/background.js",
  });
  const fxContentCtx = await esbuild.context({
    ...firefoxExtension,
    entryPoints: ["src/content/index.ts"],
    outfile: "dist/firefox/content.js",
  });

  // Chrome watch contexts
  const crBgCtx = await esbuild.context({
    ...chromeExtension,
    entryPoints: ["src/background/index.ts"],
    outfile: "dist/chrome/background.js",
    banner: chromeBanner,
  });
  const crContentCtx = await esbuild.context({
    ...chromeExtension,
    entryPoints: ["src/content/index.ts"],
    outfile: "dist/chrome/content.js",
    banner: chromeBanner,
  });

  // Node watch contexts
  const bridgeCtx = await esbuild.context({
    ...sharedNode,
    entryPoints: ["src/bridge/host.ts"],
    outfile: "dist/bridge.mjs",
    banner: { js: "#!/usr/bin/env node" },
  });
  const mcpCtx = await esbuild.context({
    ...sharedNode,
    entryPoints: ["src/mcp/server.ts"],
    outfile: "dist/mcp-server.mjs",
    banner: { js: "#!/usr/bin/env node" },
    external: mcpServerExternals,
  });
  const cliCtx = await esbuild.context({
    ...sharedNode,
    entryPoints: ["src/cli.ts"],
    outfile: "dist/cli.mjs",
    banner: { js: "#!/usr/bin/env node" },
    external: cliExternals,
  });

  await copyStatic();
  await Promise.all([
    fxBgCtx.watch(), fxContentCtx.watch(),
    crBgCtx.watch(), crContentCtx.watch(),
    bridgeCtx.watch(), mcpCtx.watch(), cliCtx.watch(),
  ]);
  console.log("Watching for changes (Firefox + Chrome)...");
} else {
  // One-shot build
  const polyfillBanner = await getChromePolyfillBanner();
  const chromeBanner = { js: polyfillBanner };

  await copyStatic();

  // Build extension for both browsers in parallel
  const firefoxBuild = runtimeOnly ? Promise.resolve() : buildExtension("firefox", firefoxExtension);
  const chromeBuild = buildExtension("chrome", chromeExtension, chromeBanner);
  const nodeBuild = buildNode();

  await Promise.all([firefoxBuild, chromeBuild, nodeBuild]);
}

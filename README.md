# Broc

Broc is a browser extension and MCP bridge for AI-driven browser control across Firefox, Chrome, and Chromium.

## Quick Start

```bash
npm install
npm run setup -- --browser=firefox
npm run launch -- --browser=firefox
```

`launch` opens the browser with the built extension loaded, starts the MCP server, and opens the requested URL in a fresh tab. When `--url` is omitted, it defaults to `https://www.google.com`.

## npm Scripts

The repo now keeps a small top-level script surface:

| Script | Purpose |
|--------|---------|
| `npm run dev` | Watch, launch the browser with the built extension, and start MCP |
| `npm test` | Run the test suite |
| `npm run build` | Produce production `dist/` artifacts |
| `npm run clean` | Remove repo build artifacts only |
| `npm run setup` | Build and prepare managed browser setup |
| `npm run launch` | Launch browser + MCP for normal use |

## Script Details

### `npm run dev`

- Defaults to Chrome.
- Starts `build.mjs --watch`.
- Launches the browser with the built extension loaded.
- Starts the MCP server.
- Restarts the launch session when watched `dist/` outputs change so the new extension code is actually loaded.

Examples:

```bash
npm run dev
npm run dev -- --browser=firefox
npm run dev -- --browser=chromium
```

### `npm test`

Runs `vitest` once.

Use watch mode by passing arguments through npm:

```bash
npm run test -- --watch
```

### `npm run build`

Builds all shared Node binaries plus both extension outputs into `dist/`.

### `npm run clean`

Default behavior:

- removes `dist/`
- keeps managed browser profiles, managed Chromium runtime, and setup state intact

Full cleanup:

```bash
npm run clean -- --all
```

`--all` performs best-effort managed cleanup through the CLI first, then removes repo artifacts.

### `npm run setup`

Primary install/setup path for users. It builds the repo, installs native messaging manifests, prepares managed profiles, and provisions the managed Chromium runtime when needed.

Examples:

```bash
npm run setup -- --browser=firefox
npm run setup -- --browser=chrome
```

### `npm run launch`

Primary runtime path for users. It launches the selected browser, waits for the bridge, opens the requested URL in a fresh tab, and starts MCP.

Examples:

```bash
npm run launch -- --browser=firefox
npm run launch -- --browser=chrome --url=https://example.com
npm run launch -- --browser=chromium --no-mcp
```

If the browser is running a stale extension worker, launch warns and falls back for that run instead of failing hard.

## Advanced Commands

These are still supported directly, but not exposed as top-level npm scripts:

```bash
node dist/cli.mjs status
node dist/cli.mjs teardown
node dist/cli.mjs uninstall --browser=chrome
npx tsc --noEmit
npx web-ext lint --source-dir dist/firefox
```

## Notes

- `npm run dev` defaults to Chrome.
- `npm run clean` is safe by default; use `--all` only when you want to remove managed state too.
- `setup` and `launch` remain npm scripts because they are the primary user-facing entry points.
- More detailed architecture and protocol docs live in [DOCS.md](./DOCS.md).

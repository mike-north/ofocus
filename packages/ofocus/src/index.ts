#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";

// Re-export everything from SDK
export * from "@ofocus/sdk";

// Layer 2 productivity niceties
export * from "@ofocus/productivity";

// Re-export CLI utilities
export { createCli, outputJson, outputHuman } from "@ofocus/cli";

// Re-export MCP server utilities
export { createServer, registerAllTools, formatResult } from "@ofocus/mcp";

// Run CLI when executed directly
import { createCli } from "@ofocus/cli";

// Only parse if this is the main module (CLI entry point), not when imported as
// a library. Global bins are installed as a SYMLINK
// (`.../bin/ofocus -> .../lib/node_modules/ofocus/dist/index.js`), so
// `process.argv[1]` is the symlink path while `import.meta.url` is the resolved
// real path. Resolve symlinks (realpathSync) before comparing — otherwise the
// guard is always false through a symlink and `ofocus <anything>` runs nothing.
const scriptPath = process.argv[1];
let isMainModule = false;
if (scriptPath !== undefined) {
  let realScriptPath: string;
  try {
    realScriptPath = realpathSync(scriptPath);
  } catch {
    realScriptPath = resolve(scriptPath);
  }
  isMainModule = pathToFileURL(realScriptPath).href === import.meta.url;
}
if (isMainModule) {
  createCli().parse();
}

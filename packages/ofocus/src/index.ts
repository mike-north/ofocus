#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Re-export everything from SDK
export * from "@ofocus/sdk";

// Re-export CLI utilities
export { createCli, outputJson, outputHuman } from "@ofocus/cli";

// Run CLI when executed directly
import { createCli } from "@ofocus/cli";

// Only parse if this is the main module (CLI entry point)
// Check if running as a script vs being imported as a module
const scriptPath = process.argv[1];
const isMainModule =
  scriptPath !== undefined &&
  pathToFileURL(resolve(scriptPath)).href === import.meta.url;
if (isMainModule) {
  createCli().parse();
}

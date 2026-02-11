#!/usr/bin/env node

// Re-export CLI utilities
export { createCli, outputJson, outputHuman } from "./cli.js";
export { output } from "./output.js";
export { commandRegistry } from "./commands/index.js";
export { listCommands } from "./commands/list-commands.js";

// Run CLI when executed directly
import { createCli } from "./cli.js";

// Only parse if this is the main module (CLI entry point)
// Check if running as a script vs being imported as a module
const scriptPath = process.argv[1];
const isMainModule = scriptPath !== undefined && import.meta.url === `file://${scriptPath}`;
if (isMainModule) {
  createCli().parse();
}

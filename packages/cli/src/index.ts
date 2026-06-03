#!/usr/bin/env node

import { isMainModule } from "@ofocus/sdk";

// Re-export CLI utilities
export { createCli, outputJson, outputHuman } from "./cli.js";
export { output, outputToon, type OutputFormat } from "./output.js";
export { commandRegistry } from "./commands/index.js";
export { listCommands } from "./commands/list-commands.js";

// Run CLI when executed directly (incl. through a symlinked global bin), not
// when imported as a library.
import { createCli } from "./cli.js";

if (isMainModule(import.meta.url)) {
  createCli().parse();
}

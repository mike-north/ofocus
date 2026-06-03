#!/usr/bin/env node

import { isMainModule } from "@ofocus/sdk";

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
// a library. `isMainModule` resolves symlinks so the CLI runs through a
// symlinked global bin (see @ofocus/sdk).
if (isMainModule(import.meta.url)) {
  createCli().parse();
}

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
import { createCli, readPackageVersion } from "@ofocus/cli";

// Only parse if this is the main module (CLI entry point), not when imported as
// a library. `isMainModule` resolves symlinks so the CLI runs through a
// symlinked global bin (see @ofocus/sdk).
if (isMainModule(import.meta.url)) {
  // Report the umbrella `ofocus` package version (what the user installs),
  // sourced from this package's own package.json rather than a literal.
  createCli(readPackageVersion(import.meta.url)).parse();
}

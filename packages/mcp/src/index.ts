#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { resolve, dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
  version: string;
};
const VERSION = packageJson.version;

// Re-export for programmatic use
export { registerAllTools } from "./tools/index.js";
export { formatResult } from "./utils.js";

/**
 * Create and configure a new MCP server instance.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "ofocus",
    version: VERSION,
  });
  registerAllTools(server);
  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OFocus MCP server running on stdio");
}

// Only run when executed directly, not when imported as a module
const scriptPath = process.argv[1];
const isMainModule =
  scriptPath !== undefined &&
  pathToFileURL(resolve(scriptPath)).href === import.meta.url;

if (isMainModule) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Fatal error:", message);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

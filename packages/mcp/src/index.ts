#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

// Re-export for programmatic use
export { registerAllTools } from "./tools/index.js";
export { formatResult } from "./utils.js";

/**
 * Create and configure a new MCP server instance.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "ofocus",
    version: "0.1.0",
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

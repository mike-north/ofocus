import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskTools } from "./tasks.js";
import { registerProjectTools } from "./projects.js";
import { registerTagTools } from "./tags.js";
import { registerFolderTools } from "./folders.js";
import { registerAdvancedTools } from "./advanced.js";

/**
 * Register all OFocus MCP tools with the server.
 */
export function registerAllTools(server: McpServer): void {
  registerTaskTools(server);
  registerProjectTools(server);
  registerTagTools(server);
  registerFolderTools(server);
  registerAdvancedTools(server);
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { productivityDescriptors } from "@ofocus/productivity";
import { registerMcpTool } from "../registry-adapter.js";

/** Register every Layer-2 productivity command as an MCP tool. */
export function registerProductivityTools(server: McpServer): void {
  for (const descriptor of productivityDescriptors) {
    registerMcpTool(server, descriptor);
  }
}

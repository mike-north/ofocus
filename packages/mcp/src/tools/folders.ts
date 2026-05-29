import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listFoldersDescriptor,
  createFolderDescriptor,
  updateFolderDescriptor,
  deleteFolderDescriptor,
} from "@ofocus/sdk";
import { registerMcpTool } from "../registry-adapter.js";

export function registerFolderTools(server: McpServer): void {
  // folders_list — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, listFoldersDescriptor);

  // folder_create — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, createFolderDescriptor);

  // folder_update — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, updateFolderDescriptor);

  // folder_delete — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, deleteFolderDescriptor);
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listTagsDescriptor,
  createTagDescriptor,
  updateTagDescriptor,
  deleteTagDescriptor,
} from "@ofocus/sdk";
import { registerMcpTool } from "../registry-adapter.js";

export function registerTagTools(server: McpServer): void {
  // tags_list — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, listTagsDescriptor);

  // tag_create — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, createTagDescriptor);

  // tag_update — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, updateTagDescriptor);

  // tag_delete — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, deleteTagDescriptor);
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  addToInboxDescriptor,
  completeTaskDescriptor,
  dropTaskDescriptor,
  deleteTaskDescriptor,
  duplicateTaskDescriptor,
  searchTasksDescriptor,
  completeTasksDescriptor,
  updateTasksDescriptor,
  deleteTasksDescriptor,
  deferTaskDescriptor,
  deferTasksDescriptor,
  applyRepetitionRuleDescriptor,
  clearRepetitionRuleDescriptor,
  openItemDescriptor,
  // Batch 7: task stragglers
  queryTasksDescriptor,
  updateTaskDescriptor,
} from "@ofocus/sdk";
import { registerMcpTool } from "../registry-adapter.js";

export function registerTaskTools(server: McpServer): void {
  // inbox_add — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, addToInboxDescriptor);

  // tasks_list — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, queryTasksDescriptor);

  // task_complete — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, completeTaskDescriptor);

  // task_update — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, updateTaskDescriptor);

  // task_drop / task_delete — registered from centralized descriptors
  registerMcpTool(server, dropTaskDescriptor);
  registerMcpTool(server, deleteTaskDescriptor);

  // search — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, searchTasksDescriptor);

  // task_defer + batch operations — registered from the centralized
  // descriptors in @ofocus/sdk.
  registerMcpTool(server, deferTaskDescriptor);
  registerMcpTool(server, completeTasksDescriptor);
  registerMcpTool(server, updateTasksDescriptor);
  registerMcpTool(server, deleteTasksDescriptor);
  registerMcpTool(server, deferTasksDescriptor);

  // task_duplicate — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, duplicateTaskDescriptor);

  // task_apply_repetition / task_clear_repetition — registered from the
  // centralized descriptors in @ofocus/sdk.
  registerMcpTool(server, applyRepetitionRuleDescriptor);
  registerMcpTool(server, clearRepetitionRuleDescriptor);

  // open — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, openItemDescriptor);
}

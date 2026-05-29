import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createSubtaskDescriptor,
  querySubtasksDescriptor,
  moveTaskToParentDescriptor,
  queryForecastDescriptor,
  queryDeferredDescriptor,
  quickCaptureDescriptor,
  getStats,
  evaluateScriptDescriptor,
  // Batch 6: Advanced command descriptors
  listPerspectivesDescriptor,
  queryPerspectiveDescriptor,
  focusOnDescriptor,
  unfocusDescriptor,
  getFocusedDescriptor,
  getSyncStatusDescriptor,
  triggerSyncDescriptor,
  saveTemplateDescriptor,
  listTemplatesDescriptor,
  getTemplateDescriptor,
  createFromTemplateDescriptor,
  deleteTemplateDescriptor,
  addAttachmentDescriptor,
  listAttachmentsDescriptor,
  removeAttachmentDescriptor,
  archiveTasksDescriptor,
  compactDatabaseDescriptor,
  exportTaskPaperDescriptor,
  importTaskPaperDescriptor,
  generateUrlDescriptor,
} from "@ofocus/sdk";
import { formatResult } from "../utils.js";
import { registerMcpTool } from "../registry-adapter.js";

export function registerAdvancedTools(server: McpServer): void {
  // Subtasks — registered from centralized descriptors in @ofocus/sdk
  registerMcpTool(server, createSubtaskDescriptor);
  registerMcpTool(server, querySubtasksDescriptor);
  registerMcpTool(server, moveTaskToParentDescriptor);

  // Perspectives — registered from centralized descriptors in @ofocus/sdk
  registerMcpTool(server, listPerspectivesDescriptor);
  registerMcpTool(server, queryPerspectiveDescriptor);

  // forecast — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, queryForecastDescriptor);

  // Focus — registered from centralized descriptors in @ofocus/sdk
  registerMcpTool(server, focusOnDescriptor);
  registerMcpTool(server, unfocusDescriptor);
  registerMcpTool(server, getFocusedDescriptor);

  // deferred_list — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, queryDeferredDescriptor);

  // quick_add — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, quickCaptureDescriptor);

  // Statistics
  server.registerTool(
    "stats",
    {
      description: "Get productivity statistics from OmniFocus",
      inputSchema: {
        period: z
          .enum(["day", "week", "month", "year"])
          .optional()
          .describe("Time period for statistics"),
        project: z.string().optional().describe("Filter by project name"),
        since: z.string().optional().describe("Start date for custom period"),
        until: z.string().optional().describe("End date for custom period"),
      },
    },
    async (params) => {
      const result = await getStats({
        period: params.period,
        project: params.project,
        since: params.since,
        until: params.until,
      });
      return formatResult(result);
    }
  );

  // Sync — registered from centralized descriptors in @ofocus/sdk
  registerMcpTool(server, getSyncStatusDescriptor);
  registerMcpTool(server, triggerSyncDescriptor);

  // Templates — registered from centralized descriptors in @ofocus/sdk
  registerMcpTool(server, saveTemplateDescriptor);
  registerMcpTool(server, listTemplatesDescriptor);
  registerMcpTool(server, getTemplateDescriptor);
  registerMcpTool(server, createFromTemplateDescriptor);
  registerMcpTool(server, deleteTemplateDescriptor);

  // Attachments — registered from centralized descriptors in @ofocus/sdk
  registerMcpTool(server, addAttachmentDescriptor);
  registerMcpTool(server, listAttachmentsDescriptor);
  registerMcpTool(server, removeAttachmentDescriptor);

  // Archive — registered from centralized descriptors in @ofocus/sdk
  registerMcpTool(server, archiveTasksDescriptor);
  registerMcpTool(server, compactDatabaseDescriptor);

  // TaskPaper import/export — registered from centralized descriptors in @ofocus/sdk
  registerMcpTool(server, exportTaskPaperDescriptor);
  registerMcpTool(server, importTaskPaperDescriptor);

  // URL generation — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, generateUrlDescriptor);

  // Eval escape hatch — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, evaluateScriptDescriptor);
}

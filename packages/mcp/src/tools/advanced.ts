import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createSubtask,
  querySubtasks,
  moveTaskToParent,
  listPerspectives,
  queryPerspective,
  queryForecast,
  focus,
  unfocus,
  getFocused,
  queryDeferred,
  quickCapture,
  getStats,
  getSyncStatus,
  triggerSync,
  saveTemplate,
  listTemplates,
  getTemplate,
  createFromTemplate,
  deleteTemplate,
  addAttachment,
  listAttachments,
  removeAttachment,
  archiveTasks,
  compactDatabase,
  exportTaskPaper,
  importTaskPaper,
  generateUrl,
} from "@ofocus/sdk";
import { formatResult } from "../utils.js";

export function registerAdvancedTools(server: McpServer): void {
  // Subtasks
  server.registerTool(
    "subtask_create",
    {
      description: "Create a subtask under an existing task",
      inputSchema: {
        parentTaskId: z.string().describe("ID of the parent task"),
        title: z.string().describe("Subtask title"),
        note: z.string().optional().describe("Subtask note"),
        due: z.string().optional().describe("Due date"),
        defer: z.string().optional().describe("Defer date"),
        flag: z.boolean().optional().describe("Flag the subtask"),
        tags: z.array(z.string()).optional().describe("Tags to apply"),
        estimatedMinutes: z.number().optional().describe("Estimated duration"),
      },
    },
    async (params) => {
      const result = await createSubtask(params.parentTaskId, params.title, {
        note: params.note,
        due: params.due,
        defer: params.defer,
        flag: params.flag,
        tags: params.tags,
        estimatedMinutes: params.estimatedMinutes,
      });
      return formatResult(result);
    }
  );

  server.registerTool(
    "subtasks_list",
    {
      description: "List subtasks of a parent task",
      inputSchema: {
        parentTaskId: z.string().describe("ID of the parent task"),
        completed: z
          .boolean()
          .optional()
          .describe("Include completed subtasks"),
        flagged: z.boolean().optional().describe("Filter by flagged status"),
      },
    },
    async (params) => {
      const result = await querySubtasks(params.parentTaskId, {
        completed: params.completed,
        flagged: params.flagged,
      });
      return formatResult(result);
    }
  );

  server.registerTool(
    "task_move",
    {
      description: "Move a task to a new parent task (make it a subtask)",
      inputSchema: {
        taskId: z.string().describe("ID of the task to move"),
        newParentId: z.string().describe("ID of the new parent task"),
      },
    },
    async (params) => {
      const result = await moveTaskToParent(params.taskId, params.newParentId);
      return formatResult(result);
    }
  );

  // Perspectives
  server.registerTool(
    "perspectives_list",
    {
      description: "List all perspectives in OmniFocus",
      inputSchema: {},
    },
    async () => {
      const result = await listPerspectives();
      return formatResult(result);
    }
  );

  server.registerTool(
    "perspective_query",
    {
      description: "Query tasks from a specific perspective",
      inputSchema: {
        name: z.string().describe("Perspective name"),
        limit: z.number().optional().describe("Maximum results to return"),
      },
    },
    async (params) => {
      const result = await queryPerspective(params.name, {
        limit: params.limit,
      });
      return formatResult(result);
    }
  );

  // Forecast
  server.registerTool(
    "forecast",
    {
      description: "Query tasks by date range (forecast view)",
      inputSchema: {
        start: z.string().optional().describe("Start date (defaults to today)"),
        end: z.string().optional().describe("End date"),
        days: z
          .number()
          .optional()
          .describe(
            "Number of days from start (alternative to end, default: 7)"
          ),
        includeDeferred: z
          .boolean()
          .optional()
          .describe("Include tasks deferred to the date range"),
      },
    },
    async (params) => {
      const result = await queryForecast({
        start: params.start,
        end: params.end,
        days: params.days,
        includeDeferred: params.includeDeferred,
      });
      return formatResult(result);
    }
  );

  // Focus
  server.registerTool(
    "focus_set",
    {
      description: "Focus on a specific project or folder by name or ID",
      inputSchema: {
        target: z.string().describe("Project or folder name or ID to focus on"),
        byId: z
          .boolean()
          .optional()
          .describe("If true, treat target as an ID instead of a name"),
      },
    },
    async (params) => {
      const result = await focus(params.target, { byId: params.byId });
      return formatResult(result);
    }
  );

  server.registerTool(
    "focus_clear",
    {
      description: "Clear the current focus in OmniFocus",
      inputSchema: {},
    },
    async () => {
      const result = await unfocus();
      return formatResult(result);
    }
  );

  server.registerTool(
    "focus_get",
    {
      description: "Get the currently focused project or folder",
      inputSchema: {},
    },
    async () => {
      const result = await getFocused();
      return formatResult(result);
    }
  );

  // Deferred
  server.registerTool(
    "deferred_list",
    {
      description: "List deferred tasks",
      inputSchema: {
        deferredAfter: z
          .string()
          .optional()
          .describe("Include tasks deferred until after this date"),
        deferredBefore: z
          .string()
          .optional()
          .describe("Include tasks deferred until before this date"),
        blockedOnly: z
          .boolean()
          .optional()
          .describe("Only show tasks currently blocked by defer date"),
      },
    },
    async (params) => {
      const result = await queryDeferred({
        deferredAfter: params.deferredAfter,
        deferredBefore: params.deferredBefore,
        blockedOnly: params.blockedOnly,
      });
      return formatResult(result);
    }
  );

  // Quick capture
  server.registerTool(
    "quick_add",
    {
      description: "Add a task using natural language quick entry syntax",
      inputSchema: {
        input: z
          .string()
          .describe(
            "Natural language input (e.g., 'Buy milk @errands #shopping ::tomorrow')"
          ),
        note: z.string().optional().describe("Additional note text to add"),
      },
    },
    async (params) => {
      const result = await quickCapture(params.input, {
        note: params.note,
      });
      return formatResult(result);
    }
  );

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

  // Sync
  server.registerTool(
    "sync_status",
    {
      description: "Get the current sync status of OmniFocus",
      inputSchema: {},
    },
    async () => {
      const result = await getSyncStatus();
      return formatResult(result);
    }
  );

  server.registerTool(
    "sync_trigger",
    {
      description: "Trigger a sync in OmniFocus",
      inputSchema: {},
    },
    async () => {
      const result = await triggerSync();
      return formatResult(result);
    }
  );

  // Templates
  server.registerTool(
    "template_save",
    {
      description: "Save a project as a reusable template",
      inputSchema: {
        name: z.string().describe("Name for the template"),
        sourceProject: z
          .string()
          .describe("Project ID or name to save as template"),
        description: z.string().optional().describe("Template description"),
      },
    },
    async (params) => {
      const result = await saveTemplate({
        name: params.name,
        sourceProject: params.sourceProject,
        description: params.description,
      });
      return formatResult(result);
    }
  );

  server.registerTool(
    "templates_list",
    {
      description: "List all saved templates",
      inputSchema: {},
    },
    () => {
      const result = listTemplates();
      return formatResult(result);
    }
  );

  server.registerTool(
    "template_get",
    {
      description: "Get details of a specific template",
      inputSchema: {
        templateName: z.string().describe("Name of the template"),
      },
    },
    (params) => {
      const result = getTemplate(params.templateName);
      return formatResult(result);
    }
  );

  server.registerTool(
    "template_create_project",
    {
      description: "Create a new project from a template",
      inputSchema: {
        templateName: z.string().describe("Name of the template to use"),
        projectName: z.string().optional().describe("Name for the new project"),
        folder: z.string().optional().describe("Folder to create project in"),
        baseDate: z
          .string()
          .optional()
          .describe("Base date for calculating offsets (defaults to today)"),
      },
    },
    async (params) => {
      const result = await createFromTemplate({
        templateName: params.templateName,
        projectName: params.projectName,
        folder: params.folder,
        baseDate: params.baseDate,
      });
      return formatResult(result);
    }
  );

  server.registerTool(
    "template_delete",
    {
      description: "Delete a saved template",
      inputSchema: {
        templateName: z.string().describe("Name of the template to delete"),
      },
    },
    (params) => {
      const result = deleteTemplate(params.templateName);
      return formatResult(result);
    }
  );

  // Attachments
  server.registerTool(
    "attachment_add",
    {
      description: "Add an attachment to a task",
      inputSchema: {
        taskId: z.string().describe("ID of the task"),
        filePath: z.string().describe("Path to the file to attach"),
      },
    },
    async (params) => {
      const result = await addAttachment(params.taskId, params.filePath);
      return formatResult(result);
    }
  );

  server.registerTool(
    "attachments_list",
    {
      description: "List attachments on a task",
      inputSchema: {
        taskId: z.string().describe("ID of the task"),
      },
    },
    async (params) => {
      const result = await listAttachments(params.taskId);
      return formatResult(result);
    }
  );

  server.registerTool(
    "attachment_remove",
    {
      description: "Remove an attachment from a task",
      inputSchema: {
        taskId: z.string().describe("ID of the task"),
        attachmentName: z.string().describe("Name of the attachment to remove"),
      },
    },
    async (params) => {
      const result = await removeAttachment(
        params.taskId,
        params.attachmentName
      );
      return formatResult(result);
    }
  );

  // Archive
  server.registerTool(
    "archive",
    {
      description: "Archive completed tasks",
      inputSchema: {
        completedBefore: z
          .string()
          .optional()
          .describe("Archive tasks completed before this date"),
        droppedBefore: z
          .string()
          .optional()
          .describe("Archive tasks dropped before this date"),
        project: z
          .string()
          .optional()
          .describe("Archive only from this project"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview what would be archived without archiving"),
      },
    },
    async (params) => {
      const result = await archiveTasks({
        completedBefore: params.completedBefore,
        droppedBefore: params.droppedBefore,
        project: params.project,
        dryRun: params.dryRun,
      });
      return formatResult(result);
    }
  );

  server.registerTool(
    "compact_database",
    {
      description: "Compact the OmniFocus database",
      inputSchema: {},
    },
    async () => {
      const result = await compactDatabase();
      return formatResult(result);
    }
  );

  // TaskPaper import/export
  server.registerTool(
    "export_taskpaper",
    {
      description: "Export tasks/projects to TaskPaper format",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe("Export specific project by name"),
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Include completed tasks"),
        includeDropped: z
          .boolean()
          .optional()
          .describe("Include dropped tasks"),
      },
    },
    async (params) => {
      const result = await exportTaskPaper({
        project: params.project,
        includeCompleted: params.includeCompleted,
        includeDropped: params.includeDropped,
      });
      return formatResult(result);
    }
  );

  server.registerTool(
    "import_taskpaper",
    {
      description: "Import tasks from TaskPaper format",
      inputSchema: {
        content: z.string().describe("TaskPaper formatted content"),
        defaultProject: z
          .string()
          .optional()
          .describe("Target project for tasks without a project"),
        createProjects: z
          .boolean()
          .optional()
          .describe("Whether to create projects that do not exist"),
      },
    },
    async (params) => {
      const result = await importTaskPaper(params.content, {
        defaultProject: params.defaultProject,
        createProjects: params.createProjects,
      });
      return formatResult(result);
    }
  );

  // URL generation
  server.registerTool(
    "generate_url",
    {
      description:
        "Generate an OmniFocus URL scheme link for a task, project, folder, or tag",
      inputSchema: {
        id: z.string().describe("ID of the task, project, folder, or tag"),
      },
    },
    async (params) => {
      const result = await generateUrl(params.id);
      return formatResult(result);
    }
  );
}

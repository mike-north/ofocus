import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
  queryTasks,
  updateTask,
  openItem,
} from "@ofocus/sdk";
import { formatResult } from "../utils.js";
import { registerMcpTool } from "../registry-adapter.js";

const RepetitionRuleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1),
  repeatMethod: z.enum(["due-again", "defer-another"]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
});

export function registerTaskTools(server: McpServer): void {
  // inbox_add — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, addToInboxDescriptor);

  // tasks_list - Query tasks with filters
  server.registerTool(
    "tasks_list",
    {
      description: "List and filter tasks from OmniFocus",
      inputSchema: {
        project: z.string().optional().describe("Filter by project name or ID"),
        tag: z.string().optional().describe("Filter by tag name"),
        dueBefore: z
          .string()
          .optional()
          .describe("Filter tasks due before this date"),
        dueAfter: z
          .string()
          .optional()
          .describe("Filter tasks due after this date"),
        flagged: z.boolean().optional().describe("Filter by flagged status"),
        completed: z.boolean().optional().describe("Include completed tasks"),
        available: z
          .boolean()
          .optional()
          .describe("Only show available (actionable) tasks"),
      },
    },
    async (params) => {
      const result = await queryTasks({
        project: params.project,
        tag: params.tag,
        dueBefore: params.dueBefore,
        dueAfter: params.dueAfter,
        flagged: params.flagged,
        completed: params.completed,
        available: params.available,
      });
      return formatResult(result);
    }
  );

  // task_complete — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, completeTaskDescriptor);

  // task_update - Update task properties
  server.registerTool(
    "task_update",
    {
      description: "Update properties of an existing task",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to update"),
        title: z.string().optional().describe("New task title"),
        note: z.string().optional().describe("New task note"),
        due: z.string().optional().describe("New due date"),
        defer: z.string().optional().describe("New defer date"),
        flag: z.boolean().optional().describe("Flag or unflag the task"),
        project: z.string().optional().describe("Move to project (name or ID)"),
        tags: z.array(z.string()).optional().describe("Replace tags"),
        estimatedMinutes: z
          .number()
          .optional()
          .describe("Estimated duration in minutes"),
        clearEstimate: z
          .boolean()
          .optional()
          .describe("Clear the estimated duration"),
        repeat: RepetitionRuleSchema.optional().describe("Set repetition rule"),
        clearRepeat: z.boolean().optional().describe("Clear repetition rule"),
      },
    },
    async (params) => {
      const result = await updateTask(params.taskId, {
        title: params.title,
        note: params.note,
        due: params.due,
        defer: params.defer,
        flag: params.flag,
        project: params.project,
        tags: params.tags,
        estimatedMinutes: params.estimatedMinutes,
        clearEstimate: params.clearEstimate,
        repeat: params.repeat,
        clearRepeat: params.clearRepeat,
      });
      return formatResult(result);
    }
  );

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

  // open - Open an item in OmniFocus UI
  server.registerTool(
    "open",
    {
      description:
        "Open an item in the OmniFocus user interface (task, project, folder, or tag)",
      inputSchema: {
        id: z
          .string()
          .describe("The ID of the item to open (auto-detects type)"),
      },
    },
    async (params) => {
      const result = await openItem(params.id);
      return formatResult(result);
    }
  );
}

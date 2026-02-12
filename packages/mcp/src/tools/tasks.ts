import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addToInbox,
  queryTasks,
  completeTask,
  updateTask,
  dropTask,
  deleteTask,
  searchTasks,
  completeTasks,
  updateTasks,
  deleteTasks,
  deferTask,
  deferTasks,
} from "@ofocus/sdk";
import { formatResult } from "../utils.js";

const RepetitionRuleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1),
  repeatMethod: z.enum(["due-again", "defer-another"]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
});

export function registerTaskTools(server: McpServer): void {
  // inbox_add - Add a task to inbox
  server.registerTool(
    "inbox_add",
    {
      description: "Add a new task to the OmniFocus inbox",
      inputSchema: {
        title: z.string().describe("Task title"),
        note: z.string().optional().describe("Task note/description"),
        due: z
          .string()
          .optional()
          .describe(
            "Due date (ISO format or natural language like 'tomorrow')"
          ),
        defer: z
          .string()
          .optional()
          .describe("Defer date (ISO format or natural language)"),
        flag: z.boolean().optional().describe("Flag the task"),
        tags: z.array(z.string()).optional().describe("Tags to apply"),
        estimatedMinutes: z
          .number()
          .optional()
          .describe("Estimated duration in minutes"),
        repeat: RepetitionRuleSchema.optional().describe("Repetition rule"),
      },
    },
    async (params) => {
      const result = await addToInbox(params.title, {
        note: params.note,
        due: params.due,
        defer: params.defer,
        flag: params.flag,
        tags: params.tags,
        estimatedMinutes: params.estimatedMinutes,
        repeat: params.repeat,
      });
      return formatResult(result);
    }
  );

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

  // task_complete - Mark a task as complete
  server.registerTool(
    "task_complete",
    {
      description: "Mark a task as complete in OmniFocus",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to complete"),
      },
    },
    async (params) => {
      const result = await completeTask(params.taskId);
      return formatResult(result);
    }
  );

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

  // task_drop - Drop a task
  server.registerTool(
    "task_drop",
    {
      description: "Drop (cancel) a task in OmniFocus",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to drop"),
      },
    },
    async (params) => {
      const result = await dropTask(params.taskId);
      return formatResult(result);
    }
  );

  // task_delete - Delete a task permanently
  server.registerTool(
    "task_delete",
    {
      description: "Permanently delete a task from OmniFocus",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to delete"),
      },
    },
    async (params) => {
      const result = await deleteTask(params.taskId);
      return formatResult(result);
    }
  );

  // search - Search tasks by text
  server.registerTool(
    "search",
    {
      description: "Search tasks by text in OmniFocus",
      inputSchema: {
        query: z.string().describe("Search query text"),
        scope: z
          .enum(["name", "note", "both"])
          .optional()
          .describe("Where to search (default: both)"),
        limit: z.number().optional().describe("Maximum results to return"),
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Include completed tasks in search"),
      },
    },
    async (params) => {
      const result = await searchTasks(params.query, {
        scope: params.scope,
        limit: params.limit,
        includeCompleted: params.includeCompleted,
      });
      return formatResult(result);
    }
  );

  // task_defer - Defer a single task
  server.registerTool(
    "task_defer",
    {
      description: "Defer a task to a later date",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to defer"),
        days: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Defer for this many days from today"),
        to: z.string().optional().describe("Defer to a specific date"),
      },
    },
    async (params) => {
      const result = await deferTask(params.taskId, {
        days: params.days,
        to: params.to,
      });
      return formatResult(result);
    }
  );

  // Batch operations
  server.registerTool(
    "tasks_complete_batch",
    {
      description: "Complete multiple tasks at once",
      inputSchema: {
        taskIds: z.array(z.string()).describe("Array of task IDs to complete"),
      },
    },
    async (params) => {
      const result = await completeTasks(params.taskIds);
      return formatResult(result);
    }
  );

  server.registerTool(
    "tasks_update_batch",
    {
      description: "Update multiple tasks with the same properties",
      inputSchema: {
        taskIds: z.array(z.string()).describe("Array of task IDs to update"),
        title: z.string().optional().describe("New title for all tasks"),
        note: z.string().optional().describe("New note for all tasks"),
        due: z.string().optional().describe("New due date for all tasks"),
        defer: z.string().optional().describe("New defer date for all tasks"),
        flag: z.boolean().optional().describe("Flag or unflag all tasks"),
        project: z
          .string()
          .optional()
          .describe("Move all tasks to this project"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replace tags on all tasks"),
        estimatedMinutes: z
          .number()
          .optional()
          .describe("Estimated duration for all tasks"),
      },
    },
    async (params) => {
      const result = await updateTasks(params.taskIds, {
        title: params.title,
        note: params.note,
        due: params.due,
        defer: params.defer,
        flag: params.flag,
        project: params.project,
        tags: params.tags,
        estimatedMinutes: params.estimatedMinutes,
      });
      return formatResult(result);
    }
  );

  server.registerTool(
    "tasks_delete_batch",
    {
      description: "Delete multiple tasks at once",
      inputSchema: {
        taskIds: z.array(z.string()).describe("Array of task IDs to delete"),
      },
    },
    async (params) => {
      const result = await deleteTasks(params.taskIds);
      return formatResult(result);
    }
  );

  server.registerTool(
    "tasks_defer_batch",
    {
      description: "Defer multiple tasks to the same date",
      inputSchema: {
        taskIds: z.array(z.string()).describe("Array of task IDs to defer"),
        days: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Defer for this many days from today"),
        to: z.string().optional().describe("Defer to a specific date"),
      },
    },
    async (params) => {
      const result = await deferTasks(params.taskIds, {
        days: params.days,
        to: params.to,
      });
      return formatResult(result);
    }
  );
}

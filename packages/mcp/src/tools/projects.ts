import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  queryProjects,
  createProject,
  reviewProject,
  queryProjectsForReview,
  updateProject,
  deleteProject,
  dropProject,
  getReviewInterval,
  setReviewInterval,
} from "@ofocus/sdk";
import { formatResult } from "../utils.js";

export function registerProjectTools(server: McpServer): void {
  // projects_list - Query projects with filters
  server.registerTool(
    "projects_list",
    {
      description: "List and filter projects from OmniFocus",
      inputSchema: {
        folder: z.string().optional().describe("Filter by folder name or ID"),
        status: z
          .enum(["active", "on-hold", "completed", "dropped"])
          .optional()
          .describe("Filter by project status"),
        sequential: z
          .boolean()
          .optional()
          .describe("Filter by sequential/parallel type"),
      },
    },
    async (params) => {
      const result = await queryProjects({
        folder: params.folder,
        status: params.status,
        sequential: params.sequential,
      });
      return formatResult(result);
    }
  );

  // project_create - Create a new project
  server.registerTool(
    "project_create",
    {
      description: "Create a new project in OmniFocus",
      inputSchema: {
        name: z.string().describe("Project name"),
        note: z.string().optional().describe("Project note/description"),
        folderId: z.string().optional().describe("Parent folder ID"),
        folderName: z.string().optional().describe("Parent folder name"),
        sequential: z
          .boolean()
          .optional()
          .describe("Whether tasks are sequential (default: false)"),
        status: z
          .enum(["active", "on-hold"])
          .optional()
          .describe("Initial project status"),
        dueDate: z.string().optional().describe("Project due date"),
        deferDate: z.string().optional().describe("Project defer date"),
      },
    },
    async (params) => {
      const result = await createProject(params.name, {
        note: params.note,
        folderId: params.folderId,
        folderName: params.folderName,
        sequential: params.sequential,
        status: params.status,
        dueDate: params.dueDate,
        deferDate: params.deferDate,
      });
      return formatResult(result);
    }
  );

  // project_review - Mark a project as reviewed
  server.registerTool(
    "project_review",
    {
      description: "Mark a project as reviewed in OmniFocus",
      inputSchema: {
        projectId: z.string().describe("The ID of the project to review"),
      },
    },
    async (params) => {
      const result = await reviewProject(params.projectId);
      return formatResult(result);
    }
  );

  // projects_for_review - Get projects that need review
  server.registerTool(
    "projects_for_review",
    {
      description: "Get projects that are due for review",
      inputSchema: {},
    },
    async () => {
      const result = await queryProjectsForReview();
      return formatResult(result);
    }
  );

  // project_update - Update project properties
  server.registerTool(
    "project_update",
    {
      description: "Update properties of an existing project",
      inputSchema: {
        projectId: z.string().describe("The ID of the project to update"),
        name: z.string().optional().describe("New project name"),
        note: z.string().optional().describe("New project note"),
        status: z
          .enum(["active", "on-hold", "completed", "dropped"])
          .optional()
          .describe("New project status"),
        folderId: z.string().optional().describe("Move to folder by ID"),
        folderName: z.string().optional().describe("Move to folder by name"),
        sequential: z
          .boolean()
          .optional()
          .describe("Make project sequential (true) or parallel (false)"),
        dueDate: z
          .string()
          .optional()
          .describe("New due date (empty string to clear)"),
        deferDate: z
          .string()
          .optional()
          .describe("New defer date (empty string to clear)"),
      },
    },
    async (params) => {
      const result = await updateProject(params.projectId, {
        name: params.name,
        note: params.note,
        status: params.status,
        folderId: params.folderId,
        folderName: params.folderName,
        sequential: params.sequential,
        dueDate: params.dueDate,
        deferDate: params.deferDate,
      });
      return formatResult(result);
    }
  );

  // project_delete - Delete a project permanently
  server.registerTool(
    "project_delete",
    {
      description: "Permanently delete a project from OmniFocus",
      inputSchema: {
        projectId: z.string().describe("The ID of the project to delete"),
      },
    },
    async (params) => {
      const result = await deleteProject(params.projectId);
      return formatResult(result);
    }
  );

  // project_drop - Drop a project
  server.registerTool(
    "project_drop",
    {
      description: "Drop (cancel) a project in OmniFocus",
      inputSchema: {
        projectId: z.string().describe("The ID of the project to drop"),
      },
    },
    async (params) => {
      const result = await dropProject(params.projectId);
      return formatResult(result);
    }
  );

  // project_review_interval_get - Get review interval
  server.registerTool(
    "project_review_interval_get",
    {
      description: "Get the review interval for a project in days",
      inputSchema: {
        projectId: z.string().describe("The ID of the project"),
      },
    },
    async (params) => {
      const result = await getReviewInterval(params.projectId);
      return formatResult(result);
    }
  );

  // project_review_interval_set - Set review interval
  server.registerTool(
    "project_review_interval_set",
    {
      description: "Set the review interval for a project in days",
      inputSchema: {
        projectId: z.string().describe("The ID of the project"),
        intervalDays: z
          .number()
          .int()
          .min(1)
          .describe("Review interval in days"),
      },
    },
    async (params) => {
      const result = await setReviewInterval(
        params.projectId,
        params.intervalDays
      );
      return formatResult(result);
    }
  );
}

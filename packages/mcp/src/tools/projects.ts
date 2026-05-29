import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listProjectsDescriptor,
  createProjectDescriptor,
  updateProjectDescriptor,
  deleteProjectDescriptor,
  reviewProject,
  queryProjectsForReview,
  dropProject,
  getReviewInterval,
  setReviewInterval,
} from "@ofocus/sdk";
import { z } from "zod";
import { formatResult } from "../utils.js";
import { registerMcpTool } from "../registry-adapter.js";

export function registerProjectTools(server: McpServer): void {
  // projects_list — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, listProjectsDescriptor);

  // project_create — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, createProjectDescriptor);

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

  // project_update — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, updateProjectDescriptor);

  // project_delete — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, deleteProjectDescriptor);

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

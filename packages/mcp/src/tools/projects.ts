import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listProjectsDescriptor,
  createProjectDescriptor,
  updateProjectDescriptor,
  deleteProjectDescriptor,
  reviewProjectDescriptor,
  queryProjectsForReviewDescriptor,
  getReviewIntervalDescriptor,
  setReviewIntervalDescriptor,
  dropProject,
} from "@ofocus/sdk";
import { formatResult } from "../utils.js";
import { registerMcpTool } from "../registry-adapter.js";

export function registerProjectTools(server: McpServer): void {
  // projects_list — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, listProjectsDescriptor);

  // project_create — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, createProjectDescriptor);

  // project_review — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, reviewProjectDescriptor);

  // projects_for_review — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, queryProjectsForReviewDescriptor);

  // project_update — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, updateProjectDescriptor);

  // project_delete — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, deleteProjectDescriptor);

  // project_drop - Drop a project (no descriptor yet; kept hand-wired)
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

  // project_review_interval_get — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, getReviewIntervalDescriptor);

  // project_review_interval_set — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, setReviewIntervalDescriptor);
}

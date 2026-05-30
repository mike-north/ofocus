import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listProjectsDescriptor,
  createProjectDescriptor,
  updateProjectDescriptor,
  deleteProjectDescriptor,
  dropProjectDescriptor,
  reviewProjectDescriptor,
  queryProjectsForReviewDescriptor,
  getReviewIntervalDescriptor,
  setReviewIntervalDescriptor,
} from "@ofocus/sdk";
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

  // project_drop — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, dropProjectDescriptor);

  // project_review_interval_get — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, getReviewIntervalDescriptor);

  // project_review_interval_set — registered from the centralized descriptor in @ofocus/sdk
  registerMcpTool(server, setReviewIntervalDescriptor);
}

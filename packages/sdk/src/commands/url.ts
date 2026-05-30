import { z } from "zod";
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

/**
 * Result from URL generation.
 */
export interface UrlResult {
  id: string;
  type: "task" | "project" | "folder" | "tag";
  url: string;
  name: string;
}

/**
 * Validate an ID for URL operations (can be any OmniFocus item type).
 */
function validateUrlId(id: string): { code: string; message: string } | null {
  if (!id || id.trim() === "") {
    return { code: "INVALID_ID_FORMAT", message: "ID cannot be empty" };
  }

  // IDs should be alphanumeric with possible dashes/underscores
  const idPattern = /^[a-zA-Z0-9_-]+$/;
  if (!idPattern.test(id)) {
    return {
      code: "INVALID_ID_FORMAT",
      message: `Invalid ID format: ${id}`,
    };
  }

  return null;
}

/**
 * Generate an OmniFocus URL scheme deep link for a task, project, folder, or tag.
 * Returns the omnifocus:/// URL that can be used to open the item in OmniFocus.
 */
export async function generateUrl(id: string): Promise<CliOutput<UrlResult>> {
  // Validate ID
  const error = validateUrlId(id);
  if (error) {
    return failure(createError(ErrorCode.INVALID_ID_FORMAT, error.message));
  }

  const escapedId = escapeJSString(id);

  const body = `
var itemId = "${escapedId}";
var itemType = null;
var itemName = null;

// Try project FIRST. A project is backed by a task sharing its primary key,
// so Task.byIdentifier(projectId) also resolves (to the backing task) and
// checking Task first would misclassify project IDs as "task" — producing a
// task URL instead of a project URL. Project.byIdentifier returns null for a
// regular task ID, so this ordering classifies both correctly.
var project = Project.byIdentifier(itemId);
if (project) {
  itemType = "project";
  itemName = project.name;
}

// Try task
if (!itemType) {
  var task = Task.byIdentifier(itemId);
  if (task) {
    itemType = "task";
    itemName = task.name;
  }
}

// Try folder
if (!itemType) {
  var folder = Folder.byIdentifier(itemId);
  if (folder) {
    itemType = "folder";
    itemName = folder.name;
  }
}

// Try tag
if (!itemType) {
  var tag = Tag.byIdentifier(itemId);
  if (tag) {
    itemType = "tag";
    itemName = tag.name;
  }
}

if (!itemType) {
  throw new Error("Item not found with ID: ${escapedId}");
}

var itemUrl = "omnifocus:///" + itemType + "/" + itemId;

return JSON.stringify({
  id: itemId,
  type: itemType,
  url: itemUrl,
  name: itemName
});`;

  const result = await runOmniJSWrapped<UrlResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to generate URL")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

// ---------------------------------------------------------------------------
// Centralized descriptor
// ---------------------------------------------------------------------------

/**
 * Centralized descriptor for the `url` command.
 *
 * Drives CLI subcommand `url` and MCP tool `generate_url`.
 *
 * @public
 */
export const generateUrlDescriptor = defineCommand({
  name: "generateUrl",
  cliName: "url",
  mcpName: "generate_url",
  description:
    "Generate an OmniFocus URL scheme deep link for a task, project, folder, or tag",
  cliPositional: ["id"] as const,
  inputSchema: z.object({
    id: z.string().describe("ID of the task, project, folder, or tag"),
  }),
  handler: async (input) => generateUrl(input.id),
});

import { z } from "zod";
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

/**
 * Result from opening an item.
 */
export interface OpenResult {
  id: string;
  type: "task" | "project" | "folder" | "tag";
  name: string;
  opened: true;
}

/**
 * Open an item in the OmniFocus UI.
 * The item can be a task, project, folder, or tag.
 * Auto-detects the item type based on the ID.
 */
export async function openItem(id: string): Promise<CliOutput<OpenResult>> {
  // Validate ID
  const idError = validateId(id, "item");
  if (idError) return failure(idError);

  const escapedId = escapeJSString(id);

  const body = `
var itemId = "${escapedId}";
var itemType = null;
var itemName = null;

// Try task first (most common)
var task = Task.byIdentifier(itemId);
if (task) {
  itemType = "task";
  itemName = task.name;
}

// Try project
if (!itemType) {
  var project = Project.byIdentifier(itemId);
  if (project) {
    itemType = "project";
    itemName = project.name;
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

// Open the item using the OmniFocus URL scheme
var url = URL.fromString("omnifocus:///" + itemType + "/" + itemId);
url.open();

return JSON.stringify({
  id: itemId,
  type: itemType,
  name: itemName,
  opened: true
});`;

  const result = await runOmniJSWrapped<OpenResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to open item")
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
 * Centralized descriptor for the `open` command.
 *
 * Drives CLI subcommand `open` and MCP tool `open`.
 *
 * @public
 */
export const openItemDescriptor = defineCommand({
  name: "openItem",
  cliName: "open",
  mcpName: "open",
  description:
    "Open an item in the OmniFocus user interface (task, project, folder, or tag)",
  cliPositional: ["id"] as const,
  inputSchema: z.object({
    id: z
      .string()
      .describe(
        "ID of the item to open (task, project, folder, or tag — auto-detected)"
      ),
  }),
  handler: async (input) => openItem(input.id),
});

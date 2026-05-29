import { z } from "zod";
import type {
  CliOutput,
  CreateTagOptions,
  UpdateTagOptions,
  OFTag,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId, validateTagName } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

/**
 * Result from deleting a tag.
 */
export interface DeleteTagResult {
  tagId: string;
  deleted: true;
}

/**
 * Create a new tag in OmniFocus.
 */
export async function createTag(
  name: string,
  options: CreateTagOptions = {}
): Promise<CliOutput<OFTag>> {
  // Validate tag name (required for create)
  const nameError = validateTagName(name);
  if (nameError) return failure(nameError);

  // Validate optional inputs
  if (options.parentTagId !== undefined) {
    const parentIdError = validateId(options.parentTagId, "tag");
    if (parentIdError) return failure(parentIdError);
  }

  if (options.parentTagName !== undefined) {
    const parentNameError = validateTagName(options.parentTagName);
    if (parentNameError) return failure(parentNameError);
  }

  // Build script parts conditionally
  const scriptParts: string[] = [];

  if (options.parentTagId) {
    scriptParts.push(`
var parentTag = flattenedTags.filter(function(t) {
  return t.id.primaryKey === "${escapeJSString(options.parentTagId)}";
})[0];
if (!parentTag) {
  throw new Error("Parent tag not found: ${escapeJSString(options.parentTagId)}");
}
var newTag = new Tag("${escapeJSString(name)}", parentTag);`);
  } else if (options.parentTagName) {
    scriptParts.push(`
var parentTag = flattenedTags.filter(function(t) {
  return t.name === "${escapeJSString(options.parentTagName)}";
})[0];
if (!parentTag) {
  throw new Error("Parent tag not found: ${escapeJSString(options.parentTagName)}");
}
var newTag = new Tag("${escapeJSString(name)}", parentTag);`);
  } else {
    scriptParts.push(`var newTag = new Tag("${escapeJSString(name)}");`);
  }

  // Serialize and return the created tag
  scriptParts.push(`
var parentId = null;
var parentName = null;
if (newTag.parent) {
  parentId = newTag.parent.id.primaryKey;
  parentName = newTag.parent.name;
}

return JSON.stringify({
  id: newTag.id.primaryKey,
  name: newTag.name,
  parentId: parentId,
  parentName: parentName,
  availableTaskCount: newTag.availableTaskCount
});`);

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFTag>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to create tag")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No tag data returned")
    );
  }

  return success(result.data);
}

/**
 * Update an existing tag in OmniFocus.
 */
export async function updateTag(
  tagId: string,
  options: UpdateTagOptions
): Promise<CliOutput<OFTag>> {
  // Validate tag ID
  const idError = validateId(tagId, "tag");
  if (idError) return failure(idError);

  // Validate optional inputs
  if (options.name !== undefined) {
    const nameError = validateTagName(options.name);
    if (nameError) return failure(nameError);
  }

  if (options.parentTagId !== undefined) {
    const parentIdError = validateId(options.parentTagId, "tag");
    if (parentIdError) return failure(parentIdError);
  }

  if (options.parentTagName !== undefined) {
    const parentNameError = validateTagName(options.parentTagName);
    if (parentNameError) return failure(parentNameError);
  }

  // Build script parts conditionally
  const scriptParts: string[] = [];

  // Look up the tag by ID
  scriptParts.push(`
var theTag = flattenedTags.filter(function(t) {
  return t.id.primaryKey === "${escapeJSString(tagId)}";
})[0];
if (!theTag) {
  throw new Error("Tag not found: ${escapeJSString(tagId)}");
}`);

  // Apply name change
  if (options.name !== undefined) {
    scriptParts.push(`theTag.name = "${escapeJSString(options.name)}";`);
  }

  // Handle reparenting by ID
  if (options.parentTagId !== undefined) {
    scriptParts.push(`
var newParent = flattenedTags.filter(function(t) {
  return t.id.primaryKey === "${escapeJSString(options.parentTagId)}";
})[0];
if (!newParent) {
  throw new Error("Parent tag not found: ${escapeJSString(options.parentTagId)}");
}
moveTags([theTag], newParent);`);
  } else if (options.parentTagName !== undefined) {
    scriptParts.push(`
var newParent = flattenedTags.filter(function(t) {
  return t.name === "${escapeJSString(options.parentTagName)}";
})[0];
if (!newParent) {
  throw new Error("Parent tag not found: ${escapeJSString(options.parentTagName)}");
}
moveTags([theTag], newParent);`);
  }

  // Serialize and return the updated tag
  scriptParts.push(`
var parentId = null;
var parentName = null;
if (theTag.parent) {
  parentId = theTag.parent.id.primaryKey;
  parentName = theTag.parent.name;
}

return JSON.stringify({
  id: theTag.id.primaryKey,
  name: theTag.name,
  parentId: parentId,
  parentName: parentName,
  availableTaskCount: theTag.availableTaskCount
});`);

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFTag>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to update tag")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No tag data returned")
    );
  }

  return success(result.data);
}

/**
 * Delete a tag from OmniFocus.
 * Note: This cannot be undone.
 */
export async function deleteTag(
  tagId: string
): Promise<CliOutput<DeleteTagResult>> {
  // Validate tag ID
  const idError = validateId(tagId, "tag");
  if (idError) return failure(idError);

  const body = `
var theTag = flattenedTags.filter(function(t) {
  return t.id.primaryKey === "${escapeJSString(tagId)}";
})[0];
if (!theTag) {
  return JSON.stringify({ error: "not found", tagId: "${escapeJSString(tagId)}" });
}
deleteObject(theTag);
return JSON.stringify({ tagId: "${escapeJSString(tagId)}", deleted: true });`;

  const result = await runOmniJSWrapped<
    DeleteTagResult | { error: string; tagId: string }
  >(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to delete tag")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  // Check if we got a "not found" response
  if ("error" in result.data && result.data.error === "not found") {
    return failure(
      createError(ErrorCode.TAG_NOT_FOUND, `Tag not found: ${tagId}`)
    );
  }

  return success(result.data as DeleteTagResult);
}

/**
 * Centralized descriptor for the `create-tag` command.
 *
 * Drives the CLI subcommand `create-tag` and the MCP tool `tag_create`.
 *
 * @public
 */
export const createTagDescriptor = defineCommand({
  name: "createTag",
  cliName: "create-tag",
  mcpName: "tag_create",
  description: "Create a new tag in OmniFocus",
  cliPositional: ["name"],
  inputSchema: z.object({
    name: z.string().describe("Tag name"),
    parentTagId: z.string().optional().describe("Parent tag ID"),
    parentTagName: z.string().optional().describe("Parent tag name"),
  }),
  handler: async (input) =>
    createTag(input.name, {
      parentTagId: input.parentTagId,
      parentTagName: input.parentTagName,
    }),
});

/**
 * Centralized descriptor for the `update-tag` command.
 *
 * Drives the CLI subcommand `update-tag` and the MCP tool `tag_update`.
 *
 * @public
 */
export const updateTagDescriptor = defineCommand({
  name: "updateTag",
  cliName: "update-tag",
  mcpName: "tag_update",
  description: "Update an existing tag in OmniFocus",
  cliPositional: ["tagId"],
  inputSchema: z.object({
    tagId: z.string().describe("The ID of the tag to update"),
    name: z.string().optional().describe("New tag name"),
    parentTagId: z.string().optional().describe("New parent tag ID"),
    parentTagName: z.string().optional().describe("New parent tag name"),
  }),
  handler: async (input) =>
    updateTag(input.tagId, {
      name: input.name,
      parentTagId: input.parentTagId,
      parentTagName: input.parentTagName,
    }),
});

/**
 * Centralized descriptor for the `delete-tag` command.
 *
 * Drives the CLI subcommand `delete-tag` and the MCP tool `tag_delete`.
 *
 * @public
 */
export const deleteTagDescriptor = defineCommand({
  name: "deleteTag",
  cliName: "delete-tag",
  mcpName: "tag_delete",
  description: "Delete a tag from OmniFocus",
  cliPositional: ["tagId"],
  inputSchema: z.object({
    tagId: z.string().describe("The ID of the tag to delete"),
  }),
  handler: async (input) => deleteTag(input.tagId),
});

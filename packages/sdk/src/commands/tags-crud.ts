import type {
  CliOutput,
  CreateTagOptions,
  UpdateTagOptions,
  OFTag,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId, validateTagName } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

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

  // Build script based on whether we're placing under a parent tag
  let findParent = "";
  let makeTag = "";

  if (options.parentTagId) {
    findParent = `set parentTag to first flattened tag whose id is "${escapeAppleScript(options.parentTagId)}"`;
    makeTag = `set newTag to make new tag at end of tags of parentTag with properties {name:"${escapeAppleScript(name)}"}`;
  } else if (options.parentTagName) {
    findParent = `set parentTag to first flattened tag whose name is "${escapeAppleScript(options.parentTagName)}"`;
    makeTag = `set newTag to make new tag at end of tags of parentTag with properties {name:"${escapeAppleScript(name)}"}`;
  } else {
    findParent = "";
    makeTag = `set newTag to make new tag with properties {name:"${escapeAppleScript(name)}"}`;
  }

  const script = `
    ${findParent}
    ${makeTag}

    -- Return the created tag info
    set tagId to id of newTag
    set tagName to name of newTag

    set parentId to ""
    set parentName to ""
    try
      set p to container of newTag
      if class of p is tag then
        set parentId to id of p
        set parentName to name of p
      end if
    end try

    set availCount to count of (flattened tasks whose primary tag is newTag and completed is false)

    return "{" & ¬
      "\\"id\\": \\"" & tagId & "\\"," & ¬
      "\\"name\\": \\"" & (my escapeJson(tagName)) & "\\"," & ¬
      "\\"parentId\\": " & (my jsonString(parentId)) & "," & ¬
      "\\"parentName\\": " & (my jsonString(parentName)) & "," & ¬
      "\\"availableTaskCount\\": " & availCount & ¬
      "}"
  `;

  const result = await runAppleScript<OFTag>(
    omniFocusScriptWithHelpers(script)
  );

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

  // Build the update statements
  const updates: string[] = [];

  if (options.name !== undefined) {
    updates.push(`set name of theTag to "${escapeAppleScript(options.name)}"`);
  }

  // Handle reparenting
  let reparentScript = "";
  if (options.parentTagId !== undefined) {
    reparentScript = `
      set newParent to first flattened tag whose id is "${escapeAppleScript(options.parentTagId)}"
      move theTag to end of tags of newParent
    `;
  } else if (options.parentTagName !== undefined) {
    reparentScript = `
      set newParent to first flattened tag whose name is "${escapeAppleScript(options.parentTagName)}"
      move theTag to end of tags of newParent
    `;
  }

  const updateScript = updates.join("\n    ");

  const script = `
    set theTag to first flattened tag whose id is "${escapeAppleScript(tagId)}"

    ${updateScript}
    ${reparentScript}

    -- Return updated tag info
    set tagId to id of theTag
    set tagName to name of theTag

    set parentId to ""
    set parentName to ""
    try
      set p to container of theTag
      if class of p is tag then
        set parentId to id of p
        set parentName to name of p
      end if
    end try

    set availCount to count of (flattened tasks whose primary tag is theTag and completed is false)

    return "{" & ¬
      "\\"id\\": \\"" & tagId & "\\"," & ¬
      "\\"name\\": \\"" & (my escapeJson(tagName)) & "\\"," & ¬
      "\\"parentId\\": " & (my jsonString(parentId)) & "," & ¬
      "\\"parentName\\": " & (my jsonString(parentName)) & "," & ¬
      "\\"availableTaskCount\\": " & availCount & ¬
      "}"
  `;

  const result = await runAppleScript<OFTag>(
    omniFocusScriptWithHelpers(script)
  );

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

  const script = `
    try
      set theTag to first flattened tag whose id is "${escapeAppleScript(tagId)}"
      delete theTag
      return "{\\"tagId\\": \\"${escapeAppleScript(tagId)}\\", \\"deleted\\": true}"
    on error errMsg
      if errMsg contains "Can't get" or errMsg contains "not found" then
        return "{\\"error\\": \\"not found\\", \\"tagId\\": \\"${escapeAppleScript(tagId)}\\"}"
      else
        error errMsg
      end if
    end try
  `;

  const result = await runAppleScript<
    DeleteTagResult | { error: string; tagId: string }
  >(omniFocusScriptWithHelpers(script));

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

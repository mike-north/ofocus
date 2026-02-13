import type { CliOutput, OFFolder, UpdateFolderOptions } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId, validateFolderName } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Result from deleting a folder.
 */
export interface DeleteFolderResult {
  folderId: string;
  deleted: true;
}

/**
 * Update an existing folder in OmniFocus.
 */
export async function updateFolder(
  folderId: string,
  options: UpdateFolderOptions
): Promise<CliOutput<OFFolder>> {
  // Validate folder ID
  const idError = validateId(folderId, "folder");
  if (idError) return failure(idError);

  // Validate optional inputs
  if (options.name !== undefined) {
    const nameError = validateFolderName(options.name);
    if (nameError) return failure(nameError);
  }

  if (options.parentFolderId !== undefined) {
    const parentIdError = validateId(options.parentFolderId, "folder");
    if (parentIdError) return failure(parentIdError);
  }

  if (options.parentFolderName !== undefined) {
    const parentNameError = validateFolderName(options.parentFolderName);
    if (parentNameError) return failure(parentNameError);
  }

  // Build the update statements
  const updates: string[] = [];

  if (options.name !== undefined) {
    updates.push(
      `set name of theFolder to "${escapeAppleScript(options.name)}"`
    );
  }

  // Handle reparenting
  let reparentScript = "";
  if (options.parentFolderId !== undefined) {
    reparentScript = `
      set newParent to first flattened folder whose id is "${escapeAppleScript(options.parentFolderId)}"
      move theFolder to end of folders of newParent
    `;
  } else if (options.parentFolderName !== undefined) {
    reparentScript = `
      set newParent to first flattened folder whose name is "${escapeAppleScript(options.parentFolderName)}"
      move theFolder to end of folders of newParent
    `;
  }

  const updateScript = updates.join("\n    ");

  const script = `
    set theFolder to first flattened folder whose id is "${escapeAppleScript(folderId)}"

    ${updateScript}
    ${reparentScript}

    -- Return updated folder info
    set folderId to id of theFolder
    set folderName to name of theFolder

    set parentId to ""
    set parentName to ""
    try
      set p to container of theFolder
      if class of p is folder then
        set parentId to id of p
        set parentName to name of p
      end if
    end try

    set projCount to count of projects of theFolder
    set subFolderCount to count of folders of theFolder

    return "{" & ¬
      "\\"id\\": \\"" & folderId & "\\"," & ¬
      "\\"name\\": \\"" & (my escapeJson(folderName)) & "\\"," & ¬
      "\\"parentId\\": " & (my jsonString(parentId)) & "," & ¬
      "\\"parentName\\": " & (my jsonString(parentName)) & "," & ¬
      "\\"projectCount\\": " & projCount & "," & ¬
      "\\"folderCount\\": " & subFolderCount & ¬
      "}"
  `;

  const result = await runAppleScript<OFFolder>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to update folder")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No folder data returned")
    );
  }

  return success(result.data);
}

/**
 * Delete a folder permanently from OmniFocus.
 * Note: This cannot be undone.
 */
export async function deleteFolder(
  folderId: string
): Promise<CliOutput<DeleteFolderResult>> {
  // Validate folder ID
  const idError = validateId(folderId, "folder");
  if (idError) return failure(idError);

  const script = `
    set theFolder to first flattened folder whose id is "${escapeAppleScript(folderId)}"
    delete theFolder

    return "{\\"folderId\\": \\"${escapeAppleScript(folderId)}\\", \\"deleted\\": true}"
  `;

  const result = await runAppleScript<DeleteFolderResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to delete folder")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

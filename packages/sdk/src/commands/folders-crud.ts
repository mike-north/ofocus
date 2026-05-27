import type { CliOutput, OFFolder, UpdateFolderOptions } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId, validateFolderName } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";

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

  // Build script parts conditionally
  const scriptParts: string[] = [];

  // Look up the folder by ID
  scriptParts.push(`
var theFolder = flattenedFolders.filter(function(f) {
  return f.id.primaryKey === "${escapeJSString(folderId)}";
})[0];
if (!theFolder) {
  throw new Error("Folder not found: ${escapeJSString(folderId)}");
}`);

  // Apply name change
  if (options.name !== undefined) {
    scriptParts.push(`theFolder.name = "${escapeJSString(options.name)}";`);
  }

  // Handle reparenting by ID
  if (options.parentFolderId !== undefined) {
    scriptParts.push(`
var newParent = flattenedFolders.filter(function(f) {
  return f.id.primaryKey === "${escapeJSString(options.parentFolderId)}";
})[0];
if (!newParent) {
  throw new Error("Parent folder not found: ${escapeJSString(options.parentFolderId)}");
}
moveSections([theFolder], newParent);`);
  } else if (options.parentFolderName !== undefined) {
    scriptParts.push(`
var newParent = flattenedFolders.filter(function(f) {
  return f.name === "${escapeJSString(options.parentFolderName)}";
})[0];
if (!newParent) {
  throw new Error("Parent folder not found: ${escapeJSString(options.parentFolderName)}");
}
moveSections([theFolder], newParent);`);
  }

  // Serialize and return the updated folder
  scriptParts.push(`
var parentId = null;
var parentName = null;
if (theFolder.parent) {
  parentId = theFolder.parent.id.primaryKey;
  parentName = theFolder.parent.name;
}

return JSON.stringify({
  id: theFolder.id.primaryKey,
  name: theFolder.name,
  parentId: parentId,
  parentName: parentName,
  projectCount: theFolder.projects.length,
  folderCount: theFolder.folders.length
});`);

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFFolder>(body);

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

  const body = `
var theFolder = flattenedFolders.filter(function(f) {
  return f.id.primaryKey === "${escapeJSString(folderId)}";
})[0];
if (!theFolder) {
  return JSON.stringify({ error: "not found", folderId: "${escapeJSString(folderId)}" });
}
deleteObject(theFolder);
return JSON.stringify({ folderId: "${escapeJSString(folderId)}", deleted: true });`;

  const result = await runOmniJSWrapped<
    DeleteFolderResult | { error: string; folderId: string }
  >(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to delete folder")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  // Check if we got a "not found" response
  if ("error" in result.data && result.data.error === "not found") {
    return failure(
      createError(ErrorCode.FOLDER_NOT_FOUND, `Folder not found: ${folderId}`)
    );
  }

  return success(result.data as DeleteFolderResult);
}

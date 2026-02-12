import type {
  CliOutput,
  CreateFolderOptions,
  FolderQueryOptions,
  OFFolder,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateFolderName, validateId } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import {
  runAppleScript,
  omniFocusScriptWithHelpers,
} from "../applescript.js";

/**
 * Create a new folder in OmniFocus.
 */
export async function createFolder(
  name: string,
  options: CreateFolderOptions = {}
): Promise<CliOutput<OFFolder>> {
  // Validate folder name (required for create)
  if (!name || name.trim() === "") {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Folder name cannot be empty")
    );
  }

  const nameError = validateFolderName(name);
  if (nameError) return failure(nameError);

  // Validate optional inputs
  if (options.parentFolderId !== undefined) {
    const parentIdError = validateId(options.parentFolderId, "project");
    if (parentIdError) return failure(parentIdError);
  }

  const parentNameError = validateFolderName(options.parentFolderName);
  if (parentNameError) return failure(parentNameError);

  // Build script based on whether we're placing in a parent folder
  let findParent = "";
  let makeFolder = "";

  if (options.parentFolderId) {
    findParent = `set parentFolder to first flattened folder whose id is "${escapeAppleScript(options.parentFolderId)}"`;
    makeFolder = `set newFolder to make new folder at end of folders of parentFolder with properties {name:"${escapeAppleScript(name)}"}`;
  } else if (options.parentFolderName) {
    findParent = `set parentFolder to first flattened folder whose name is "${escapeAppleScript(options.parentFolderName)}"`;
    makeFolder = `set newFolder to make new folder at end of folders of parentFolder with properties {name:"${escapeAppleScript(name)}"}`;
  } else {
    findParent = "";
    makeFolder = `set newFolder to make new folder with properties {name:"${escapeAppleScript(name)}"}`;
  }

  const script = `
    ${findParent}
    ${makeFolder}

    -- Return the created folder info
    set folderId to id of newFolder
    set folderName to name of newFolder

    set parentId to ""
    set parentName to ""
    try
      set p to container of newFolder
      if class of p is folder then
        set parentId to id of p
        set parentName to name of p
      end if
    end try

    set projCount to count of projects of newFolder
    set subFolderCount to count of folders of newFolder

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
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to create folder")
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
 * Query folders from OmniFocus with optional filters.
 */
export async function queryFolders(
  options: FolderQueryOptions = {}
): Promise<CliOutput<OFFolder[]>> {
  // Validate parent filter
  const parentError = validateFolderName(options.parent);
  if (parentError) return failure(parentError);

  const script = `
    set output to "["
    set isFirst to true

    set allFolders to flattened folders

    repeat with f in allFolders
      set shouldInclude to true

      ${options.parent ? `-- Filter by parent folder` : ""}
      ${options.parent ? `try` : ""}
      ${options.parent ? `  set c to container of f` : ""}
      ${options.parent ? `  if class of c is folder then` : ""}
      ${options.parent ? `    if name of c is not "${escapeAppleScript(options.parent)}" then set shouldInclude to false` : ""}
      ${options.parent ? `  else` : ""}
      ${options.parent ? `    set shouldInclude to false` : ""}
      ${options.parent ? `  end if` : ""}
      ${options.parent ? `on error` : ""}
      ${options.parent ? `  set shouldInclude to false` : ""}
      ${options.parent ? `end try` : ""}

      if shouldInclude then
        if not isFirst then set output to output & ","
        set isFirst to false

        set folderId to id of f
        set folderName to name of f

        set parentId to ""
        set parentName to ""
        try
          set p to container of f
          if class of p is folder then
            set parentId to id of p
            set parentName to name of p
          end if
        end try

        set projCount to count of projects of f
        set subFolderCount to count of folders of f

        set output to output & "{" & ¬
          "\\"id\\": \\"" & folderId & "\\"," & ¬
          "\\"name\\": \\"" & (my escapeJson(folderName)) & "\\"," & ¬
          "\\"parentId\\": " & (my jsonString(parentId)) & "," & ¬
          "\\"parentName\\": " & (my jsonString(parentName)) & "," & ¬
          "\\"projectCount\\": " & projCount & "," & ¬
          "\\"folderCount\\": " & subFolderCount & ¬
          "}"
      end if
    end repeat

    return output & "]"
  `;

  const result = await runAppleScript<OFFolder[]>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query folders")
    );
  }

  return success(result.data ?? []);
}

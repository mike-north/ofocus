import type { CliOutput, OFProject, UpdateProjectOptions } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateId,
  validateProjectName,
  validateFolderName,
} from "../validation.js";
import { escapeAppleScript, toAppleScriptDate } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Result from deleting a project.
 */
export interface DeleteProjectResult {
  projectId: string;
  deleted: true;
}

/**
 * Result from dropping a project.
 */
export interface DropProjectResult {
  projectId: string;
  projectName: string;
  dropped: boolean;
}

/**
 * Update an existing project in OmniFocus.
 */
export async function updateProject(
  projectId: string,
  options: UpdateProjectOptions
): Promise<CliOutput<OFProject>> {
  // Validate project ID
  const idError = validateId(projectId, "project");
  if (idError) return failure(idError);

  // Validate optional inputs
  if (options.name !== undefined) {
    const nameError = validateProjectName(options.name);
    if (nameError) return failure(nameError);
  }

  if (options.folderId !== undefined) {
    const folderIdError = validateId(options.folderId, "folder");
    if (folderIdError) return failure(folderIdError);
  }

  if (options.folderName !== undefined) {
    const folderNameError = validateFolderName(options.folderName);
    if (folderNameError) return failure(folderNameError);
  }

  // Build the update statements
  const updates: string[] = [];

  if (options.name !== undefined) {
    updates.push(
      `set name of theProject to "${escapeAppleScript(options.name)}"`
    );
  }

  if (options.note !== undefined) {
    updates.push(
      `set note of theProject to "${escapeAppleScript(options.note)}"`
    );
  }

  if (options.sequential !== undefined) {
    updates.push(
      `set sequential of theProject to ${String(options.sequential)}`
    );
  }

  // Handle status changes
  // OmniFocus status values: active status, on hold status, done status, dropped status
  if (options.status !== undefined) {
    let statusValue: string;
    switch (options.status) {
      case "active":
        statusValue = "active status";
        break;
      case "on-hold":
        statusValue = "on hold status";
        break;
      case "completed":
        statusValue = "done status";
        break;
      case "dropped":
        statusValue = "dropped status";
        break;
      default:
        statusValue = "active status";
    }
    updates.push(`set status of theProject to ${statusValue}`);
  }

  // Handle due date
  if (options.dueDate !== undefined) {
    if (options.dueDate === "") {
      updates.push(`set due date of theProject to missing value`);
    } else {
      updates.push(
        `set due date of theProject to date "${toAppleScriptDate(options.dueDate)}"`
      );
    }
  }

  // Handle defer date
  if (options.deferDate !== undefined) {
    if (options.deferDate === "") {
      updates.push(`set defer date of theProject to missing value`);
    } else {
      updates.push(
        `set defer date of theProject to date "${toAppleScriptDate(options.deferDate)}"`
      );
    }
  }

  // Handle folder move
  let moveScript = "";
  if (options.folderId !== undefined) {
    moveScript = `
      set targetFolder to first flattened folder whose id is "${escapeAppleScript(options.folderId)}"
      move theProject to end of projects of targetFolder
    `;
  } else if (options.folderName !== undefined) {
    moveScript = `
      set targetFolder to first flattened folder whose name is "${escapeAppleScript(options.folderName)}"
      move theProject to end of projects of targetFolder
    `;
  }

  const updateScript = updates.join("\n    ");

  const script = `
    set theProject to first flattened project whose id is "${escapeAppleScript(projectId)}"

    ${updateScript}
    ${moveScript}

    -- Return updated project info
    set projId to id of theProject
    set projName to name of theProject
    set projNote to note of theProject
    set projSeq to sequential of theProject

    set projStatus to "active"
    try
      set theStatus to status of theProject
      if theStatus is on hold status then
        set projStatus to "on-hold"
      else if theStatus is done status then
        set projStatus to "completed"
      else if theStatus is dropped status then
        set projStatus to "dropped"
      end if
    end try

    set folderId to ""
    set folderName to ""
    try
      set f to folder of theProject
      set folderId to id of f
      set folderName to name of f
    end try

    set taskCount to count of tasks of theProject
    set remainingCount to count of (tasks of theProject where completed is false)

    return "{" & ¬
      "\\"id\\": \\"" & projId & "\\"," & ¬
      "\\"name\\": \\"" & (my escapeJson(projName)) & "\\"," & ¬
      "\\"note\\": " & (my jsonString(projNote)) & "," & ¬
      "\\"status\\": \\"" & projStatus & "\\"," & ¬
      "\\"sequential\\": " & projSeq & "," & ¬
      "\\"folderId\\": " & (my jsonString(folderId)) & "," & ¬
      "\\"folderName\\": " & (my jsonString(folderName)) & "," & ¬
      "\\"taskCount\\": " & taskCount & "," & ¬
      "\\"remainingTaskCount\\": " & remainingCount & ¬
      "}"
  `;

  const result = await runAppleScript<OFProject>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to update project")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No project data returned")
    );
  }

  return success(result.data);
}

/**
 * Delete a project permanently from OmniFocus.
 * Note: This cannot be undone.
 */
export async function deleteProject(
  projectId: string
): Promise<CliOutput<DeleteProjectResult>> {
  // Validate project ID
  const idError = validateId(projectId, "project");
  if (idError) return failure(idError);

  const script = `
    try
      set theProject to first flattened project whose id is "${escapeAppleScript(projectId)}"
      delete theProject
      return "{\\"projectId\\": \\"${escapeAppleScript(projectId)}\\", \\"deleted\\": true}"
    on error errMsg
      if errMsg contains "Can't get" or errMsg contains "not found" then
        return "{\\"error\\": \\"not found\\", \\"projectId\\": \\"${escapeAppleScript(projectId)}\\"}"
      else
        error errMsg
      end if
    end try
  `;

  const result = await runAppleScript<
    DeleteProjectResult | { error: string; projectId: string }
  >(omniFocusScriptWithHelpers(script));

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to delete project")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  // Check if we got a "not found" response
  if ("error" in result.data && result.data.error === "not found") {
    return failure(
      createError(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project not found: ${projectId}`
      )
    );
  }

  return success(result.data as DeleteProjectResult);
}

/**
 * Drop a project in OmniFocus (marks as dropped but keeps history).
 */
export async function dropProject(
  projectId: string
): Promise<CliOutput<DropProjectResult>> {
  // Validate project ID
  const idError = validateId(projectId, "project");
  if (idError) return failure(idError);

  const script = `
    set theProject to first flattened project whose id is "${escapeAppleScript(projectId)}"
    mark dropped theProject

    set projName to name of theProject
    set projDropped to (status of theProject is dropped status)

    return "{" & ¬
      "\\"projectId\\": \\"${escapeAppleScript(projectId)}\\"," & ¬
      "\\"projectName\\": \\"" & (my escapeJson(projName)) & "\\"," & ¬
      "\\"dropped\\": " & projDropped & ¬
      "}"
  `;

  const result = await runAppleScript<DropProjectResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to drop project")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

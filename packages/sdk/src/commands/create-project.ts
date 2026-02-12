import type { CliOutput, CreateProjectOptions, OFProject } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateProjectName,
  validateFolderName,
  validateDateString,
  validateId,
} from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import {
  runAppleScript,
  omniFocusScriptWithHelpers,
} from "../applescript.js";

/**
 * Create a new project in OmniFocus.
 */
export async function createProject(
  name: string,
  options: CreateProjectOptions = {}
): Promise<CliOutput<OFProject>> {
  // Validate project name (required for create)
  if (!name || name.trim() === "") {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Project name cannot be empty")
    );
  }

  const nameError = validateProjectName(name);
  if (nameError) return failure(nameError);

  // Validate optional inputs
  if (options.folderId !== undefined) {
    const folderIdError = validateId(options.folderId, "project");
    if (folderIdError) return failure(folderIdError);
  }

  const folderNameError = validateFolderName(options.folderName);
  if (folderNameError) return failure(folderNameError);

  if (options.dueDate !== undefined) {
    const dueError = validateDateString(options.dueDate);
    if (dueError) return failure(dueError);
  }

  if (options.deferDate !== undefined) {
    const deferError = validateDateString(options.deferDate);
    if (deferError) return failure(deferError);
  }

  // Build properties for the new project
  const properties: string[] = [`name:"${escapeAppleScript(name)}"`];

  if (options.note !== undefined) {
    properties.push(`note:"${escapeAppleScript(options.note)}"`);
  }

  if (options.sequential !== undefined) {
    properties.push(`sequential:${String(options.sequential)}`);
  }

  if (options.status === "on-hold") {
    properties.push("status:on hold");
  }
  // "active" is the default status, no need to set it explicitly

  if (options.dueDate !== undefined) {
    properties.push(`due date:date "${options.dueDate}"`);
  }

  if (options.deferDate !== undefined) {
    properties.push(`defer date:date "${options.deferDate}"`);
  }

  // Build script based on whether we're placing in a folder
  let findFolder = "";
  let makeProject = "";

  if (options.folderId) {
    findFolder = `set targetFolder to first flattened folder whose id is "${escapeAppleScript(options.folderId)}"`;
    makeProject = `set newProject to make new project at end of projects of targetFolder with properties {${properties.join(", ")}}`;
  } else if (options.folderName) {
    findFolder = `set targetFolder to first flattened folder whose name is "${escapeAppleScript(options.folderName)}"`;
    makeProject = `set newProject to make new project at end of projects of targetFolder with properties {${properties.join(", ")}}`;
  } else {
    findFolder = "";
    makeProject = `set newProject to make new project with properties {${properties.join(", ")}}`;
  }

  const script = `
    ${findFolder}
    ${makeProject}

    -- Return the created project info
    set projId to id of newProject
    set projName to name of newProject
    set projNote to note of newProject
    set projSeq to sequential of newProject

    set projStatus to "active"
    try
      set theStatus to status of newProject
      if theStatus is on hold then
        set projStatus to "on-hold"
      else if theStatus is done then
        set projStatus to "completed"
      else if theStatus is dropped then
        set projStatus to "dropped"
      end if
    end try

    set folderId to ""
    set folderName to ""
    try
      set f to folder of newProject
      set folderId to id of f
      set folderName to name of f
    end try

    set taskCount to count of tasks of newProject
    set remainingCount to count of (tasks of newProject where completed is false)

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
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to create project")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No project data returned")
    );
  }

  return success(result.data);
}

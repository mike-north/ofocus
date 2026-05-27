import type { CliOutput, CreateProjectOptions, OFProject } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateProjectName,
  validateFolderName,
  validateDateString,
  validateId,
} from "../validation.js";
import { escapeJSString, toOmniJSDate, runOmniJSWrapped } from "../omnijs.js";

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

  // Build the OmniJS script
  const scriptParts: string[] = [];

  // Create project — in a folder or at top level
  if (options.folderId) {
    scriptParts.push(`
var targetFolder = Folder.byIdentifier("${escapeJSString(options.folderId)}");
if (!targetFolder) {
  throw new Error("Folder not found: ${escapeJSString(options.folderId)}");
}
var proj = new Project("${escapeJSString(name)}", targetFolder);`);
  } else if (options.folderName) {
    scriptParts.push(`
var targetFolder = flattenedFolders.byName("${escapeJSString(options.folderName)}");
if (!targetFolder) {
  throw new Error("Folder not found: ${escapeJSString(options.folderName)}");
}
var proj = new Project("${escapeJSString(name)}", targetFolder);`);
  } else {
    scriptParts.push(`var proj = new Project("${escapeJSString(name)}");`);
  }

  if (options.note !== undefined) {
    scriptParts.push(`proj.note = "${escapeJSString(options.note)}";`);
  }

  if (options.sequential !== undefined) {
    scriptParts.push(`proj.sequential = ${String(options.sequential)};`);
  }

  if (options.status === "on-hold") {
    scriptParts.push(`proj.status = Project.Status.OnHold;`);
  }
  // "active" is the default status — no need to set it explicitly

  if (options.dueDate !== undefined) {
    scriptParts.push(`proj.dueDate = ${toOmniJSDate(options.dueDate)};`);
  }

  if (options.deferDate !== undefined) {
    scriptParts.push(`proj.deferDate = ${toOmniJSDate(options.deferDate)};`);
  }

  // Serialize and return
  scriptParts.push(`
var folderId = null;
var folderName = null;
if (proj.parentFolder) {
  folderId = proj.parentFolder.id.primaryKey;
  folderName = proj.parentFolder.name;
}

var statusStr = "active";
if (proj.status === Project.Status.OnHold) {
  statusStr = "on-hold";
} else if (proj.status === Project.Status.Done) {
  statusStr = "completed";
} else if (proj.status === Project.Status.Dropped) {
  statusStr = "dropped";
}

return JSON.stringify({
  id: proj.id.primaryKey,
  name: proj.name,
  note: proj.note || null,
  status: statusStr,
  sequential: proj.sequential,
  folderId: folderId,
  folderName: folderName,
  taskCount: proj.tasks.length,
  remainingTaskCount: proj.tasks.filter(function(t) { return !t.completed; }).length
});`);

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFProject>(body);

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

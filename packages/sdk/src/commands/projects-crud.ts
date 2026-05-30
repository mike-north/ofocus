import { z } from "zod";
import type { CliOutput, OFProject, UpdateProjectOptions } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateId,
  validateProjectName,
  validateFolderName,
} from "../validation.js";
import { escapeJSString, toOmniJSDate, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

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

/** Shared serializer for an OFProject — appended to every script body. */
function projectSerializerScript(): string {
  return `
var folderId = null;
var folderName = null;
if (theProject.parentFolder) {
  folderId = theProject.parentFolder.id.primaryKey;
  folderName = theProject.parentFolder.name;
}

var statusStr = "active";
if (theProject.status === Project.Status.OnHold) {
  statusStr = "on-hold";
} else if (theProject.status === Project.Status.Done) {
  statusStr = "completed";
} else if (theProject.status === Project.Status.Dropped) {
  statusStr = "dropped";
}

return JSON.stringify({
  id: theProject.id.primaryKey,
  name: theProject.name,
  note: theProject.note || null,
  status: statusStr,
  sequential: theProject.sequential,
  folderId: folderId,
  folderName: folderName,
  taskCount: theProject.tasks.length,
  remainingTaskCount: theProject.tasks.filter(function(t) { return !t.completed; }).length
});`;
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

  // Build the OmniJS script
  const scriptParts: string[] = [];

  scriptParts.push(`
var theProject = Project.byIdentifier("${escapeJSString(projectId)}");
if (!theProject) {
  throw new Error("Project not found: ${escapeJSString(projectId)}");
}`);

  if (options.name !== undefined) {
    scriptParts.push(`theProject.name = "${escapeJSString(options.name)}";`);
  }

  if (options.note !== undefined) {
    scriptParts.push(`theProject.note = "${escapeJSString(options.note)}";`);
  }

  if (options.sequential !== undefined) {
    scriptParts.push(`theProject.sequential = ${String(options.sequential)};`);
  }

  // Handle status changes
  if (options.status !== undefined) {
    let statusExpr: string;
    switch (options.status) {
      case "active":
        statusExpr = "Project.Status.Active";
        break;
      case "on-hold":
        statusExpr = "Project.Status.OnHold";
        break;
      case "completed":
        statusExpr = "Project.Status.Done";
        break;
      case "dropped":
        statusExpr = "Project.Status.Dropped";
        break;
      default:
        statusExpr = "Project.Status.Active";
    }
    scriptParts.push(`theProject.status = ${statusExpr};`);
  }

  // Handle due date
  if (options.dueDate !== undefined) {
    if (options.dueDate === "") {
      scriptParts.push(`theProject.dueDate = null;`);
    } else {
      scriptParts.push(
        `theProject.dueDate = ${toOmniJSDate(options.dueDate)};`
      );
    }
  }

  // Handle defer date
  if (options.deferDate !== undefined) {
    if (options.deferDate === "") {
      scriptParts.push(`theProject.deferDate = null;`);
    } else {
      scriptParts.push(
        `theProject.deferDate = ${toOmniJSDate(options.deferDate)};`
      );
    }
  }

  // Handle folder move
  if (options.folderId !== undefined) {
    scriptParts.push(`
var targetFolder = Folder.byIdentifier("${escapeJSString(options.folderId)}");
if (!targetFolder) {
  throw new Error("Folder not found: ${escapeJSString(options.folderId)}");
}
moveSections([theProject], targetFolder);`);
  } else if (options.folderName !== undefined) {
    scriptParts.push(`
var targetFolder = flattenedFolders.byName("${escapeJSString(options.folderName)}");
if (!targetFolder) {
  throw new Error("Folder not found: ${escapeJSString(options.folderName)}");
}
moveSections([theProject], targetFolder);`);
  }

  scriptParts.push(projectSerializerScript());

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFProject>(body);

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

  const body = `
var theProject = Project.byIdentifier("${escapeJSString(projectId)}");
if (!theProject) {
  return JSON.stringify({ error: "not found", projectId: "${escapeJSString(projectId)}" });
}
deleteObject(theProject);
return JSON.stringify({ projectId: "${escapeJSString(projectId)}", deleted: true });`;

  const result = await runOmniJSWrapped<
    DeleteProjectResult | { error: string; projectId: string }
  >(body);

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

  const body = `
var theProject = Project.byIdentifier("${escapeJSString(projectId)}");
if (!theProject) {
  throw new Error("Project not found: ${escapeJSString(projectId)}");
}
theProject.status = Project.Status.Dropped;

return JSON.stringify({
  projectId: theProject.id.primaryKey,
  projectName: theProject.name,
  dropped: theProject.status === Project.Status.Dropped
});`;

  const result = await runOmniJSWrapped<DropProjectResult>(body);

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

/**
 * Centralized descriptor for the `update-project` command.
 *
 * Drives the CLI subcommand `update-project` and the MCP tool `project_update`.
 *
 * @public
 */
export const updateProjectDescriptor = defineCommand({
  name: "updateProject",
  cliName: "update-project",
  mcpName: "project_update",
  description: "Update properties of an existing project",
  cliPositional: ["projectId"],
  inputSchema: z.object({
    projectId: z.string().describe("The ID of the project to update"),
    name: z.string().optional().describe("New project name"),
    note: z.string().optional().describe("New project note"),
    status: z
      .enum(["active", "on-hold", "completed", "dropped"])
      .optional()
      .describe("New project status (active, on-hold, completed, dropped)"),
    folderId: z.string().optional().describe("Move to folder by ID"),
    folderName: z.string().optional().describe("Move to folder by name"),
    sequential: z
      .boolean()
      .optional()
      .describe("Make project sequential (true) or parallel (false)"),
    dueDate: z
      .string()
      .optional()
      .describe("New due date (empty string to clear)"),
    deferDate: z
      .string()
      .optional()
      .describe("New defer date (empty string to clear)"),
  }),
  handler: async (input) =>
    updateProject(input.projectId, {
      name: input.name,
      note: input.note,
      status: input.status,
      folderId: input.folderId,
      folderName: input.folderName,
      sequential: input.sequential,
      dueDate: input.dueDate,
      deferDate: input.deferDate,
    }),
});

/**
 * Centralized descriptor for the `delete-project` command.
 *
 * Drives the CLI subcommand `delete-project` and the MCP tool `project_delete`.
 *
 * @public
 */
export const deleteProjectDescriptor = defineCommand({
  name: "deleteProject",
  cliName: "delete-project",
  mcpName: "project_delete",
  description: "Permanently delete a project from OmniFocus",
  cliPositional: ["projectId"],
  inputSchema: z.object({
    projectId: z.string().describe("The ID of the project to delete"),
  }),
  handler: async (input) => deleteProject(input.projectId),
});

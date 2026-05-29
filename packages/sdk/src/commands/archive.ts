import { z } from "zod";
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runOmniJSWrapped, escapeJSString, toOmniJSDate } from "../omnijs.js";
import { validateDateString } from "../validation.js";
import { defineCommand } from "../registry/define.js";

/**
 * Options for archiving tasks.
 */
export interface ArchiveOptions {
  /** Archive tasks completed before this date (ISO 8601 format) */
  completedBefore?: string | undefined;
  /** Archive tasks dropped before this date (ISO 8601 format) */
  droppedBefore?: string | undefined;
  /** Only archive tasks from this project */
  project?: string | undefined;
  /** Preview what would be archived without actually archiving */
  dryRun?: boolean | undefined;
}

/**
 * Result of archive operation.
 */
export interface ArchiveResult {
  /** Number of tasks archived */
  tasksArchived: number;
  /** Number of projects archived */
  projectsArchived: number;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Archive file path (if created) */
  archivePath: string | null;
}

/**
 * Result of compact operation.
 */
export interface CompactResult {
  /** Whether compact was triggered */
  compacted: boolean;
  /** Message about the operation */
  message: string;
}

/**
 * Archive completed/dropped tasks and projects.
 *
 * In OmniJS, this scans `flattenedTasks` for completed/dropped tasks matching
 * the date filters and counts them. OmniFocus automatically archives old
 * completed tasks to ~/Library/Containers/.../OmniFocus/Archive/; this
 * command does not delete tasks because the AppleScript implementation also
 * did not delete them — it only called `compact` as a DB-optimization step.
 *
 * @param options - Archive options
 */
export async function archiveTasks(
  options: ArchiveOptions = {}
): Promise<CliOutput<ArchiveResult>> {
  const { completedBefore, droppedBefore, project, dryRun = false } = options;

  // Validate date inputs
  if (completedBefore) {
    const completedBeforeError = validateDateString(completedBefore);
    if (completedBeforeError) {
      return failure(completedBeforeError);
    }
  }
  if (droppedBefore) {
    const droppedBeforeError = validateDateString(droppedBefore);
    if (droppedBeforeError) {
      return failure(droppedBeforeError);
    }
  }

  // If no date conditions, require at least one
  if (!completedBefore && !droppedBefore) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "At least one of --completed-before or --dropped-before is required"
      )
    );
  }

  // Build OmniJS date filter conditions
  const taskConditions: string[] = [];

  if (completedBefore) {
    taskConditions.push(
      `(t.completed && t.completionDate && t.completionDate < ${toOmniJSDate(completedBefore)})`
    );
  }

  if (droppedBefore) {
    taskConditions.push(
      `(t.dropped && t.completionDate && t.completionDate < ${toOmniJSDate(droppedBefore)})`
    );
  }

  const taskConditionExpr = taskConditions.join(" || ");

  const projectFilterExpr = project
    ? `t.containingProject && t.containingProject.name === "${escapeJSString(project)}"`
    : "true";

  const body = `
var completedBeforeDate = ${completedBefore ? toOmniJSDate(completedBefore) : "null"};
var droppedBeforeDate = ${droppedBefore ? toOmniJSDate(droppedBefore) : "null"};
var dryRun = ${dryRun ? "true" : "false"};

var taskCount = 0;
var tasksToProcess = flattenedTasks.filter(function(t) {
  var matchesDate = ${taskConditionExpr};
  var matchesProject = ${projectFilterExpr};
  return matchesDate && matchesProject;
});

taskCount = tasksToProcess.length;

// OmniJS does not expose a direct "archive" operation — OmniFocus archives
// automatically. The original AppleScript also did not delete tasks; it
// only called compact() as a DB-optimization step (which is unavailable
// in OmniJS). For non-dry-run we simply report the count of archivable
// tasks, matching the original behaviour.

// Count completed/dropped projects
var projectCount = 0;
var allProjects = flattenedProjects;
for (var i = 0; i < allProjects.length; i++) {
  var p = allProjects[i];
  if (p.status === Project.Status.Done || p.status === Project.Status.Dropped) {
    projectCount++;
  }
}

return JSON.stringify({
  tasksArchived: taskCount,
  projectsArchived: projectCount,
  dryRun: dryRun,
  archivePath: null
});`;

  const result = await runOmniJSWrapped<ArchiveResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to archive tasks")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No result data returned")
    );
  }

  return success(result.data);
}

/**
 * Trigger database compaction in OmniFocus.
 *
 * The AppleScript `compact` command has no equivalent in OmniJS — OmniFocus
 * handles database compaction internally and does not expose it to JavaScript
 * automation. This function returns a structured result documenting this
 * limitation rather than fabricating success or silently failing.
 *
 * @see https://omni-automation.com/omnifocus/document-window.html
 */
export function compactDatabase(): Promise<CliOutput<CompactResult>> {
  return Promise.resolve(
    success({
      compacted: false,
      message:
        "Database compaction is not supported via OmniJS automation. OmniFocus manages compaction internally.",
    })
  );
}

// ---------------------------------------------------------------------------
// Centralized descriptors
// ---------------------------------------------------------------------------

/**
 * Centralized descriptor for the `archive` command.
 *
 * Drives CLI subcommand `archive` and MCP tool `archive`.
 *
 * @public
 */
export const archiveTasksDescriptor = defineCommand({
  name: "archiveTasks",
  cliName: "archive",
  mcpName: "archive",
  description: "Archive completed or dropped tasks and projects",
  inputSchema: z.object({
    completedBefore: z
      .string()
      .optional()
      .describe("Archive tasks completed before this date (ISO 8601)"),
    droppedBefore: z
      .string()
      .optional()
      .describe("Archive tasks dropped before this date (ISO 8601)"),
    project: z
      .string()
      .optional()
      .describe("Archive only tasks from this project"),
    dryRun: z
      .boolean()
      .optional()
      .describe("Preview what would be archived without archiving"),
  }),
  handler: async (input) =>
    archiveTasks({
      completedBefore: input.completedBefore,
      droppedBefore: input.droppedBefore,
      project: input.project,
      dryRun: input.dryRun,
    }),
});

/**
 * Centralized descriptor for the `compact` command.
 *
 * Drives CLI subcommand `compact` and MCP tool `compact_database`.
 *
 * @public
 */
export const compactDatabaseDescriptor = defineCommand({
  name: "compactDatabase",
  cliName: "compact",
  mcpName: "compact_database",
  description: "Compact the OmniFocus database",
  inputSchema: z.object({}),
  handler: async (_input) => compactDatabase(),
});

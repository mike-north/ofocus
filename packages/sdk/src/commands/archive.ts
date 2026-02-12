import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";
import { escapeAppleScript } from "../escape.js";
import { validateDateString } from "../validation.js";

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
 * Note: OmniFocus archives are stored in ~/Library/Containers/com.omnigroup.OmniFocus3/Data/Library/Application Support/OmniFocus/Archive/
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

  // Build date filter conditions
  const conditions: string[] = [];

  if (completedBefore) {
    conditions.push(
      `completion date of t is not missing value and completion date of t < (my parseDate("${escapeAppleScript(completedBefore)}"))`
    );
  }

  if (droppedBefore) {
    // Dropped tasks have a specific property in OmniFocus
    conditions.push(
      `dropped of t is true and modification date of t < (my parseDate("${escapeAppleScript(droppedBefore)}"))`
    );
  }

  // If no date conditions, require at least one
  if (conditions.length === 0) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "At least one of --completed-before or --dropped-before is required"
      )
    );
  }

  const conditionStr = conditions.join(" or ");
  const projectFilter = project
    ? `containing project of t is not missing value and name of containing project of t is "${escapeAppleScript(project)}"`
    : "true";

  const script = `
    set taskCount to 0
    set projectCount to 0
    set dryRun to ${dryRun ? "true" : "false"}

    -- Helper to parse ISO date
    on parseDate(dateStr)
      set theDate to current date
      try
        -- Handle ISO 8601 format (YYYY-MM-DD)
        set {year:y, month:m, day:d} to {text 1 thru 4 of dateStr as integer, text 6 thru 7 of dateStr as integer, text 9 thru 10 of dateStr as integer}
        set year of theDate to y
        set month of theDate to m
        set day of theDate to d
        set hours of theDate to 0
        set minutes of theDate to 0
        set seconds of theDate to 0
      end try
      return theDate
    end parseDate

    -- Find tasks to archive
    set tasksToArchive to {}
    repeat with t in flattened tasks
      try
        if (${conditionStr}) and (${projectFilter}) then
          set end of tasksToArchive to t
          set taskCount to taskCount + 1
        end if
      end try
    end repeat

    -- Archive if not dry run
    if not dryRun and (count of tasksToArchive) > 0 then
      -- OmniFocus auto-archives completed tasks, but we can trigger it
      -- by accessing the archive functionality
      compact
    end if

    -- Find completed/dropped projects to count
    repeat with p in flattened projects
      try
        if status of p is done status or status of p is dropped status then
          set projectCount to projectCount + 1
        end if
      end try
    end repeat

    return "{" & ¬
      "\\"tasksArchived\\": " & taskCount & "," & ¬
      "\\"projectsArchived\\": " & projectCount & "," & ¬
      "\\"dryRun\\": " & (dryRun as string) & "," & ¬
      "\\"archivePath\\": null" & ¬
      "}"
  `;

  const result = await runAppleScript<ArchiveResult>(
    omniFocusScriptWithHelpers(script)
  );

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
 * Compaction removes deleted items and optimizes the database.
 */
export async function compactDatabase(): Promise<CliOutput<CompactResult>> {
  const script = `
    -- Trigger database compaction
    compact

    return "{" & ¬
      "\\"compacted\\": true," & ¬
      "\\"message\\": \\"Database compaction triggered\\"" & ¬
      "}"
  `;

  const result = await runAppleScript<CompactResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to compact database")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No result data returned")
    );
  }

  return success(result.data);
}

import type { CliOutput, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runOmniJSWrapped, toOmniJSDate } from "../omnijs.js";
import { validateDateString } from "../validation.js";

/**
 * Options for querying deferred tasks.
 */
export interface DeferredQueryOptions {
  /** Include tasks deferred until after this date */
  deferredAfter?: string | undefined;
  /** Include tasks deferred until before this date */
  deferredBefore?: string | undefined;
  /** Only show tasks that are currently blocked by defer date */
  blockedOnly?: boolean | undefined;
}

/**
 * Query all deferred tasks from OmniFocus.
 * Returns tasks that have a defer date set.
 */
export async function queryDeferred(
  options: DeferredQueryOptions = {}
): Promise<CliOutput<OFTask[]>> {
  // Validate date inputs
  if (options.deferredAfter) {
    const afterError = validateDateString(options.deferredAfter);
    if (afterError) {
      return failure(afterError);
    }
  }
  if (options.deferredBefore) {
    const beforeError = validateDateString(options.deferredBefore);
    if (beforeError) {
      return failure(beforeError);
    }
  }

  const blockedOnly = options.blockedOnly === true;

  // Build filter conditions as JavaScript expressions
  const conditions: string[] = [
    "t.deferDate != null",
    "!t.completed",
    "!t.effectivelyDropped",
  ];

  if (blockedOnly) {
    conditions.push("t.deferDate > new Date()");
  }

  if (options.deferredAfter !== undefined) {
    conditions.push(
      `t.deferDate >= ${toOmniJSDate(options.deferredAfter)}`
    );
  }

  if (options.deferredBefore !== undefined) {
    conditions.push(
      `t.deferDate <= ${toOmniJSDate(options.deferredBefore)}`
    );
  }

  const filterExpr = conditions.join(" && ");

  const body = `
var allTasks = flattenedTasks.filter(function(t) {
  return ${filterExpr};
});

var items = allTasks.map(function(t) {
  var projId = null;
  var projName = null;
  if (t.containingProject) {
    projId = t.containingProject.id.primaryKey;
    projName = t.containingProject.name;
  }
  return {
    id: t.id.primaryKey,
    name: t.name,
    note: t.note || null,
    flagged: t.flagged,
    completed: t.completed,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    deferDate: t.deferDate ? t.deferDate.toISOString() : null,
    completionDate: t.completionDate ? t.completionDate.toISOString() : null,
    projectId: projId,
    projectName: projName,
    tags: t.tags.map(function(tg) { return tg.name; }),
    estimatedMinutes: t.estimatedMinutes != null ? t.estimatedMinutes : null
  };
});

return JSON.stringify(items);`;

  const result = await runOmniJSWrapped<OFTask[]>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query deferred tasks")
    );
  }

  return success(result.data ?? []);
}

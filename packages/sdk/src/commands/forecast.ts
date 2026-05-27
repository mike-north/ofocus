import type { CliOutput, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateDateString } from "../validation.js";
import { runOmniJSWrapped, toOmniJSDate } from "../omnijs.js";

/**
 * Options for querying forecast tasks.
 */
export interface ForecastOptions {
  /** Start date for the forecast range (defaults to today) */
  start?: string | undefined;
  /** End date for the forecast range */
  end?: string | undefined;
  /** Number of days from start to include (alternative to end) */
  days?: number | undefined;
  /** Include tasks with no due date but deferred to the range */
  includeDeferred?: boolean | undefined;
}

/**
 * Query tasks by date range, similar to OmniFocus Forecast view.
 * Returns tasks that are due or deferred within the specified date range.
 */
export async function queryForecast(
  options: ForecastOptions = {}
): Promise<CliOutput<OFTask[]>> {
  // Validate date inputs
  if (options.start !== undefined) {
    const error = validateDateString(options.start);
    if (error) return failure(error);
  }

  if (options.end !== undefined) {
    const error = validateDateString(options.end);
    if (error) return failure(error);
  }

  // Validate days option
  if (
    options.days !== undefined &&
    (options.days < 1 || !Number.isInteger(options.days))
  ) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Days must be a positive integer")
    );
  }

  const includeDeferred = options.includeDeferred === true;

  // Build start date expression for OmniJS
  const startDateExpr =
    options.start !== undefined
      ? toOmniJSDate(options.start)
      : "new Date()";

  // Build end date expression for OmniJS
  let endDateExpr: string;
  if (options.end !== undefined) {
    endDateExpr = toOmniJSDate(options.end);
  } else if (options.days !== undefined) {
    endDateExpr = `new Date(startDate.getTime() + ${String(options.days)} * 86400000)`;
  } else {
    // Default to 7 days
    endDateExpr = `new Date(startDate.getTime() + 7 * 86400000)`;
  }

  // Build task inclusion logic
  const deferredCheck = includeDeferred
    ? `
  if (!shouldInclude && t.deferDate != null) {
    shouldInclude = t.deferDate >= startDate && t.deferDate <= endDate;
  }`
    : "";

  const body = `
var startDate = ${startDateExpr};
var endDate = ${endDateExpr};

var allTasks = flattenedTasks.filter(function(t) {
  return !t.completed && !t.effectivelyDropped;
});

var matchedTasks = allTasks.filter(function(t) {
  var shouldInclude = false;

  if (t.dueDate != null) {
    shouldInclude = t.dueDate >= startDate && t.dueDate <= endDate;
  }
${deferredCheck}

  return shouldInclude;
});

var items = matchedTasks.map(function(t) {
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
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query forecast")
    );
  }

  return success(result.data ?? []);
}

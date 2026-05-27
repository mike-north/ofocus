import type {
  CliOutput,
  TaskQueryOptions,
  OFTask,
  PaginatedResult,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateDateString,
  validateProjectName,
  validatePaginationParams,
} from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";

/**
 * Query tasks from OmniFocus with optional filters and pagination.
 */
export async function queryTasks(
  options: TaskQueryOptions = {}
): Promise<CliOutput<PaginatedResult<OFTask>>> {
  // Validate inputs
  if (options.dueBefore !== undefined) {
    const dateError = validateDateString(options.dueBefore);
    if (dateError) return failure(dateError);
  }

  if (options.dueAfter !== undefined) {
    const dateError = validateDateString(options.dueAfter);
    if (dateError) return failure(dateError);
  }

  const projectError = validateProjectName(options.project);
  if (projectError) return failure(projectError);

  // Validate pagination parameters
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

  // Pagination defaults
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  // Build filter conditions as JavaScript expressions
  const conditions: string[] = [];

  if (options.completed === true) {
    conditions.push("t.completed");
  } else if (options.completed === false) {
    conditions.push("!t.completed");
  }

  if (options.flagged === true) {
    conditions.push("t.flagged");
  }

  if (options.available === true) {
    conditions.push("!t.completed");
    conditions.push("!t.effectivelyDropped");
    conditions.push("!t.blocked");
  }

  if (options.project !== undefined) {
    conditions.push(
      `(t.containingProject && t.containingProject.name === "${escapeJSString(options.project)}")`
    );
  }

  if (options.tag !== undefined) {
    conditions.push(
      `t.tags.some(function(tg) { return tg.name === "${escapeJSString(options.tag)}"; })`
    );
  }

  if (options.dueBefore !== undefined) {
    conditions.push(
      `(t.dueDate && t.dueDate < new Date("${escapeJSString(options.dueBefore)}"))`
    );
  }

  if (options.dueAfter !== undefined) {
    conditions.push(
      `(t.dueDate && t.dueDate > new Date("${escapeJSString(options.dueAfter)}"))`
    );
  }

  const filterExpr = conditions.length > 0 ? conditions.join(" && ") : "true";

  const body = `
var allTasks = flattenedTasks.filter(function(t) {
  return ${filterExpr};
});

var totalCount = allTasks.length;
var pageOffset = ${String(offset)};
var pageLimit = ${String(limit)};
var paged = allTasks.slice(pageOffset, pageOffset + pageLimit);

var items = paged.map(function(t) {
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
    estimatedMinutes: t.estimatedMinutes || null
  };
});

return JSON.stringify({
  items: items,
  totalCount: totalCount,
  returnedCount: paged.length,
  hasMore: totalCount > (pageOffset + paged.length),
  offset: pageOffset,
  limit: pageLimit
});`;

  const result = await runOmniJSWrapped<PaginatedResult<OFTask>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query tasks")
    );
  }

  return success(
    result.data ?? {
      items: [],
      totalCount: 0,
      returnedCount: 0,
      hasMore: false,
      offset,
      limit,
    }
  );
}

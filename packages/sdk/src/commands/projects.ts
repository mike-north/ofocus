import type {
  CliOutput,
  ProjectQueryOptions,
  OFProject,
  PaginatedResult,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validatePaginationParams } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";

/**
 * Query projects from OmniFocus with optional filters and pagination.
 */
export async function queryProjects(
  options: ProjectQueryOptions = {}
): Promise<CliOutput<PaginatedResult<OFProject>>> {
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

  if (options.sequential === true) {
    conditions.push("p.sequential === true");
  } else if (options.sequential === false) {
    conditions.push("p.sequential === false");
  }

  if (options.status !== undefined) {
    switch (options.status) {
      case "active":
        conditions.push("p.status === Project.Status.Active");
        break;
      case "on-hold":
        conditions.push("p.status === Project.Status.OnHold");
        break;
      case "completed":
        conditions.push("p.status === Project.Status.Done");
        break;
      case "dropped":
        conditions.push("p.status === Project.Status.Dropped");
        break;
    }
  }

  if (options.folder !== undefined) {
    conditions.push(
      `(p.parentFolder && p.parentFolder.name === "${escapeJSString(options.folder)}")`
    );
  }

  const filterExpr = conditions.length > 0 ? conditions.join(" && ") : "true";

  const body = `
var allProjects = flattenedProjects.filter(function(p) {
  return ${filterExpr};
});

var totalCount = allProjects.length;
var pageOffset = ${String(offset)};
var pageLimit = ${String(limit)};
var paged = allProjects.slice(pageOffset, pageOffset + pageLimit);

var items = paged.map(function(p) {
  var folderId = null;
  var folderName = null;
  if (p.parentFolder) {
    folderId = p.parentFolder.id.primaryKey;
    folderName = p.parentFolder.name;
  }

  var statusStr = "active";
  if (p.status === Project.Status.OnHold) {
    statusStr = "on-hold";
  } else if (p.status === Project.Status.Done) {
    statusStr = "completed";
  } else if (p.status === Project.Status.Dropped) {
    statusStr = "dropped";
  }

  var allTasks = p.flattenedTasks;
  var taskCount = allTasks.length;
  var remainingTaskCount = allTasks.filter(function(t) { return !t.completed; }).length;

  return {
    id: p.id.primaryKey,
    name: p.name,
    note: p.note || null,
    status: statusStr,
    sequential: p.sequential,
    folderId: folderId,
    folderName: folderName,
    taskCount: taskCount,
    remainingTaskCount: remainingTaskCount
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

  const result = await runOmniJSWrapped<PaginatedResult<OFProject>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query projects")
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

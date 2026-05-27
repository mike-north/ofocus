import type {
  CliOutput,
  TagQueryOptions,
  OFTag,
  PaginatedResult,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validatePaginationParams } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";

/**
 * Query tags from OmniFocus with optional filters and pagination.
 */
export async function queryTags(
  options: TagQueryOptions = {}
): Promise<CliOutput<PaginatedResult<OFTag>>> {
  // Validate pagination parameters
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

  // Pagination defaults
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  // Build optional parent-filter condition
  const parentFilterExpr = options.parent
    ? `(tag.parent && tag.parent.name === "${escapeJSString(options.parent)}")`
    : "true";

  const body = `
var allTags = flattenedTags.filter(function(tag) {
  return ${parentFilterExpr};
});

var totalCount = allTags.length;
var pageOffset = ${String(offset)};
var pageLimit = ${String(limit)};
var paged = allTags.slice(pageOffset, pageOffset + pageLimit);

var items = paged.map(function(tag) {
  var parentId = null;
  var parentName = null;
  if (tag.parent) {
    parentId = tag.parent.id.primaryKey;
    parentName = tag.parent.name;
  }
  return {
    id: tag.id.primaryKey,
    name: tag.name,
    parentId: parentId,
    parentName: parentName,
    availableTaskCount: tag.availableTaskCount
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

  const result = await runOmniJSWrapped<PaginatedResult<OFTag>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query tags")
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

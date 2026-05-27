import type { CliOutput, OFTask, TaskQueryOptions } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validatePaginationParams } from "../validation.js";
import { runOmniJSWrapped } from "../omnijs.js";
import {
  buildListQueryBody,
  compileAggregate,
  compileProjection,
  compileSort,
  compileTaskPredicates,
  taskFieldSpec,
  type QueryResult,
} from "../query/index.js";

/**
 * Query tasks from OmniFocus with the full shared-query vocabulary.
 *
 * Returns a discriminated {@link QueryResult} — the `kind` field tells the
 * caller whether the response is a paged list, a count, an ID list, a single
 * item, or grouped buckets.
 *
 * @public
 */
export async function queryTasks(
  options: TaskQueryOptions = {}
): Promise<CliOutput<QueryResult<OFTask>>> {
  // Pagination validation (gated separately because invalid limits/offsets
  // would otherwise produce nonsense pagination in the result envelope).
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

  // Compile each phase. We collect ALL validation errors before returning so
  // the first one we report is the highest-priority. The order below matches
  // the order a user encounters problems: predicate first, then projection,
  // then sort, then aggregation.
  const pred = compileTaskPredicates(options);
  const proj = compileProjection(taskFieldSpec, options);
  const sort = compileSort(taskFieldSpec, options);
  const agg = compileAggregate(options);

  const errors = [
    ...pred.validationErrors,
    ...proj.validationErrors,
    ...sort.validationErrors,
    ...agg.validationErrors,
  ];
  if (errors.length > 0) {
    const first = errors[0];
    if (first) return failure(first);
  }

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const body = buildListQueryBody({
    source: "flattenedTasks",
    itemVar: "t",
    conditions: pred.conditions,
    comparator: sort.comparator,
    mapExpression: proj.mapExpression,
    aggregate: agg,
    limit,
    offset,
    groupKey: agg.groupKey,
  });

  const result = await runOmniJSWrapped<QueryResult<OFTask>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query tasks")
    );
  }

  // Provide a typed default in the unlikely case OmniJS returns undefined.
  // The default depends on the requested shape so the discriminant remains
  // sound.
  if (result.data === undefined) {
    return success(makeEmptyResult(agg.shape, limit, offset));
  }

  return success(result.data);
}

function makeEmptyResult(
  shape: ReturnType<typeof compileAggregate>["shape"],
  limit: number,
  offset: number
): QueryResult<OFTask> {
  switch (shape) {
    case "count":
      return { kind: "count", count: 0 };
    case "ids":
      return { kind: "ids", ids: [] };
    case "single-first":
    case "single-last":
      return { kind: "single", item: null };
    case "groups":
      return { kind: "groups", groups: [], totalCount: 0 };
    case "list":
      return {
        kind: "list",
        items: [],
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
        offset,
        limit,
      };
    default: {
      const exhaustive: never = shape;
      throw new Error(`Unknown shape: ${String(exhaustive)}`);
    }
  }
}

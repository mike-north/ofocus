import { z } from "zod";
import type { CliOutput, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateSearchQuery,
  validatePaginationParams,
  validateAllFlag,
} from "../validation.js";
import { runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";
import {
  buildListQueryBody,
  compileAggregate,
  compileProjection,
  compileSort,
  compileTaskPredicates,
  taskFieldSpec,
  taskGroupKeys,
  type QueryResult,
  type BaseListQueryOptions,
  type TaskQueryOptions,
} from "../query/index.js";

/**
 * Options for searching tasks.
 *
 * Extends {@link BaseListQueryOptions} so callers get the full shared-query
 * vocabulary (sort, fields, count, groupBy, etc.) in addition to the
 * search-specific `scope` and `includeCompleted` flags.
 *
 * @public
 */
export interface SearchOptions extends BaseListQueryOptions {
  /**
   * Which fields to search against.
   * - `"name"` — task name only
   * - `"note"` — task note only
   * - `"both"` (default) — either name or note
   */
  scope?: "name" | "note" | "both" | undefined;
  /** When `true`, completed tasks are included in the results. Default: `false`. */
  includeCompleted?: boolean | undefined;
}

/**
 * Search tasks in OmniFocus by name, note, or both.
 *
 * Returns a discriminated {@link QueryResult} — the `kind` field tells the
 * caller whether the response is a paged list, a count, an ID list, a single
 * item, or grouped buckets.
 *
 * @public
 */
export async function searchTasks(
  query: string,
  options: SearchOptions = {}
): Promise<CliOutput<QueryResult<OFTask>>> {
  // Validate search query
  const queryError = validateSearchQuery(query);
  if (queryError) return failure(queryError);

  // Validate the --all flag (must not be combined with --limit, --offset, or
  // shape modifiers that produce a scalar/single-item result).
  const allFlagError = validateAllFlag(
    options.all,
    options.limit,
    options.offset,
    {
      count: options.count,
      first: options.first,
      last: options.last,
      idsOnly: options.idsOnly,
      groupBy: options.groupBy,
    }
  );
  if (allFlagError) return failure(allFlagError);

  // Validate pagination
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

  const scope = options.scope ?? "both";
  const includeCompleted = options.includeCompleted ?? false;

  // Build the task query options by translating search-specific fields into
  // the shared predicate vocabulary.
  const taskOptions: TaskQueryOptions = {
    ...options,
    // Scope → predicate
    ...(scope === "name" ? { nameContains: query } : {}),
    ...(scope === "note" ? { noteContains: query } : {}),
    ...(scope === "both" ? { nameOrNoteContains: query } : {}),
    // Completed filter
    ...(includeCompleted ? {} : { completed: false }),
  };

  // Apply default fields for search results if the caller didn't specify
  const fieldSpec =
    options.fields !== undefined
      ? taskFieldSpec
      : { ...taskFieldSpec, defaultFields: ["id", "name", "projectName"] };

  // Compile each phase
  const pred = compileTaskPredicates(taskOptions);
  const proj = compileProjection(fieldSpec, taskOptions);
  const sort = compileSort(fieldSpec, taskOptions);
  const agg = compileAggregate(taskOptions, taskGroupKeys);

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
    all: options.all,
    groupKey: agg.groupKey,
  });

  const result = await runOmniJSWrapped<QueryResult<OFTask>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to search tasks")
    );
  }

  if (result.data === undefined) {
    return success(makeEmptyResult(agg.shape, limit, offset));
  }

  return success(result.data);
}

/**
 * Centralized descriptor for the search command.
 *
 * Drives the CLI subcommand `search` and the MCP tool `search`. The schema
 * intentionally exposes only the search-specific knobs (scope, limit,
 * includeCompleted) — the richer query vocabulary remains available through
 * the {@link searchTasks} SDK function for callers that need it.
 *
 * @public
 */
export const searchTasksDescriptor = defineCommand({
  name: "searchTasks",
  cliName: "search",
  mcpName: "search",
  description: "Search tasks by name or note content.",
  cliPositional: ["query"],
  inputSchema: z.object({
    query: z.string().describe("Search query text"),
    scope: z
      .enum(["name", "note", "both"])
      .optional()
      .describe("Where to search (default: both)"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum results to return (default: 100)"),
    includeCompleted: z
      .boolean()
      .optional()
      .describe("Include completed tasks in the results"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Number of results to skip for pagination"),
    all: z
      .boolean()
      .optional()
      .describe(
        "When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset."
      ),
  }),
  handler: async (input) =>
    searchTasks(input.query, {
      scope: input.scope,
      limit: input.limit,
      offset: input.offset,
      includeCompleted: input.includeCompleted,
      all: input.all,
    }),
});

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

import { z } from "zod";
import type { CliOutput, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validatePaginationParams, validateAllFlag } from "../validation.js";
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
 * Options for querying deferred tasks.
 *
 * Extends {@link BaseListQueryOptions} so callers get the full shared-query
 * vocabulary (sort, fields, count, groupBy, etc.) in addition to the
 * deferred-specific predicates.
 *
 * @public
 */
export interface DeferredQueryOptions extends BaseListQueryOptions {
  /** Include tasks deferred until after this date (ISO 8601 or relative). */
  deferAfter?: string | undefined;
  /** Include tasks deferred until before this date (ISO 8601 or relative). */
  deferBefore?: string | undefined;
  /**
   * When `true`, only include tasks whose defer date is strictly in the
   * future — i.e., tasks actively blocked by their defer date.
   */
  blockedOnly?: boolean | undefined;
}

/**
 * Query all deferred tasks from OmniFocus.
 *
 * The preset for this command includes: hasDefer, completed: false, and
 * effectivelyDropped: false. Additional predicates can be added via the
 * options object.
 *
 * Returns a discriminated {@link QueryResult} — the `kind` field tells the
 * caller whether the response is a paged list, a count, an ID list, a single
 * item, or grouped buckets.
 *
 * @public
 */
export async function queryDeferred(
  options: DeferredQueryOptions = {}
): Promise<CliOutput<QueryResult<OFTask>>> {
  // Validate the --all flag (must not be combined with --limit or --offset).
  const allFlagError = validateAllFlag(
    options.all,
    options.limit,
    options.offset
  );
  if (allFlagError) return failure(allFlagError);

  // Validate pagination
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

  // Build the task query options from deferred-specific fields
  const taskOptions: TaskQueryOptions = {
    ...options,
    // Preset: must have a defer date, not completed, not effectively dropped
    hasDefer: true,
    completed: false,
    effectivelyDropped: false,
    // Map deferred-specific date fields to the canonical predicate names
    ...(options.deferAfter !== undefined
      ? { deferAfter: options.deferAfter }
      : {}),
    ...(options.deferBefore !== undefined
      ? { deferBefore: options.deferBefore }
      : {}),
    // blockedOnly → deferredToFuture predicate
    ...(options.blockedOnly === true ? { deferredToFuture: true } : {}),
  };

  // Apply default fields for deferred results if the caller didn't specify
  const fieldSpec =
    options.fields !== undefined
      ? taskFieldSpec
      : {
          ...taskFieldSpec,
          defaultFields: ["id", "name", "deferDate", "projectName"],
        };

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
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query deferred tasks")
    );
  }

  if (result.data === undefined) {
    return success(makeEmptyResult(agg.shape, limit, offset));
  }

  return success(result.data);
}

/**
 * Centralized descriptor for the deferred-list command.
 *
 * Drives the CLI subcommand `deferred` and the MCP tool `deferred_list`. The
 * schema field names (`deferredAfter`, `deferredBefore`) match the historical
 * CLI/MCP surface; the handler maps them onto the SDK's canonical
 * `deferAfter` / `deferBefore` option names.
 *
 * @public
 */
export const queryDeferredDescriptor = defineCommand({
  name: "queryDeferred",
  cliName: "deferred",
  mcpName: "deferred_list",
  description: "List tasks with defer dates.",
  inputSchema: z.object({
    deferredAfter: z
      .string()
      .optional()
      .describe("Only tasks deferred after this date"),
    deferredBefore: z
      .string()
      .optional()
      .describe("Only tasks deferred before this date"),
    blockedOnly: z
      .boolean()
      .optional()
      .describe("Only show tasks currently blocked by their defer date"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum number of results to return (default: 100)"),
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
    queryDeferred({
      deferAfter: input.deferredAfter,
      deferBefore: input.deferredBefore,
      blockedOnly: input.blockedOnly,
      limit: input.limit,
      offset: input.offset,
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

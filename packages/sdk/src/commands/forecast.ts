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
 * Options for querying forecast tasks.
 *
 * Extends {@link BaseListQueryOptions} so callers get the full shared-query
 * vocabulary (sort, fields, count, groupBy, etc.) in addition to the
 * forecast-specific predicates.
 *
 * @public
 */
export interface ForecastOptions extends BaseListQueryOptions {
  /**
   * Number of days from today to include in the forecast window. Default: `7`.
   * Must be a positive integer.
   */
  days?: number | undefined;
  /**
   * When `true`, tasks whose deferDate falls within the forecast window are
   * also included (in addition to tasks due within the window).
   * Default: `false`.
   */
  includeDeferred?: boolean | undefined;
}

/**
 * Query tasks by date window, similar to OmniFocus Forecast view.
 *
 * By default returns tasks that are due within the next N days (default 7).
 * When `includeDeferred: true`, also includes tasks deferred to the same
 * window.
 *
 * Returns a discriminated {@link QueryResult} — the `kind` field tells the
 * caller whether the response is a paged list, a count, an ID list, a single
 * item, or grouped buckets.
 *
 * @public
 */
export async function queryForecast(
  options: ForecastOptions = {}
): Promise<CliOutput<QueryResult<OFTask>>> {
  // Validate days option
  if (
    options.days !== undefined &&
    (options.days < 1 || !Number.isInteger(options.days))
  ) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Days must be a positive integer")
    );
  }

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

  const days = options.days ?? 7;
  const includeDeferred = options.includeDeferred ?? false;
  const windowDuration = `${String(days)}d`;

  // Build the task query options from forecast-specific fields.
  // When includeDeferred is false, we use the narrower dueWithin predicate.
  // When includeDeferred is true, we use dueOrDeferWithin which covers both.
  const taskOptions: TaskQueryOptions = {
    ...options,
    completed: false,
    effectivelyDropped: false,
    ...(includeDeferred
      ? { dueOrDeferWithin: windowDuration }
      : { dueWithin: windowDuration }),
  };

  // Apply default fields for forecast results if the caller didn't specify
  const fieldSpec =
    options.fields !== undefined
      ? taskFieldSpec
      : {
          ...taskFieldSpec,
          defaultFields: ["id", "name", "dueDate", "projectName"],
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
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query forecast")
    );
  }

  if (result.data === undefined) {
    return success(makeEmptyResult(agg.shape, limit, offset));
  }

  return success(result.data);
}

/**
 * Centralized descriptor for the forecast command.
 *
 * Drives the CLI subcommand `forecast` and the MCP tool `forecast`.
 *
 * @public
 */
export const queryForecastDescriptor = defineCommand({
  name: "queryForecast",
  cliName: "forecast",
  mcpName: "forecast",
  description:
    "Query tasks due within N days (like the OmniFocus Forecast view).",
  inputSchema: z.object({
    days: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Number of days ahead to include (default: 7)"),
    includeDeferred: z
      .boolean()
      .optional()
      .describe("Include tasks deferred to the same window"),
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
    queryForecast({
      days: input.days,
      includeDeferred: input.includeDeferred,
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

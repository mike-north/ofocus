import { z } from "zod";
import type { CliOutput, OFTask, TaskQueryOptions } from "../types.js";
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
  listProjectionSchema,
  listSortSchema,
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
    all: options.all,
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

/**
 * Centralized descriptor for the `tasks` command.
 *
 * Drives the CLI subcommand `tasks` and the MCP tool `tasks_query`. The schema
 * exposes the most-used task predicates plus the full projection/sort
 * vocabulary so agents and CLI users can select exactly the fields they want.
 *
 * Both space-separated (`--fields id name dueDate`) and comma-separated
 * (`--fields id,name,dueDate`) forms are accepted for `--fields`,
 * `--exclude-fields`, and `--sort`.
 *
 * @public
 */
export const listTasksDescriptor = defineCommand({
  name: "listTasks",
  cliName: "tasks",
  mcpName: "tasks_query",
  description:
    "List and filter tasks from OmniFocus. Supports field projection, sorting, and a rich filter vocabulary.",
  inputSchema: z.object({
    // ── Commonly-used task predicates ────────────────────────────────────────
    project: z.string().optional().describe("Filter by project name or ID"),
    tag: z.string().optional().describe("Filter by tag name"),
    dueBefore: z
      .string()
      .optional()
      .describe("Filter tasks due before this date (ISO 8601 or relative)"),
    dueAfter: z
      .string()
      .optional()
      .describe("Filter tasks due after this date (ISO 8601 or relative)"),
    flagged: z.boolean().optional().describe("Filter by flagged status"),
    completed: z.boolean().optional().describe("Include completed tasks"),
    available: z
      .boolean()
      .optional()
      .describe("Only show available (actionable) tasks"),
    // ── Projection ───────────────────────────────────────────────────────────
    ...listProjectionSchema,
    // ── Sort ─────────────────────────────────────────────────────────────────
    ...listSortSchema,
    // ── Pagination ───────────────────────────────────────────────────────────
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Maximum number of results to return"),
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
    queryTasks({
      project: input.project,
      tag: input.tag,
      dueBefore: input.dueBefore,
      dueAfter: input.dueAfter,
      flagged: input.flagged,
      completed: input.completed,
      available: input.available,
      fields: input.fields,
      excludeFields: input.excludeFields,
      sort: input.sort,
      reverse: input.reverse,
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

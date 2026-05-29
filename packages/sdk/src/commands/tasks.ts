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
 * Drives the CLI subcommand `tasks` and the MCP tool `tasks_list`. The schema
 * exposes the full filter/sort/projection/aggregation/pagination surface that
 * the existing hand-wired CLI and MCP registrations supported, plus the richer
 * vocabulary from {@link TaskQueryOptions} that was previously only accessible
 * via the SDK function directly.
 *
 * @public
 */
export const queryTasksDescriptor = defineCommand({
  name: "queryTasks",
  cliName: "tasks",
  mcpName: "tasks_list",
  description: "List and filter tasks from OmniFocus.",
  inputSchema: z.object({
    // ── Membership predicates ──────────────────────────────────────────────
    project: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Filter by project name or ID (single value or array)"),
    tag: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Filter by tag name (single value or array)"),
    tagMode: z
      .enum(["any", "all", "none"])
      .optional()
      .describe(
        "Tag-matching mode when multiple tags are given (default: all)"
      ),
    folder: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Filter by folder name (transitive; single value or array)"),

    // ── Boolean state predicates ───────────────────────────────────────────
    flagged: z.boolean().optional().describe("Filter by flagged status"),
    notFlagged: z
      .boolean()
      .optional()
      .describe("Exclude flagged tasks when true"),
    completed: z
      .boolean()
      .optional()
      .describe("Include completed tasks when true"),
    notCompleted: z
      .boolean()
      .optional()
      .describe("Exclude completed tasks when true"),
    dropped: z.boolean().optional().describe("Include dropped tasks when true"),
    notDropped: z
      .boolean()
      .optional()
      .describe("Exclude dropped tasks when true"),
    blocked: z
      .boolean()
      .optional()
      .describe("Include only blocked tasks when true"),
    available: z
      .boolean()
      .optional()
      .describe("Only show available (actionable) tasks"),
    inInbox: z
      .boolean()
      .optional()
      .describe("Include only inbox tasks when true"),
    hasDue: z
      .boolean()
      .optional()
      .describe("Include only tasks that have a due date"),
    noDue: z
      .boolean()
      .optional()
      .describe("Include only tasks with no due date"),
    hasDefer: z
      .boolean()
      .optional()
      .describe("Include only tasks that have a defer date"),
    hasNote: z
      .boolean()
      .optional()
      .describe("Include only tasks that have a non-empty note"),
    hasAttachments: z
      .boolean()
      .optional()
      .describe("Include only tasks with attachments"),
    hasSubtasks: z
      .boolean()
      .optional()
      .describe("Include only tasks that have child subtasks"),
    hasRepetition: z
      .boolean()
      .optional()
      .describe("Include only tasks with a repetition rule"),
    effectivelyCompleted: z
      .boolean()
      .optional()
      .describe("Include only effectively-completed tasks"),
    effectivelyDropped: z
      .boolean()
      .optional()
      .describe("Include only effectively-dropped tasks"),

    // ── Status convenience ─────────────────────────────────────────────────
    status: z
      .enum(["active", "completed", "dropped", "deferred"])
      .optional()
      .describe(
        "Filter by high-level task status (active, completed, dropped, deferred)"
      ),

    // ── Date predicates ────────────────────────────────────────────────────
    dueBefore: z
      .string()
      .optional()
      .describe("Filter tasks due before this date (ISO 8601 or relative)"),
    dueAfter: z
      .string()
      .optional()
      .describe("Filter tasks due after this date (ISO 8601 or relative)"),
    dueOn: z
      .string()
      .optional()
      .describe("Match tasks whose due date falls on this calendar day (UTC)"),
    dueWithin: z
      .string()
      .optional()
      .describe(
        "Duration string like '7d'/'1w' — due date must be within now + duration"
      ),
    deferBefore: z
      .string()
      .optional()
      .describe("Filter tasks with defer date before this date"),
    deferAfter: z
      .string()
      .optional()
      .describe("Filter tasks with defer date after this date"),
    deferOn: z
      .string()
      .optional()
      .describe(
        "Match tasks whose defer date falls on this calendar day (UTC)"
      ),
    deferWithin: z
      .string()
      .optional()
      .describe("Duration string — defer date must be within now + duration"),
    completedBefore: z
      .string()
      .optional()
      .describe("Filter tasks completed before this date"),
    completedAfter: z
      .string()
      .optional()
      .describe("Filter tasks completed after this date"),

    // ── Numeric (estimatedMinutes) ─────────────────────────────────────────
    estimateLt: z
      .number()
      .optional()
      .describe("Estimated minutes less than this value"),
    estimateGt: z
      .number()
      .optional()
      .describe("Estimated minutes greater than this value"),
    estimateEq: z
      .number()
      .optional()
      .describe("Estimated minutes equal to this value"),

    // ── String matching ────────────────────────────────────────────────────
    nameContains: z
      .string()
      .optional()
      .describe("Task name contains this substring"),
    nameStarts: z
      .string()
      .optional()
      .describe("Task name starts with this string"),
    nameEquals: z.string().optional().describe("Task name equals this string"),
    nameRegex: z
      .string()
      .optional()
      .describe("Task name matches this regular expression"),
    noteContains: z
      .string()
      .optional()
      .describe("Task note contains this substring"),
    noteRegex: z
      .string()
      .optional()
      .describe("Task note matches this regular expression"),
    caseSensitive: z
      .boolean()
      .optional()
      .describe(
        "Case sensitivity for name/note string predicates (default: false)"
      ),

    // ── Projection ─────────────────────────────────────────────────────────
    fields: z
      .array(z.string())
      .optional()
      .describe("Whitelist of fields to include in each result item"),
    excludeFields: z
      .array(z.string())
      .optional()
      .describe("Fields to exclude from each result item"),

    // ── Sort ───────────────────────────────────────────────────────────────
    sort: z
      .array(z.string())
      .optional()
      .describe("Ordered list of sort keys (field names)"),
    reverse: z
      .boolean()
      .optional()
      .describe("Reverse the sort order (default: false)"),
    nullsFirst: z
      .boolean()
      .optional()
      .describe(
        "Place null sort values first instead of last (default: false)"
      ),

    // ── Shape modifiers (mutually exclusive) ──────────────────────────────
    count: z
      .boolean()
      .optional()
      .describe(
        "Return only the count of matching tasks as { kind: 'count', count }"
      ),
    first: z
      .boolean()
      .optional()
      .describe(
        "Return only the first matching task as { kind: 'single', item }"
      ),
    last: z
      .boolean()
      .optional()
      .describe(
        "Return only the last matching task as { kind: 'single', item }"
      ),
    idsOnly: z
      .boolean()
      .optional()
      .describe(
        "Return only the IDs of matching tasks as { kind: 'ids', ids }"
      ),
    groupBy: z
      .string()
      .optional()
      .describe("Group matching tasks by this field key"),
    stats: z
      .boolean()
      .optional()
      .describe("When grouping, include count statistics per group"),

    // ── Pagination ─────────────────────────────────────────────────────────
    limit: z
      .number()
      .int()
      .min(1)
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
        "When true, return every matching task ignoring --limit/--offset. Mutually exclusive with --limit and --offset."
      ),
  }),
  handler: async (input) =>
    queryTasks({
      project: input.project,
      tag: input.tag,
      tagMode: input.tagMode,
      folder: input.folder,
      flagged: input.flagged,
      notFlagged: input.notFlagged,
      completed: input.completed,
      notCompleted: input.notCompleted,
      dropped: input.dropped,
      notDropped: input.notDropped,
      blocked: input.blocked,
      available: input.available,
      inInbox: input.inInbox,
      hasDue: input.hasDue,
      noDue: input.noDue,
      hasDefer: input.hasDefer,
      hasNote: input.hasNote,
      hasAttachments: input.hasAttachments,
      hasSubtasks: input.hasSubtasks,
      hasRepetition: input.hasRepetition,
      effectivelyCompleted: input.effectivelyCompleted,
      effectivelyDropped: input.effectivelyDropped,
      status: input.status,
      dueBefore: input.dueBefore,
      dueAfter: input.dueAfter,
      dueOn: input.dueOn,
      dueWithin: input.dueWithin,
      deferBefore: input.deferBefore,
      deferAfter: input.deferAfter,
      deferOn: input.deferOn,
      deferWithin: input.deferWithin,
      completedBefore: input.completedBefore,
      completedAfter: input.completedAfter,
      estimateLt: input.estimateLt,
      estimateGt: input.estimateGt,
      estimateEq: input.estimateEq,
      nameContains: input.nameContains,
      nameStarts: input.nameStarts,
      nameEquals: input.nameEquals,
      nameRegex: input.nameRegex,
      noteContains: input.noteContains,
      noteRegex: input.noteRegex,
      caseSensitive: input.caseSensitive,
      fields: input.fields,
      excludeFields: input.excludeFields,
      sort: input.sort,
      reverse: input.reverse,
      nullsFirst: input.nullsFirst,
      count: input.count,
      first: input.first,
      last: input.last,
      idsOnly: input.idsOnly,
      groupBy: input.groupBy,
      stats: input.stats,
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

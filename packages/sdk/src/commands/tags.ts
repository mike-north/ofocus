import { z } from "zod";
import type { CliOutput, OFTag } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validatePaginationParams, validateAllFlag } from "../validation.js";
import { runOmniJSWrapped } from "../omnijs.js";
import {
  buildListQueryBody,
  compileAggregate,
  compileProjection,
  compileSort,
  compileTagPredicates,
  tagFieldSpec,
  tagGroupKeys,
  listProjectionSchema,
  listSortSchema,
  type QueryResult,
  type TagQueryOptions,
} from "../query/index.js";
import { defineCommand } from "../registry/define.js";

/**
 * Centralized descriptor for the `tags` command.
 *
 * Drives the CLI subcommand `tags` and the MCP tool `tags_list`.
 *
 * @public
 */
export const listTagsDescriptor = defineCommand({
  name: "listTags",
  cliName: "tags",
  mcpName: "tags_list",
  description: "List tags from OmniFocus",
  inputSchema: z.object({
    parent: z.string().optional().describe("Filter by parent tag name or ID"),
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
    queryTags({
      parent: input.parent,
      fields: input.fields,
      excludeFields: input.excludeFields,
      sort: input.sort,
      reverse: input.reverse,
      limit: input.limit,
      offset: input.offset,
      all: input.all,
    }),
});

/**
 * Query tags from OmniFocus with the full shared-query vocabulary.
 *
 * Returns a discriminated {@link QueryResult} — the `kind` field tells the
 * caller whether the response is a paged list, a count, an ID list, a single
 * item, or grouped buckets.
 *
 * @public
 */
export async function queryTags(
  options: TagQueryOptions = {}
): Promise<CliOutput<QueryResult<OFTag>>> {
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
  // the first one we report is the highest-priority.
  const pred = compileTagPredicates(options);
  const proj = compileProjection(tagFieldSpec, options);
  const sort = compileSort(tagFieldSpec, options);
  const agg = compileAggregate(options, tagGroupKeys);

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
    source: "flattenedTags",
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

  const result = await runOmniJSWrapped<QueryResult<OFTag>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query tags")
    );
  }

  // Provide a typed default in the unlikely case OmniJS returns undefined.
  if (result.data === undefined) {
    return success(makeEmptyResult(agg.shape, limit, offset));
  }

  return success(result.data);
}

function makeEmptyResult(
  shape: ReturnType<typeof compileAggregate>["shape"],
  limit: number,
  offset: number
): QueryResult<OFTag> {
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

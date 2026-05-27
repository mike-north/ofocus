/**
 * Shared query layer for OmniFocus list endpoints.
 *
 * The query layer compiles a small declarative options object into an OmniJS
 * script body. Each endpoint (tasks, projects, folders, tags, ...) passes a
 * source collection and the entity-specific predicate compiler; the rest of
 * the pipeline — projection, sort, aggregation, pagination — is shared.
 *
 * @public
 */

import type { AggregateShape, CompiledAggregate } from "./aggregate.js";

/**
 * Arguments for {@link buildListQueryBody}.
 *
 * @public
 */
export interface BuildListQueryBodyArgs {
  /** OmniJS expression that evaluates to a collection of entities (e.g., `flattenedTasks`). */
  source: string;
  /** Entity variable name used inside the predicate/projection (typically `"t"`). */
  itemVar: string;
  /** AND-combined boolean expressions; empty list disables the filter. */
  conditions: string[];
  /** JS function expression `function(a, b) {...}` or `null` for no sort. */
  comparator: string | null;
  /** JS function expression `function(t) {...}` producing the projected object. */
  mapExpression: string;
  /** Compiled aggregate descriptor produced by `compileAggregate`. */
  aggregate: CompiledAggregate;
  limit: number;
  offset: number;
  /**
   * Override for the groupBy key (advisory metadata for the result envelope).
   * The `aggregate.groupKeyExpr` is the canonical source for the OmniJS bucket
   * expression; this parameter is accepted for API symmetry.
   */
  groupKey?: string | undefined;
}

/**
 * Compose the full OmniJS body for a list endpoint.
 *
 * The generated body has roughly this structure:
 *
 * ```
 * var rows = SOURCE.filter(function(t) { return COND; });
 * if (COMPARATOR) rows.sort(COMPARATOR);
 * switch (shape) { case "count": ... case "list": ... }
 * ```
 *
 * The result is intended to be passed to `runOmniJSWrapped` which wraps it in
 * try/catch and adds an outer IIFE. Do not pre-wrap.
 *
 * @public
 */
export function buildListQueryBody(args: BuildListQueryBodyArgs): string {
  const {
    source,
    itemVar,
    conditions,
    comparator,
    mapExpression,
    aggregate,
    limit,
    offset,
  } = args;

  const filterExpr = conditions.length > 0 ? conditions.join(" && ") : "true";

  // Source extraction + filter
  const header = `
var rows = ${source}.filter(function(${itemVar}) {
  return ${filterExpr};
});`;

  const sortBlock =
    comparator !== null
      ? `
rows.sort(${comparator});`
      : "";

  const shapeBlock = renderShape({
    shape: aggregate.shape,
    groupKeyExpr: aggregate.groupKeyExpr,
    withStats: aggregate.withStats,
    mapExpression,
    itemVar,
    limit,
    offset,
  });

  return `${header}${sortBlock}
${shapeBlock}`;
}

interface RenderShapeArgs {
  shape: AggregateShape;
  groupKeyExpr?: string | undefined;
  withStats: boolean;
  mapExpression: string;
  itemVar: string;
  limit: number;
  offset: number;
}

function renderShape(args: RenderShapeArgs): string {
  const { shape, groupKeyExpr, withStats, mapExpression, itemVar, limit, offset } =
    args;

  switch (shape) {
    case "count":
      return `
return JSON.stringify({
  kind: "count",
  count: rows.length
});`;

    case "ids":
      return `
return JSON.stringify({
  kind: "ids",
  ids: rows.map(function(${itemVar}) { return ${itemVar}.id.primaryKey; })
});`;

    case "single-first":
      return `
{
  var __first = rows.length > 0 ? rows[0] : null;
  var __mapFn = ${mapExpression};
  return JSON.stringify({
    kind: "single",
    item: __first ? __mapFn(__first) : null
  });
}`;

    case "single-last":
      return `
{
  var __last = rows.length > 0 ? rows[rows.length - 1] : null;
  var __mapFn = ${mapExpression};
  return JSON.stringify({
    kind: "single",
    item: __last ? __mapFn(__last) : null
  });
}`;

    case "groups":
      return renderGroups({
        groupKeyExpr: groupKeyExpr ?? '"(unknown)"',
        withStats,
        mapExpression,
        itemVar,
      });

    case "list":
      return renderList({ mapExpression, itemVar, limit, offset });

    default: {
      const exhaustive: never = shape;
      throw new Error(`Unknown shape: ${String(exhaustive)}`);
    }
  }
}

function renderList(args: {
  mapExpression: string;
  itemVar: string;
  limit: number;
  offset: number;
}): string {
  const { mapExpression, limit, offset } = args;
  return `
{
  var __totalCount = rows.length;
  var __offset = ${String(offset)};
  var __limit = ${String(limit)};
  var __paged = rows.slice(__offset, __offset + __limit);
  var __mapFn = ${mapExpression};
  var __items = __paged.map(__mapFn);
  return JSON.stringify({
    kind: "list",
    items: __items,
    totalCount: __totalCount,
    returnedCount: __paged.length,
    hasMore: __totalCount > (__offset + __paged.length),
    offset: __offset,
    limit: __limit
  });
}`;
}

function renderGroups(args: {
  groupKeyExpr: string;
  withStats: boolean;
  mapExpression: string;
  itemVar: string;
}): string {
  const { groupKeyExpr, withStats, mapExpression, itemVar } = args;
  const itemsField = withStats
    ? `
      __groups[__key] = __groups[__key] || { key: __key, count: 0, items: [] };
      __groups[__key].count += 1;
      __groups[__key].items.push(__mapFn(${itemVar}));`
    : `
      __groups[__key] = __groups[__key] || { key: __key, count: 0 };
      __groups[__key].count += 1;`;

  return `
{
  var __groups = {};
  var __order = [];
  var __mapFn = ${mapExpression};
  for (var __i = 0; __i < rows.length; __i++) {
    var ${itemVar} = rows[__i];
    var __key = ${groupKeyExpr};
    if (!(__key in __groups)) __order.push(__key);${itemsField}
  }
  var __out = __order.map(function(__k) { return __groups[__k]; });
  return JSON.stringify({
    kind: "groups",
    groups: __out,
    totalCount: rows.length
  });
}`;
}

// Public re-exports for the query module. `BuildListQueryBodyArgs` is already
// exported above as an `export interface`.
export type {
  BaseListQueryOptions,
  QueryResult,
  TagMode,
  TaskQueryOptions,
  TaskStatus,
  NumericRange,
  FolderQueryOptions,
  FolderStatus,
  ProjectQueryOptions,
  ProjectStatus,
  TagQueryOptions,
  TagStatus,
} from "./types.js";
export type { ParsedDate } from "./dates.js";
export { parseDate, parseDuration } from "./dates.js";
export type { EntityFieldSpec, FieldGetter, GroupKeySpec } from "./fields.js";
export {
  taskFieldSpec,
  projectFieldSpec,
  projectGroupKeys,
  folderFieldSpec,
  folderGroupKeys,
  tagFieldSpec,
  tagGroupKeys,
  taskGroupKeys,
} from "./fields.js";
export type { CompiledProjection, CompileProjectionOptions } from "./projection.js";
export { compileProjection } from "./projection.js";
export type { CompiledSort, CompileSortOptions } from "./sort.js";
export { compileSort } from "./sort.js";
export type { AggregateShape, CompiledAggregate } from "./aggregate.js";
export { compileAggregate } from "./aggregate.js";
export type { CompiledPredicates } from "./predicates.js";
export {
  compileTaskPredicates,
  compileProjectPredicates,
  compileTagPredicates,
  compileFolderPredicates,
} from "./predicates.js";

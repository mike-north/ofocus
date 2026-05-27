import { type CliError, ErrorCode, createError } from "../errors.js";
import { taskGroupKeys, type GroupKeySpec } from "./fields.js";
import type { BaseListQueryOptions } from "./types.js";

/**
 * Result shape an aggregate compiles to.
 *
 * @public
 */
export type AggregateShape =
  | "list"
  | "count"
  | "ids"
  | "single-first"
  | "single-last"
  | "groups";

/**
 * Result of compiling aggregate options.
 *
 * @public
 */
export interface CompiledAggregate {
  shape: AggregateShape;
  /** Set when `shape === "groups"`. */
  groupKey?: string;
  /** Set when `shape === "groups"`; an OmniJS expression returning the bucket label. */
  groupKeyExpr?: string;
  /** Whether per-group items should be emitted alongside counts. */
  withStats: boolean;
  validationErrors: CliError[];
}

/**
 * Compile aggregate options into a single shape, validating that at most one
 * shape modifier is set.
 *
 * Pass an entity-specific `groupKeys` map to validate `groupBy` against the
 * correct key set. Defaults to {@link taskGroupKeys} for backward compatibility
 * with call sites that do not supply a map.
 *
 * @public
 */
export function compileAggregate(
  options: BaseListQueryOptions,
  groupKeys: Record<string, GroupKeySpec> = taskGroupKeys
): CompiledAggregate {
  const validationErrors: CliError[] = [];

  const flags: { name: string; set: boolean }[] = [
    { name: "count", set: options.count === true },
    { name: "first", set: options.first === true },
    { name: "last", set: options.last === true },
    { name: "idsOnly", set: options.idsOnly === true },
    { name: "groupBy", set: options.groupBy !== undefined },
  ];
  const setFlags = flags.filter((f) => f.set);

  if (setFlags.length > 1) {
    validationErrors.push(
      createError(
        ErrorCode.VALIDATION_ERROR,
        `Mutually exclusive shape modifiers set: ${setFlags
          .map((f) => f.name)
          .join(", ")}`,
        "Pick at most one of: count, first, last, idsOnly, groupBy"
      )
    );
  }

  const withStats = options.stats === true;

  // Resolve shape — first match wins if multiple were set (validation already
  // captured the conflict).
  if (options.count === true) {
    return { shape: "count", withStats, validationErrors };
  }
  if (options.idsOnly === true) {
    return { shape: "ids", withStats, validationErrors };
  }
  if (options.first === true) {
    return { shape: "single-first", withStats, validationErrors };
  }
  if (options.last === true) {
    return { shape: "single-last", withStats, validationErrors };
  }
  if (options.groupBy !== undefined) {
    const groupKey = options.groupBy;
    const spec = groupKeys[groupKey];
    if (spec === undefined) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          `Unknown groupBy key: ${groupKey}`,
          `Supported keys: ${Object.keys(groupKeys).sort().join(", ")}`
        )
      );
      // Degrade to list so subsequent compilation doesn't try to use an
      // unknown group key.
      return { shape: "list", withStats, validationErrors };
    }
    return {
      shape: "groups",
      groupKey,
      groupKeyExpr: spec.omnijsExpr,
      withStats,
      validationErrors,
    };
  }

  return { shape: "list", withStats, validationErrors };
}

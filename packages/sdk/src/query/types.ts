import type { PaginationOptions } from "../types.js";

/**
 * Options that apply to every list endpoint regardless of entity.
 * Entity-specific predicate flags live on the per-entity option type
 * (TaskQueryOptions, ProjectQueryOptions, etc.) which extends this.
 *
 * @public
 */
export interface BaseListQueryOptions extends PaginationOptions {
  // Projection
  /** Whitelist of fields to include in each item. If omitted, the entity's default field set is used. */
  fields?: string[] | undefined;
  /** Fields to exclude from the projection. Subtracted from either `fields` or defaults. */
  excludeFields?: string[] | undefined;

  // Sort
  /** Ordered list of sort keys. Each must be a field in the entity's allowlist. */
  sort?: string[] | undefined;
  /** Reverse the sort order. Applied after the multi-key comparator. */
  reverse?: boolean | undefined;
  /** Place null sort values first instead of last (default: false). */
  nullsFirst?: boolean | undefined;

  // Shape modifiers — mutually exclusive
  /** Return only the count of matching items as `{ kind: "count", count }`. */
  count?: boolean | undefined;
  /** Return only the first item (after sort) as `{ kind: "single", item }`. */
  first?: boolean | undefined;
  /** Return only the last item (after sort) as `{ kind: "single", item }`. */
  last?: boolean | undefined;
  /** Return only the IDs of matching items as `{ kind: "ids", ids }`. */
  idsOnly?: boolean | undefined;
  /** Group matching items by the given key; returns `{ kind: "groups", ... }`. */
  groupBy?: string | undefined;
  /** When grouping, include simple count statistics per group. */
  stats?: boolean | undefined;
}

/**
 * Tag-matching semantics for predicates that accept a single tag or a list.
 *
 * - `"all"` (default) — task must have every tag in the list
 * - `"any"` — task must have at least one tag in the list
 * - `"none"` — task must have none of the tags in the list
 *
 * @public
 */
export type TagMode = "any" | "all" | "none";

/**
 * High-level task status — a convenience predicate that collapses a few flags
 * into a single named bucket.
 *
 * @public
 */
export type TaskStatus = "active" | "completed" | "dropped" | "deferred";

/**
 * Inclusive integer range `[min, max]` for numeric predicates like
 * `estimateBetween`.
 *
 * @public
 */
export type NumericRange = readonly [number, number];

/**
 * Options for querying tasks. Extends {@link BaseListQueryOptions} with the
 * full predicate vocabulary supported by the OmniJS task query compiler.
 *
 * Every field is optional; only fields that are explicitly set contribute a
 * filter condition to the compiled query.
 *
 * @public
 */
export interface TaskQueryOptions extends BaseListQueryOptions {
  // ── Boolean state predicates ─────────────────────────────────────────────
  flagged?: boolean | undefined;
  notFlagged?: boolean | undefined;
  completed?: boolean | undefined;
  notCompleted?: boolean | undefined;
  dropped?: boolean | undefined;
  notDropped?: boolean | undefined;
  blocked?: boolean | undefined;
  available?: boolean | undefined;
  inInbox?: boolean | undefined;
  hasDue?: boolean | undefined;
  noDue?: boolean | undefined;
  hasDefer?: boolean | undefined;
  hasNote?: boolean | undefined;
  hasAttachments?: boolean | undefined;
  hasSubtasks?: boolean | undefined;
  hasRepetition?: boolean | undefined;
  effectivelyCompleted?: boolean | undefined;
  effectivelyDropped?: boolean | undefined;

  // ── Status convenience ───────────────────────────────────────────────────
  status?: TaskStatus | undefined;

  // ── Membership ───────────────────────────────────────────────────────────
  /** Project name(s). When an array is provided, semantics are "any of". */
  project?: string | string[] | undefined;
  /** Tag name(s). Combine with `tagMode` to control matching. */
  tag?: string | string[] | undefined;
  /** Tag-matching mode. Default: `"all"`. */
  tagMode?: TagMode | undefined;
  /**
   * Folder name(s). A task matches if its containing project's folder chain
   * contains any of the named folders (transitive).
   */
  folder?: string | string[] | undefined;

  // ── Date predicates ──────────────────────────────────────────────────────
  /** Each accepts ISO 8601 or a relative expression (see `parseDate`). */
  dueBefore?: string | undefined;
  dueAfter?: string | undefined;
  /** Match tasks whose dueDate falls on the given calendar day (UTC). */
  dueOn?: string | undefined;
  /** Duration string like `7d`/`1w` — `dueDate` must be within `now + duration`. */
  dueWithin?: string | undefined;

  deferBefore?: string | undefined;
  deferAfter?: string | undefined;
  deferOn?: string | undefined;
  deferWithin?: string | undefined;

  completedBefore?: string | undefined;
  completedAfter?: string | undefined;

  // ── Numeric (estimatedMinutes) ───────────────────────────────────────────
  estimateLt?: number | undefined;
  estimateGt?: number | undefined;
  estimateEq?: number | undefined;
  /** Inclusive `[min, max]`. */
  estimateBetween?: NumericRange | undefined;

  // ── String matching ──────────────────────────────────────────────────────
  nameContains?: string | undefined;
  nameStarts?: string | undefined;
  nameEquals?: string | undefined;
  nameRegex?: string | undefined;
  noteContains?: string | undefined;
  noteRegex?: string | undefined;
  /** Case sensitivity for `nameContains` / `nameStarts` / `noteContains`. Default: `false`. */
  caseSensitive?: boolean | undefined;
}

/**
 * Discriminated wire shape returned by every list endpoint.
 *
 * @typeParam T - The entity type (e.g., OFTask)
 *
 * @public
 */
export type QueryResult<T> =
  | {
      kind: "list";
      items: T[];
      totalCount: number;
      returnedCount: number;
      hasMore: boolean;
      offset: number;
      limit: number;
    }
  | { kind: "count"; count: number }
  | { kind: "ids"; ids: string[] }
  | { kind: "single"; item: T | null }
  | {
      kind: "groups";
      groups: { key: string; count: number; items?: T[] }[];
      totalCount: number;
    };

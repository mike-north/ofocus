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
 * Tag status values on the wire. Maps to the OmniJS `Tag.Status` enum.
 *
 * @public
 */
export type TagStatus = "active" | "on-hold" | "dropped";

/**
 * Options for querying tags. Extends {@link BaseListQueryOptions} with the
 * full predicate vocabulary supported by the OmniJS tag query compiler.
 *
 * Every field is optional; only fields that are explicitly set contribute a
 * filter condition to the compiled query.
 *
 * @public
 */
export interface TagQueryOptions extends BaseListQueryOptions {
  // ── Boolean state predicates ─────────────────────────────────────────────
  /** Match only root tags (no parent). */
  isRoot?: boolean | undefined;
  /** Match only non-root tags (has a parent). Inverse of isRoot. */
  notIsRoot?: boolean | undefined;
  /** Match only tags that have at least one direct child tag. */
  hasChildren?: boolean | undefined;
  /** Match only tags with no child tags. */
  noChildren?: boolean | undefined;
  /** Match tags that have a non-empty note. */
  hasNote?: boolean | undefined;
  /** Match tags that allow next-action promotion. */
  allowsNextAction?: boolean | undefined;
  /** Match tags that do not allow next-action promotion. */
  disallowsNextAction?: boolean | undefined;
  /** Match tags with at least one available task (availableTaskCount > 0). */
  hasAvailableTasks?: boolean | undefined;
  /** Match tags with no available tasks. */
  noAvailableTasks?: boolean | undefined;

  // ── Status ────────────────────────────────────────────────────────────────
  /** Filter by tag status (active | on-hold | dropped). */
  status?: TagStatus | undefined;

  // ── Membership ───────────────────────────────────────────────────────────
  /**
   * Exact parent tag — name or id. A tag matches if its direct parent has the
   * given name or primary key. Accepts a single value or an array (any-of).
   */
  parent?: string | string[] | undefined;
  /**
   * Ancestor tag — transitive. A tag matches if any tag in its ancestor chain
   * (parent, parent's parent, ...) has the given name or primary key.
   * Accepts a single value or an array (any-of).
   */
  ancestor?: string | string[] | undefined;

  // ── Numeric predicates ───────────────────────────────────────────────────
  availableTaskCountLt?: number | undefined;
  availableTaskCountGt?: number | undefined;
  availableTaskCountEq?: number | undefined;
  remainingTaskCountLt?: number | undefined;
  remainingTaskCountGt?: number | undefined;
  childTagCountLt?: number | undefined;
  childTagCountGt?: number | undefined;

  // ── String matching ──────────────────────────────────────────────────────
  nameContains?: string | undefined;
  nameStarts?: string | undefined;
  nameEquals?: string | undefined;
  nameRegex?: string | undefined;
  noteContains?: string | undefined;
  noteRegex?: string | undefined;
  /** Case sensitivity for string predicates. Default: `false`. */
  caseSensitive?: boolean | undefined;
}

/**
 * Project status values on the wire.
 *
 * @public
 */
export type ProjectStatus = "active" | "on-hold" | "completed" | "dropped";

/**
 * Options for querying projects. Extends {@link BaseListQueryOptions} with the
 * full predicate vocabulary supported by the OmniJS project query compiler.
 *
 * Every field is optional; only fields that are explicitly set contribute a
 * filter condition to the compiled query.
 *
 * @public
 */
export interface ProjectQueryOptions extends BaseListQueryOptions {
  // ── Boolean state predicates ─────────────────────────────────────────────
  flagged?: boolean | undefined;
  notFlagged?: boolean | undefined;
  sequential?: boolean | undefined;
  notSequential?: boolean | undefined;
  containsSingletonActions?: boolean | undefined;
  notContainsSingletonActions?: boolean | undefined;
  hasDue?: boolean | undefined;
  noDue?: boolean | undefined;
  hasDefer?: boolean | undefined;
  hasNote?: boolean | undefined;
  hasNextReview?: boolean | undefined;
  /** Projects whose nextReviewDate is non-null and <= now. */
  dueForReview?: boolean | undefined;

  // ── Status ────────────────────────────────────────────────────────────────
  status?: ProjectStatus | undefined;

  // ── Membership ───────────────────────────────────────────────────────────
  /**
   * Folder name(s) or id(s). A project matches if its folder chain
   * contains any of the named folders (transitive).
   */
  folder?: string | string[] | undefined;

  // ── Date predicates ──────────────────────────────────────────────────────
  /** Each accepts ISO 8601 or a relative expression (see `parseDate`). */
  dueBefore?: string | undefined;
  dueAfter?: string | undefined;
  /** Match projects whose dueDate falls on the given calendar day (UTC). */
  dueOn?: string | undefined;
  /** Duration string like `7d`/`1w` — `dueDate` must be within `now + duration`. */
  dueWithin?: string | undefined;

  deferBefore?: string | undefined;
  deferAfter?: string | undefined;
  deferWithin?: string | undefined;

  completedBefore?: string | undefined;
  completedAfter?: string | undefined;

  nextReviewBefore?: string | undefined;
  nextReviewAfter?: string | undefined;
  /** Duration string — nextReviewDate must be within `now + duration`. */
  nextReviewWithin?: string | undefined;

  lastReviewedBefore?: string | undefined;
  lastReviewedAfter?: string | undefined;

  // ── Numeric (task counts) ────────────────────────────────────────────────
  taskCountLt?: number | undefined;
  taskCountGt?: number | undefined;
  taskCountEq?: number | undefined;
  remainingTaskCountLt?: number | undefined;
  remainingTaskCountGt?: number | undefined;
  remainingTaskCountEq?: number | undefined;

  // ── String matching ──────────────────────────────────────────────────────
  nameContains?: string | undefined;
  nameStarts?: string | undefined;
  nameEquals?: string | undefined;
  nameRegex?: string | undefined;
  noteContains?: string | undefined;
  noteRegex?: string | undefined;
  /** Case sensitivity for string predicates. Default: `false`. */
  caseSensitive?: boolean | undefined;
}

/**
 * Folder status values mirror the OmniJS `Folder.Status` enum.
 *
 * @public
 */
export type FolderStatus = "active" | "dropped";

/**
 * Options for querying folders. Extends {@link BaseListQueryOptions} with the
 * full predicate vocabulary supported by the OmniJS folder query compiler.
 *
 * Every field is optional; only fields that are explicitly set contribute a
 * filter condition to the compiled query.
 *
 * @public
 */
export interface FolderQueryOptions extends BaseListQueryOptions {
  // ── Boolean state predicates ─────────────────────────────────────────────
  /** Matches folders with no parent (root-level folders). */
  isRoot?: boolean | undefined;
  /** Matches folders that have at least one parent. */
  notIsRoot?: boolean | undefined;
  /** Matches folders with at least one direct child project. */
  hasProjects?: boolean | undefined;
  /** Matches folders with no direct child projects. */
  noProjects?: boolean | undefined;
  /** Matches folders with at least one direct child subfolder. */
  hasSubfolders?: boolean | undefined;
  /** Matches folders with no direct child subfolders. */
  noSubfolders?: boolean | undefined;
  /** Matches folders with neither projects nor subfolders. */
  isEmpty?: boolean | undefined;

  // ── Status ───────────────────────────────────────────────────────────────
  /** Filter by folder status (`"active"` or `"dropped"`). */
  status?: FolderStatus | undefined;

  // ── Membership ───────────────────────────────────────────────────────────
  /**
   * Exact parent match — the folder's direct parent name or primary key.
   * When an array is given, semantics are "any of" (OR).
   * This is NOT transitive; use {@link FolderQueryOptions.ancestor} for that.
   */
  parent?: string | string[] | undefined;
  /**
   * Transitive ancestor match — walks the parent chain looking for any folder
   * whose name or primary key matches. When an array is given, semantics are
   * "any of" (OR) across the whole chain.
   */
  ancestor?: string | string[] | undefined;

  // ── Numeric predicates ───────────────────────────────────────────────────
  /** Direct child project count is less than this value. */
  projectCountLt?: number | undefined;
  /** Direct child project count is greater than this value. */
  projectCountGt?: number | undefined;
  /** Direct child project count equals this value. */
  projectCountEq?: number | undefined;
  /** Recursive (flattened) project count is less than this value. */
  flattenedProjectCountLt?: number | undefined;
  /** Recursive (flattened) project count is greater than this value. */
  flattenedProjectCountGt?: number | undefined;
  /** Direct child folder count is less than this value. */
  folderCountLt?: number | undefined;
  /** Direct child folder count is greater than this value. */
  folderCountGt?: number | undefined;

  // ── String matching ──────────────────────────────────────────────────────
  nameContains?: string | undefined;
  nameStarts?: string | undefined;
  nameEquals?: string | undefined;
  nameRegex?: string | undefined;
  /** Case sensitivity for string predicates. Default: `false`. */
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

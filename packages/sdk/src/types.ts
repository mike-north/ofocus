import type { CliError } from "./errors.js";

/**
 * Standard CLI output format for all commands.
 */
export interface CliOutput<T> {
  success: boolean;
  data: T | null;
  error: CliError | null;
}

// Re-export CliError for convenience
export type { CliError } from "./errors.js";

/**
 * Metadata about a CLI command for semantic activation by AI agents.
 */
export interface CommandInfo {
  name: string;
  description: string;
  usage: string;
}

/**
 * OmniFocus task representation.
 */
export interface OFTask {
  id: string;
  name: string;
  note: string | null;
  flagged: boolean;
  completed: boolean;
  dueDate: string | null;
  deferDate: string | null;
  completionDate: string | null;
  projectId: string | null;
  projectName: string | null;
  tags: string[];
  estimatedMinutes: number | null;
}

/**
 * OmniFocus project representation.
 */
export interface OFProject {
  id: string;
  name: string;
  note: string | null;
  status: "active" | "on-hold" | "completed" | "dropped";
  sequential: boolean;
  folderId: string | null;
  folderName: string | null;
  taskCount: number;
  remainingTaskCount: number;
}

/**
 * OmniFocus tag representation.
 */
export interface OFTag {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  availableTaskCount: number;
}

/**
 * OmniFocus perspective representation.
 */
export interface OFPerspective {
  id: string;
  name: string;
  /** Whether this is a built-in or user-created custom perspective. */
  kind: "builtin" | "custom";
}

/**
 * Options for adding a task to the inbox.
 */
export interface InboxOptions {
  note?: string | undefined;
  due?: string | undefined;
  defer?: string | undefined;
  flag?: boolean | undefined;
  tags?: string[] | undefined;
  estimatedMinutes?: number | undefined;
  repeat?: RepetitionRule | undefined;
}

/**
 * Common pagination options for query functions.
 */
export interface PaginationOptions {
  /** Maximum number of results to return. Defaults to 100. */
  limit?: number | undefined;
  /** Number of results to skip (for pagination). Defaults to 0. */
  offset?: number | undefined;
  /**
   * When true, return every matching item ignoring --limit/--offset. Safe for
   * queries that fit in memory; the entire match set is materialized
   * server-side. Mutually exclusive with `limit` and `offset`.
   */
  all?: boolean | undefined;
}

/**
 * Paginated result wrapper with metadata.
 */
export interface PaginatedResult<T> {
  /** The items for this page */
  items: T[];
  /** Total number of items matching the query (before pagination) */
  totalCount: number;
  /** Number of items returned in this page */
  returnedCount: number;
  /** Whether there are more items after this page */
  hasMore: boolean;
  /** The offset used for this query */
  offset: number;
  /** The limit used for this query */
  limit: number;
}

// TaskQueryOptions, ProjectQueryOptions, and TagQueryOptions live in
// `./query/types.js` alongside the rest of the query vocabulary. Re-export
// them for backwards-compatible imports from the SDK root types module.
export type {
  TaskQueryOptions,
  ProjectQueryOptions,
  TagQueryOptions,
} from "./query/types.js";

/**
 * Options for updating a task.
 */
export interface TaskUpdateOptions {
  title?: string | undefined;
  note?: string | undefined;
  due?: string | undefined;
  defer?: string | undefined;
  flag?: boolean | undefined;
  project?: string | undefined;
  tags?: string[] | undefined;
  estimatedMinutes?: number | undefined;
  clearEstimate?: boolean | undefined;
  repeat?: RepetitionRule | undefined;
  clearRepeat?: boolean | undefined;
}

/**
 * OmniFocus folder representation.
 */
export interface OFFolder {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  projectCount: number;
  folderCount: number;
}

/**
 * Options for creating a project.
 */
export interface CreateProjectOptions {
  note?: string | undefined;
  folderId?: string | undefined;
  folderName?: string | undefined;
  sequential?: boolean | undefined;
  status?: "active" | "on-hold" | undefined;
  dueDate?: string | undefined;
  deferDate?: string | undefined;
}

/**
 * Options for creating a folder.
 */
export interface CreateFolderOptions {
  parentFolderId?: string | undefined;
  parentFolderName?: string | undefined;
}

// FolderQueryOptions now lives in `./query/types.js` alongside the rest of the
// query vocabulary. Re-export it for backwards-compatible imports from the
// SDK root types module. The old narrow shape is intentionally replaced by the
// richer query-layer type.
export type { FolderQueryOptions } from "./query/types.js";

/**
 * Options for creating a tag.
 */
export interface CreateTagOptions {
  parentTagId?: string | undefined;
  parentTagName?: string | undefined;
}

/**
 * Options for updating a tag.
 */
export interface UpdateTagOptions {
  name?: string | undefined;
  parentTagId?: string | undefined;
  parentTagName?: string | undefined;
}

/**
 * OmniFocus task with hierarchy information.
 */
export interface OFTaskWithChildren extends OFTask {
  parentTaskId: string | null;
  parentTaskName: string | null;
  childTaskCount: number;
  isActionGroup: boolean;
}

// SubtaskQueryOptions has moved to `./commands/subtasks.js` where it extends
// BaseListQueryOptions with the full shared-query vocabulary. It is re-exported
// from the SDK root via index.ts for backwards-compatible imports.

/**
 * Result from a batch operation.
 */
export interface BatchResult<T> {
  succeeded: T[];
  failed: { id: string; error: string }[];
  totalSucceeded: number;
  totalFailed: number;
}

/**
 * Repetition rule for recurring tasks.
 *
 * Maps to OmniFocus's `Task.RepetitionRule` constructor:
 * `new Task.RepetitionRule(ruleString, method)`
 *
 * Supported combinations (per RFC 5545 §3.3.10):
 * - **Daily**: `{ frequency: "daily", interval: N }`
 * - **Weekly with days**: `{ frequency: "weekly", daysOfWeek: [1,3,5] }`
 *   → `FREQ=WEEKLY;BYDAY=MO,WE,FR`
 * - **Monthly by day-of-month**: `{ frequency: "monthly", dayOfMonth: 15 }`
 *   → `FREQ=MONTHLY;BYMONTHDAY=15`
 * - **Monthly by Nth weekday**: `{ frequency: "monthly", daysOfWeek: [1], daysOfWeekPositions: [1] }`
 *   → `FREQ=MONTHLY;BYDAY=1MO` (first Monday)
 * - **Monthly cross-product**: `{ frequency: "monthly", daysOfWeek: [1,3], daysOfWeekPositions: [1,-1] }`
 *   → `FREQ=MONTHLY;BYDAY=1MO,1WE,-1MO,-1WE` (first and last Monday and Wednesday)
 * - **Yearly**: `{ frequency: "yearly" }`
 * - **Yearly with months**: `{ frequency: "yearly", monthsOfYear: [3,6,9,12] }`
 *   → `FREQ=YEARLY;BYMONTH=3,6,9,12`
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
export interface RepetitionRule {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  /** How OmniFocus reschedules the task after completion. */
  repeatMethod: "due-again" | "defer-another" | "scheduled";
  daysOfWeek?: number[] | undefined;
  dayOfMonth?: number | undefined;
  /**
   * Positional prefix for BYDAY when `frequency` is `"monthly"`.
   *
   * Values must be integers in `[-5, -1] ∪ [1, 5]` (RFC 5545 allows up to
   * the 5th occurrence within a month). Positions apply to **all** listed
   * `daysOfWeek` entries — the emitted BYDAY is the cross-product.
   *
   * @example
   * `daysOfWeekPositions: [1, -1]` with `daysOfWeek: [1]` (Monday)
   * → `BYDAY=1MO,-1MO` ("first and last Monday")
   *
   * `daysOfWeekPositions: [1, -1]` with `daysOfWeek: [1, 3]` (Mon, Wed)
   * → `BYDAY=1MO,1WE,-1MO,-1WE` ("first Monday, first Wednesday, last Monday, last Wednesday")
   *
   * Only valid when `frequency` is `"monthly"`.
   */
  daysOfWeekPositions?: number[] | undefined;
  /**
   * Month-of-year values for `BYMONTH=` in YEARLY recurrences.
   *
   * Values must be integers in `[1, 12]` (1 = January, 12 = December).
   * Only valid when `frequency` is `"yearly"`.
   *
   * @example `monthsOfYear: [3, 6, 9, 12]` → `BYMONTH=3,6,9,12`
   */
  monthsOfYear?: number[] | undefined;
}

// SearchOptions has moved to `./commands/search.js` where it extends
// BaseListQueryOptions with the full shared-query vocabulary. It is re-exported
// from the SDK root via index.ts for backwards-compatible imports.

/**
 * Result from a review operation.
 */
export interface ReviewResult {
  projectId: string;
  projectName: string;
  lastReviewed: string;
  nextReviewDate: string | null;
}

/**
 * Options for updating a project.
 */
export interface UpdateProjectOptions {
  name?: string | undefined;
  note?: string | undefined;
  status?: "active" | "on-hold" | "completed" | "dropped" | undefined;
  folderId?: string | undefined;
  folderName?: string | undefined;
  sequential?: boolean | undefined;
  dueDate?: string | undefined;
  deferDate?: string | undefined;
}

/**
 * Options for updating a folder.
 */
export interface UpdateFolderOptions {
  name?: string | undefined;
  parentFolderId?: string | undefined;
  parentFolderName?: string | undefined;
}

/**
 * Options for duplicating a task.
 */
export interface DuplicateTaskOptions {
  includeSubtasks?: boolean | undefined;
}

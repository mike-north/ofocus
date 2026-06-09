/**
 * Enriched task and project queries — wrapping-SDK surface (spec §5).
 *
 * This module has two distinct layers:
 *
 * 1. **Pure assemblers** (`enrichTasks`, `enrichProjects`) — accept raw data
 *    (fetched by the caller) and derive the extra fields. No I/O, fully
 *    testable offline.
 *
 * 2. **I/O wrappers** (`queryTasksEnriched`, `queryProjectsEnriched`) — thin
 *    orchestration that calls the SDK query functions, gathers relational
 *    facts, runs the assemblers, and returns a `CliOutput<QueryResult<…>>`.
 *    All OmniFocus I/O is injected via a `*Deps` object (default = real SDK
 *    functions) following the same pattern as `digests.ts`.
 *
 * Conventions:
 * - Dates are reasoned about against the UTC calendar; lexical ISO comparison
 *   is correct for canonical UTC instants.
 * - `exactOptionalPropertyTypes` is respected throughout.
 */
import type {
  CliOutput,
  OFProject,
  OFTask,
  QueryResult,
  TaskQueryOptions,
  ProjectQueryOptions,
} from "@ofocus/sdk";
import {
  ErrorCode,
  createError,
  failure,
  queryProjects,
  queryTasks,
  success,
} from "@ofocus/sdk";
import {
  blockedReason,
  effectiveStatus,
  projectHealth,
} from "../derived/compute.js";
import { markNextActions } from "../derived/next-action.js";
import { fetchRelationalFacts } from "../derived/relational.js";
import type { EnrichedProject, EnrichedTask } from "../derived/types.js";

// ── Shared local fact types ──────────────────────────────────────────────────

/**
 * Per-project facts needed by the enrichment assembler.
 *
 * `status` and `sequential` come from the project query; `deferInFuture` is
 * derived from the project's `effectiveDeferDate` field.
 *
 * @public
 */
export interface ProjectFacts {
  status: "active" | "on-hold" | "completed" | "dropped";
  deferInFuture: boolean;
  sequential: boolean;
}

/**
 * Per-task relational facts (re-exported for consumer convenience).
 *
 * Mirrors the `RelationalFacts` interface from `../derived/relational.js`
 * minus the `taskId` field (the map key carries the id).
 */
export interface TaskRelationalFacts {
  hasIncompleteSequentialPredecessor: boolean;
  hasIncompleteChildren: boolean;
}

// ── Raw task shape expected by the assembler ─────────────────────────────────

/**
 * The raw task fields the assembler needs.
 *
 * These are a subset of the fields returned when `queryTasks` is called with
 * an explicit `fields` list including `taskStatus`, `effectivelyCompleted`,
 * `effectivelyDropped`, `deferDate`, and `effectiveDeferDate`.
 *
 * We use a structural intersection rather than extending `OFTask` directly
 * because the base `OFTask` type does not include these opt-in fields.
 */
export type RawEnrichableTask = OFTask & {
  taskStatus: string;
  effectivelyCompleted: boolean;
  effectivelyDropped: boolean;
  deferDate: string | null;
  effectiveDeferDate: string | null;
};

// ── Pure assemblers ──────────────────────────────────────────────────────────

/**
 * Pure assembler: compute derived fields for a list of raw tasks.
 *
 * For each raw task:
 * 1. Compute `effectiveStatus` via `compute.effectiveStatus`.
 * 2. Compute `ownDeferInFuture` by lexically comparing the task's `deferDate`
 *    (falling back to `effectiveDeferDate`) against `nowIso`.
 * 3. Look up the task's project facts from `projectFacts`.
 * 4. Look up the task's relational facts from `relational`.
 * 5. Assemble `blockedReason` only when `effectiveStatus === "blocked"`;
 *    otherwise use an empty array (spec §5).
 * 6. After all effective-statuses are computed, run `markNextActions` over
 *    the id/projectId/effectiveStatus tuples and attach `isNextAction`.
 *
 * @param rawTasks - Tasks with the extra opt-in fields (see `RawEnrichableTask`).
 * @param projectFacts - Map from project id → `ProjectFacts`.
 * @param relational - Map from task id → `TaskRelationalFacts`.
 * @param nowIso - The current instant as a UTC ISO 8601 string; used to
 *   determine whether a defer date is in the future.
 *
 * @public
 */
export function enrichTasks(
  rawTasks: readonly RawEnrichableTask[],
  projectFacts: ReadonlyMap<string, ProjectFacts>,
  relational: ReadonlyMap<string, TaskRelationalFacts>,
  nowIso: string
): EnrichedTask[] {
  // First pass: compute effective status and blocked reasons per task.
  const partials: {
    raw: RawEnrichableTask;
    effectiveStatus: EnrichedTask["effectiveStatus"];
    blockedReason: EnrichedTask["blockedReason"];
  }[] = rawTasks.map((raw) => {
    const es = effectiveStatus({
      taskStatus: raw.taskStatus,
      effectivelyCompleted: raw.effectivelyCompleted,
      effectivelyDropped: raw.effectivelyDropped,
    });

    // Determine if the task's own defer date is in the future.
    const deferDateIso = raw.effectiveDeferDate ?? raw.deferDate;
    const ownDeferInFuture = deferDateIso !== null && deferDateIso > nowIso;

    // Look up project and relational facts (fall back to neutral values when
    // the task has no project or no relational record).
    const pFacts =
      raw.projectId !== null ? projectFacts.get(raw.projectId) : undefined;

    const rFacts = relational.get(raw.id) ?? {
      hasIncompleteSequentialPredecessor: false,
      hasIncompleteChildren: false,
    };

    // Assemble blocked reasons only when the task is actually blocked.
    const reasons: EnrichedTask["blockedReason"] =
      es === "blocked"
        ? blockedReason({
            projectStatus: pFacts?.status ?? null,
            projectDeferInFuture: pFacts?.deferInFuture ?? false,
            ownDeferInFuture,
            hasIncompleteSequentialPredecessor:
              rFacts.hasIncompleteSequentialPredecessor,
            hasIncompleteChildren: rFacts.hasIncompleteChildren,
          })
        : [];

    return { raw, effectiveStatus: es, blockedReason: reasons };
  });

  // Second pass: determine next-action flags using the now-known effective
  // statuses.
  const naInput = partials.map(({ raw, effectiveStatus: es }) => ({
    id: raw.id,
    projectId: raw.projectId,
    effectiveStatus: es,
  }));
  const naFlags = markNextActions(naInput);

  // Assemble the final enriched tasks.
  return partials.map(
    ({ raw, effectiveStatus: es, blockedReason: reasons }) => ({
      ...raw,
      effectiveStatus: es,
      blockedReason: reasons,
      isNextAction: naFlags[raw.id] ?? false,
    })
  );
}

/**
 * Pure assembler: attach `projectHealth` derived fields to raw projects.
 *
 * The raw projects must have been requested with `availableTaskCount` and
 * `remainingTaskCount` as opt-in fields (these are not in the default
 * `OFProject` projection).
 *
 * @param rawProjects - Projects extended with `availableTaskCount`.
 *
 * @public
 */
export function enrichProjects(
  rawProjects: readonly (OFProject & { availableTaskCount: number })[]
): EnrichedProject[] {
  return rawProjects.map((raw) => {
    const health = projectHealth({
      status: raw.status,
      remainingTaskCount: raw.remainingTaskCount,
      availableTaskCount: raw.availableTaskCount,
    });
    return {
      ...raw,
      availableTaskCount: raw.availableTaskCount,
      stalled: health.stalled,
      empty: health.empty,
    };
  });
}

// ── I/O wrappers (orchestration) ─────────────────────────────────────────────

/**
 * Fields requested from `queryTasks` by `queryTasksEnriched`.
 *
 * These are the base `OFTask` fields plus the opt-in fields that the
 * assembler needs (`taskStatus`, `effectivelyCompleted`, `effectivelyDropped`,
 * `effectiveDeferDate`).
 */
const ENRICHED_TASK_FIELDS: readonly string[] = [
  "id",
  "name",
  "taskStatus",
  "effectivelyCompleted",
  "effectivelyDropped",
  "deferDate",
  "effectiveDeferDate",
  "projectId",
  "projectName",
  "note",
  "flagged",
  "completed",
  "dueDate",
  "completionDate",
  "tags",
  "estimatedMinutes",
];

/**
 * Fields requested from `queryProjects` by `queryTasksEnriched` when
 * gathering per-project facts.
 */
const PROJECT_FACTS_FIELDS: readonly string[] = [
  "id",
  "status",
  "effectiveDeferDate",
  "sequential",
];

/**
 * Fields requested from `queryProjects` by `queryProjectsEnriched`.
 */
const ENRICHED_PROJECT_FIELDS: readonly string[] = [
  "id",
  "name",
  "note",
  "status",
  "sequential",
  "folderId",
  "folderName",
  "taskCount",
  "remainingTaskCount",
  "availableTaskCount",
];

/**
 * Injected dependencies for `queryTasksEnriched`.
 *
 * Default values are the real SDK functions. Pass mock implementations in
 * tests to run offline.
 */
export interface QueryTasksEnrichedDeps {
  /** Calls the SDK task query. */
  queryTasks: typeof queryTasks;
  /** Calls the SDK project query (used to gather per-project facts). */
  queryProjects: typeof queryProjects;
  /** Fetches relational facts for a list of task ids. */
  fetchRelationalFacts: typeof fetchRelationalFacts;
  /** The current instant as a UTC ISO 8601 string. */
  now: string;
}

/**
 * Injected dependencies for `queryProjectsEnriched`.
 */
export interface QueryProjectsEnrichedDeps {
  /** Calls the SDK project query. */
  queryProjects: typeof queryProjects;
}

/**
 * Extract the item list from a `QueryResult`. Always returns a flat array;
 * non-list shapes yield `[]` rather than throwing.
 */
function itemsOf<T>(result: QueryResult<T>): T[] {
  return result.kind === "list" ? result.items : [];
}

/**
 * Propagate a failure from a sub-query, falling back to a generic error when
 * the SDK omits one.
 */
function propagateFailure<T>(
  error: ReturnType<typeof createError> | null,
  message: string
): CliOutput<T> {
  return failure<T>(error ?? createError(ErrorCode.UNKNOWN_ERROR, message));
}

/**
 * Query tasks from OmniFocus and return them enriched with derived fields.
 *
 * Orchestration:
 * 1. Fetch raw tasks via `deps.queryTasks` with the needed opt-in fields.
 * 2. Collect the distinct set of project ids from the result.
 * 3. Fetch per-project facts via `deps.queryProjects`.
 * 4. Fetch relational facts for all task ids via `deps.fetchRelationalFacts`.
 * 5. Run `enrichTasks` (pure assembler).
 * 6. Return `CliOutput<QueryResult<EnrichedTask>>` in list shape.
 *
 * All OmniFocus I/O goes through `deps`, defaulting to the real SDK functions,
 * so the pure logic is testable offline.
 *
 * @public
 */
export async function queryTasksEnriched(
  options: TaskQueryOptions = {},
  deps: QueryTasksEnrichedDeps = {
    queryTasks,
    queryProjects,
    fetchRelationalFacts,
    now: new Date().toISOString(),
  }
): Promise<CliOutput<QueryResult<EnrichedTask>>> {
  // ── 1. Fetch raw tasks (with opt-in derived fields) ────────────────────────
  const rawResult = await deps.queryTasks({
    ...options,
    fields: [...ENRICHED_TASK_FIELDS],
    all: options.all ?? true,
  });

  if (!rawResult.success || rawResult.data === null) {
    return propagateFailure(rawResult.error, "Failed to query tasks");
  }

  const rawItems = itemsOf(rawResult.data) as RawEnrichableTask[];

  if (rawItems.length === 0) {
    return success<QueryResult<EnrichedTask>>({
      kind: "list",
      items: [],
      totalCount: 0,
      returnedCount: 0,
      hasMore: false,
      offset: 0,
      limit: rawResult.data.kind === "list" ? rawResult.data.limit : 100,
    });
  }

  // ── 2. Gather distinct project ids from the task set ───────────────────────
  const projectIds = [
    ...new Set(
      rawItems.map((t) => t.projectId).filter((id): id is string => id !== null)
    ),
  ];

  // ── 3. Fetch per-project facts ─────────────────────────────────────────────
  const projectFactsMap = new Map<string, ProjectFacts>();

  if (projectIds.length > 0) {
    const projResult = await deps.queryProjects({
      fields: [...PROJECT_FACTS_FIELDS],
      all: true,
    });

    if (!projResult.success || projResult.data === null) {
      return propagateFailure(
        projResult.error,
        "Failed to query projects for enrichment"
      );
    }

    const projItems = itemsOf(projResult.data) as (OFProject & {
      effectiveDeferDate?: string | null;
    })[];
    const nowIso = deps.now;

    for (const proj of projItems) {
      const deferIso = proj.effectiveDeferDate ?? null;
      projectFactsMap.set(proj.id, {
        status: proj.status,
        deferInFuture: deferIso !== null && deferIso > nowIso,
        sequential: proj.sequential,
      });
    }
  }

  // ── 4. Fetch relational facts ──────────────────────────────────────────────
  const allTaskIds = rawItems.map((t) => t.id);
  const relationalResult = await deps.fetchRelationalFacts(allTaskIds);

  const relationalMap = new Map<string, TaskRelationalFacts>();
  if (relationalResult.success && relationalResult.data !== null) {
    for (const rf of relationalResult.data) {
      relationalMap.set(rf.taskId, {
        hasIncompleteSequentialPredecessor:
          rf.hasIncompleteSequentialPredecessor,
        hasIncompleteChildren: rf.hasIncompleteChildren,
      });
    }
  }
  // Relational facts are best-effort; a failure leaves the map empty and
  // `enrichTasks` falls back to neutral values (no predecessor, no children).

  // ── 5. Assemble enriched tasks ─────────────────────────────────────────────
  const enriched = enrichTasks(
    rawItems,
    projectFactsMap,
    relationalMap,
    deps.now
  );

  // ── 6. Return in list shape ─────────────────────────────────────────────────
  const baseResult = rawResult.data;
  return success<QueryResult<EnrichedTask>>({
    kind: "list",
    items: enriched,
    totalCount:
      baseResult.kind === "list" ? baseResult.totalCount : enriched.length,
    returnedCount: enriched.length,
    hasMore: baseResult.kind === "list" ? baseResult.hasMore : false,
    offset: baseResult.kind === "list" ? baseResult.offset : 0,
    limit: baseResult.kind === "list" ? baseResult.limit : 100,
  });
}

/**
 * Query projects from OmniFocus and return them enriched with `stalled` and
 * `empty` health indicators.
 *
 * Orchestration: fetch projects with `availableTaskCount` + `remainingTaskCount`
 * opt-in fields, run `enrichProjects` (pure assembler), return
 * `CliOutput<QueryResult<EnrichedProject>>` in list shape.
 *
 * @public
 */
export async function queryProjectsEnriched(
  options: ProjectQueryOptions = {},
  deps: QueryProjectsEnrichedDeps = {
    queryProjects,
  }
): Promise<CliOutput<QueryResult<EnrichedProject>>> {
  const rawResult = await deps.queryProjects({
    ...options,
    fields: [...ENRICHED_PROJECT_FIELDS],
    all: options.all ?? true,
  });

  if (!rawResult.success || rawResult.data === null) {
    return propagateFailure(rawResult.error, "Failed to query projects");
  }

  const rawItems = itemsOf(rawResult.data) as (OFProject & {
    availableTaskCount: number;
  })[];

  const enriched = enrichProjects(rawItems);

  const baseResult = rawResult.data;
  return success<QueryResult<EnrichedProject>>({
    kind: "list",
    items: enriched,
    totalCount:
      baseResult.kind === "list" ? baseResult.totalCount : enriched.length,
    returnedCount: enriched.length,
    hasMore: baseResult.kind === "list" ? baseResult.hasMore : false,
    offset: baseResult.kind === "list" ? baseResult.offset : 0,
    limit: baseResult.kind === "list" ? baseResult.limit : 100,
  });
}

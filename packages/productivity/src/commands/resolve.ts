/**
 * `resolve` — turn a fuzzy human reference into a concrete OmniFocus entity.
 *
 * The command ranks the candidate set for the requested kind with the
 * deterministic fuzzy scorer ({@link rankCandidates}) and classifies the
 * outcome ({@link classify}) into one of three shapes:
 *
 * - **resolved**: a single high-confidence match that clearly beats the runner-up.
 * - **ambiguous**: a tight ranked candidate set the caller must choose from.
 * - **none**: nothing crossed the floor; the top few are returned as suggestions.
 *
 * `--kind temporal-anchor` is special: it scans repeating tasks, resolves the
 * reference to one of them, and attaches that task's *next* occurrence (via the
 * recurrence engine) so a caller can anchor a relative phrase like "next
 * stand-up" to a real instant. When nothing matches it returns a `none` result
 * with a note hinting the reference may be a calendar event instead.
 *
 * All OmniFocus I/O is pushed behind injected {@link ResolveDeps} so the pure
 * ranking/classification logic is fully testable offline.
 */
import { z } from "zod";
import {
  type CliOutput,
  ErrorCode,
  createError,
  defineCommand,
  failure,
  queryFolders,
  queryProjects,
  queryTags,
  queryTasks,
  success,
} from "@ofocus/sdk";
import { RANK_THRESHOLDS, classify, rankCandidates } from "../resolve/rank.js";
import type {
  DisambiguationResult,
  ResolveCandidate,
  ResolvedAnchor,
} from "../resolve/types.js";
import { methodMap } from "./next-occurrences.js";
import { type TaskRule, scanRepeatingTasks } from "../recurrence/scan-rule.js";
import { parseRRule } from "../recurrence/parse.js";
import { expandOccurrences } from "../recurrence/expand.js";

/**
 * Result of the `resolve` command: a disambiguation over plain entity
 * candidates, or over temporal anchors (which carry a next occurrence).
 *
 * @public
 */
export type ResolveOutput =
  | DisambiguationResult<ResolveCandidate>
  | DisambiguationResult<ResolvedAnchor>;

/**
 * Dependencies for {@link runResolve}; the descriptor injects query-backed
 * implementations. Each entity fetcher returns a {@link CliOutput} so a failed
 * underlying query (e.g. OmniFocus is not running) can be propagated as a
 * failure rather than silently treated as an empty candidate set.
 *
 * @public
 */
export interface ResolveDeps {
  fetchProjects: () => Promise<CliOutput<ResolveCandidate[]>>;
  fetchTasks: () => Promise<CliOutput<ResolveCandidate[]>>;
  fetchTags: () => Promise<CliOutput<ResolveCandidate[]>>;
  fetchFolders: () => Promise<CliOutput<ResolveCandidate[]>>;
  resolveAnchor: (
    query: string,
    limit: number,
  ) => Promise<DisambiguationResult<ResolvedAnchor>>;
}

/** Input accepted by {@link runResolve}. */
interface ResolveInput {
  query?: string | undefined;
  kind?:
    | "project"
    | "task"
    | "tag"
    | "folder"
    | "temporal-anchor"
    | "any"
    | undefined;
  limit?: number | undefined;
}

/**
 * Core handler. `deps` is injected in tests; the descriptor passes the real
 * query-backed fetchers and anchor resolver.
 */
export async function runResolve(
  input: ResolveInput,
  deps: ResolveDeps,
): Promise<CliOutput<ResolveOutput>> {
  const query = (input.query ?? "").trim();
  if (query.length === 0) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "resolve requires a non-empty query",
      ),
    );
  }
  const kind = input.kind ?? "project";
  const limit = input.limit ?? RANK_THRESHOLDS.limit;

  if (kind === "temporal-anchor") {
    // scanRepeatingTasks() throws when OmniFocus is not reachable; wrap so the
    // command always returns a CliOutput rather than a rejected promise.
    try {
      return success(await deps.resolveAnchor(query, limit));
    } catch (e) {
      return failure(
        createError(
          ErrorCode.UNKNOWN_ERROR,
          e instanceof Error ? e.message : "resolve failed",
        ),
      );
    }
  }

  let res: CliOutput<ResolveCandidate[]>;
  if (kind === "any") {
    const p = await deps.fetchProjects();
    if (!p.success || p.data === null) {
      return failure(
        p.error ?? createError(ErrorCode.UNKNOWN_ERROR, "project query failed"),
      );
    }
    const t = await deps.fetchTasks();
    if (!t.success || t.data === null) {
      return failure(
        t.error ?? createError(ErrorCode.UNKNOWN_ERROR, "task query failed"),
      );
    }
    res = success([...p.data, ...t.data]);
  } else {
    switch (kind) {
      case "project":
        res = await deps.fetchProjects();
        break;
      case "task":
        res = await deps.fetchTasks();
        break;
      case "tag":
        res = await deps.fetchTags();
        break;
      case "folder":
        res = await deps.fetchFolders();
        break;
    }
  }
  if (!res.success || res.data === null) {
    return failure(
      res.error ?? createError(ErrorCode.UNKNOWN_ERROR, "entity query failed"),
    );
  }
  const ranked = rankCandidates(query, res.data, { limit });
  return success(classify(ranked, RANK_THRESHOLDS));
}

/**
 * Build the temporal-anchor resolver from injected deps (testable).
 *
 * Ranks the repeating-task set against the query, and on a confident match
 * enriches the result with that task's next occurrence (parsing the RRULE and
 * expanding one occurrence from `now`). Ambiguous/none candidates carry a
 * `null` next occurrence (we only do the recurrence work once we are confident).
 */
export function buildAnchorResolver(deps: {
  scanRepeatingTasks: () => Promise<TaskRule[]>;
  now: string;
}): (
  query: string,
  limit: number,
) => Promise<DisambiguationResult<ResolvedAnchor>> {
  return async (query, limit) => {
    const tasks = await deps.scanRepeatingTasks();
    const candidates = tasks.map<ResolveCandidate>((t) => ({
      id: t.id,
      name: t.name,
      kind: "task",
      score: 0,
    }));
    const ranked = rankCandidates(query, candidates, { limit });
    const result = classify(ranked, RANK_THRESHOLDS);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const withAnchor = (c: ResolveCandidate): ResolvedAnchor => {
      const t = byId.get(c.id);
      if (t?.ruleString == null) {
        return { ...c, nextOccurrence: null };
      }
      const rule = parseRRule(t.ruleString, methodMap(t.method));
      if (rule === null) {
        return { ...c, nextOccurrence: null };
      }
      const anchor = t.dueDate ?? t.deferDate ?? deps.now;
      const next = expandOccurrences(rule, anchor, 1, { fromISO: deps.now })[0] ?? null;
      return { ...c, nextOccurrence: next };
    };
    if (result.status === "resolved") {
      return {
        status: "resolved",
        resolved: withAnchor(result.resolved),
        confidence: "high",
      };
    }
    if (result.status === "ambiguous") {
      return {
        status: "ambiguous",
        candidates: result.candidates.map((c) => ({
          ...c,
          nextOccurrence: null,
        })),
      };
    }
    return {
      status: "none",
      suggestions: result.suggestions.map((c) => ({
        ...c,
        nextOccurrence: null,
      })),
      note: "No repeating OmniFocus task matched; this may be a calendar event — resolve it with your calendar tool.",
    };
  };
}

/**
 * Extract the item list from a {@link QueryResult}-shaped payload. The resolve
 * fetchers always request the default (list) shape, so any other discriminant
 * yields an empty list rather than throwing. Mirrors `digests.ts`'s `itemsOf`,
 * but is generic over the four entity types.
 */
function itemsOf<T>(data: { kind: string }): T[] {
  return data.kind === "list"
    ? (data as unknown as { items: T[] }).items
    : [];
}

/** Production dependencies backed by the SDK queries. */
function realDeps(): ResolveDeps {
  return {
    fetchProjects: async () => {
      const res = await queryProjects({ all: true });
      if (!res.success || res.data === null) {
        return failure(
          res.error ??
            createError(ErrorCode.UNKNOWN_ERROR, "failed to query projects"),
        );
      }
      return success(
        itemsOf<{ id: string; name: string; folderName: string | null }>(
          res.data,
        ).map((p) => ({
          id: p.id,
          name: p.name,
          kind: "project" as const,
          score: 0,
          ...(p.folderName ? { context: p.folderName } : {}),
        })),
      );
    },
    fetchTasks: async () => {
      const res = await queryTasks({ all: true, notCompleted: true });
      if (!res.success || res.data === null) {
        return failure(
          res.error ??
            createError(ErrorCode.UNKNOWN_ERROR, "failed to query tasks"),
        );
      }
      return success(
        itemsOf<{ id: string; name: string; projectName: string | null }>(
          res.data,
        ).map((t) => ({
          id: t.id,
          name: t.name,
          kind: "task" as const,
          score: 0,
          ...(t.projectName ? { context: t.projectName } : {}),
        })),
      );
    },
    fetchTags: async () => {
      const res = await queryTags({ all: true });
      if (!res.success || res.data === null) {
        return failure(
          res.error ??
            createError(ErrorCode.UNKNOWN_ERROR, "failed to query tags"),
        );
      }
      return success(
        itemsOf<{ id: string; name: string; parentName: string | null }>(
          res.data,
        ).map((t) => ({
          id: t.id,
          name: t.name,
          kind: "tag" as const,
          score: 0,
          ...(t.parentName ? { context: t.parentName } : {}),
        })),
      );
    },
    fetchFolders: async () => {
      const res = await queryFolders({ all: true });
      if (!res.success || res.data === null) {
        return failure(
          res.error ??
            createError(ErrorCode.UNKNOWN_ERROR, "failed to query folders"),
        );
      }
      return success(
        itemsOf<{
          id: string;
          name: string;
          parentName?: string | null;
        }>(res.data).map((f) => ({
          id: f.id,
          name: f.name,
          kind: "folder" as const,
          score: 0,
          ...(f.parentName ? { context: f.parentName } : {}),
        })),
      );
    },
    resolveAnchor: buildAnchorResolver({
      scanRepeatingTasks,
      now: new Date().toISOString(),
    }),
  };
}

/**
 * Centralized descriptor for the `resolve` command.
 *
 * Drives the CLI subcommand `resolve` and the MCP tool `resolve`; docs +
 * catalog pick it up from `productivityDescriptors`.
 *
 * @public
 */
export const resolveDescriptor = defineCommand({
  name: "resolve",
  cliName: "resolve",
  mcpName: "resolve",
  description:
    "Resolve a fuzzy reference to an OmniFocus entity. Returns a confidently " +
    "resolved match, a tight ranked candidate set (ambiguous), or none. " +
    "--kind temporal-anchor matches a repeating task and returns its next occurrence.",
  cliPositional: ["query"],
  inputSchema: z.object({
    query: z
      .string()
      .describe("Fuzzy reference, e.g. 'Project Falcon' or 'next stand-up'"),
    kind: z
      .enum(["project", "task", "tag", "folder", "temporal-anchor", "any"])
      .optional()
      .describe("What to resolve (default: project; 'any' = project + task)"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max candidates (default 5)"),
  }),
  handler: async (parsed): Promise<CliOutput<ResolveOutput>> =>
    runResolve(parsed, realDeps()),
});

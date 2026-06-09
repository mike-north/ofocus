/**
 * `next-actions` — the single next actionable task per active project
 * ("the one thing to do in each project") (spec §6).
 *
 * Returns a decision-ready list of tasks where `isNextAction === true`: one per
 * project, the first available task in order. The result is intentionally
 * minimal — just enough to act on (id, name, projectId, projectName, dueDate).
 *
 * All OmniFocus I/O goes through the injected `queryTasksEnriched` dep so the
 * pure filtering logic is testable offline, following the same pattern as
 * `digests.ts`, `readiness.ts`, and `stalled-projects.ts`.
 *
 * @see docs/specs/2026-06-08-ofocus-derived-state-design.md §6
 */
import { z } from "zod";
import {
  type CliOutput,
  type TaskQueryOptions,
  type QueryResult,
  defineCommand,
} from "@ofocus/sdk";
import type { EnrichedTask } from "../derived/types.js";
import { queryTasksEnriched as realQueryTasksEnriched } from "./enriched.js";

/**
 * Decision-ready shape for a next action task (spec §6).
 *
 * Carries just enough to understand the task and take action: identity,
 * project placement, and an optional due date for urgency assessment.
 *
 * @public
 */
export interface NextAction {
  /** The task's primary-key id. */
  id: string;
  /** The task's name. */
  name: string;
  /** The containing project's id, or `null` for inbox tasks. */
  projectId: string | null;
  /** The containing project's name, or `null` for inbox tasks. */
  projectName: string | null;
  /** The task's due date as an ISO 8601 string, or `null` if none. */
  dueDate: string | null;
}

/** The output payload of `runNextActions`. */
export interface NextActionsOutput {
  /** Decision-ready next-action tasks, one per project. */
  actions: NextAction[];
  /** Total number of next actions returned. */
  count: number;
}

/**
 * Injected dependencies for {@link runNextActions}.
 *
 * The descriptor passes the real `queryTasksEnriched`; tests inject a fake
 * that returns a pre-built `CliOutput<QueryResult<EnrichedTask>>`.
 *
 * @public
 */
export interface NextActionsDeps {
  /** Fetches enriched tasks from OmniFocus. */
  queryTasksEnriched: (
    options?: TaskQueryOptions
  ) => Promise<CliOutput<QueryResult<EnrichedTask>>>;
}

/**
 * Core handler for `next-actions`.
 *
 * Calls `queryTasksEnriched`, filters to tasks where `isNextAction === true`,
 * maps to a {@link NextAction} decision-ready shape, and returns a
 * `CliOutput<NextActionsOutput>`. Failures from the fetcher are propagated
 * unchanged.
 *
 * @param deps - Injectable dependencies; defaults to the real SDK-backed fetcher.
 *
 * @public
 */
export async function runNextActions(
  deps: NextActionsDeps = {
    queryTasksEnriched: realQueryTasksEnriched,
  }
): Promise<CliOutput<NextActionsOutput>> {
  const result = await deps.queryTasksEnriched({});

  if (!result.success || result.data === null) {
    return {
      success: false,
      data: null,
      error: result.error,
    };
  }

  const items = result.data.kind === "list" ? result.data.items : [];

  const actions: NextAction[] = items
    .filter((t) => t.isNextAction)
    .map((t) => ({
      id: t.id,
      name: t.name,
      projectId: t.projectId,
      projectName: t.projectName,
      dueDate: t.dueDate,
    }));

  return {
    success: true,
    data: { actions, count: actions.length },
    error: null,
  };
}

/**
 * Centralized descriptor for the `next-actions` command.
 *
 * Drives the CLI subcommand `next-actions` and the MCP tool `next_actions`.
 * Returns the single next actionable task per active project, formatted for
 * immediate decision-making.
 *
 * @public
 */
export const nextActionsDescriptor = defineCommand({
  name: "nextActions",
  cliName: "next-actions",
  mcpName: "next_actions",
  description:
    "The single next actionable task per active project — the one thing " +
    "to do in each project. Returns a decision-ready list with task name, " +
    "project, and due date so you can immediately act on each project.",
  cliPositional: [],
  inputSchema: z.object({}),
  handler: async (): Promise<CliOutput<NextActionsOutput>> => runNextActions(),
});

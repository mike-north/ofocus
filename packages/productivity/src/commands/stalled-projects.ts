/**
 * `stalled-projects` — active projects where all remaining work is blocked
 * (spec §6).
 *
 * Returns a decision-ready list of projects where `stalled === true`: real
 * work exists but every task is unavailable. The result is intentionally
 * minimal — just enough to act on (id, name, folder, remaining count).
 *
 * All OmniFocus I/O goes through the injected `queryProjectsEnriched` dep so
 * the pure filtering logic is testable offline, following the same pattern as
 * `digests.ts` and `readiness.ts`.
 *
 * @see docs/specs/2026-06-08-ofocus-derived-state-design.md §6
 */
import { z } from "zod";
import {
  type CliOutput,
  type ProjectQueryOptions,
  type QueryResult,
  defineCommand,
} from "@ofocus/sdk";
import type { EnrichedProject } from "../derived/types.js";
import { queryProjectsEnriched as realQueryProjectsEnriched } from "./enriched.js";

/**
 * Decision-ready shape for a stalled project (spec §6).
 *
 * Carries just enough to understand the project and take action: identity,
 * organisational placement, and the count of remaining (blocked) tasks.
 *
 * @public
 */
export interface StalledProject {
  /** The project's primary-key id. */
  id: string;
  /** The project's name. */
  name: string;
  /** The containing folder's name, or `null` when the project is top-level. */
  folderName: string | null;
  /** Number of remaining (incomplete) tasks — all blocked when stalled. */
  remainingTaskCount: number;
}

/** The output payload of `runStalledProjects`. */
export interface StalledProjectsOutput {
  /** Decision-ready stalled projects. */
  projects: StalledProject[];
  /** Total number of stalled projects returned. */
  count: number;
}

/**
 * Injected dependencies for {@link runStalledProjects}.
 *
 * The descriptor passes the real `queryProjectsEnriched`; tests inject a fake
 * that returns a pre-built `CliOutput<QueryResult<EnrichedProject>>`.
 *
 * @public
 */
export interface StalledProjectsDeps {
  /** Fetches enriched projects from OmniFocus. */
  queryProjectsEnriched: (
    options?: ProjectQueryOptions
  ) => Promise<CliOutput<QueryResult<EnrichedProject>>>;
}

/**
 * Core handler for `stalled-projects`.
 *
 * Calls `queryProjectsEnriched`, filters to projects where `stalled === true`,
 * maps to a {@link StalledProject} decision-ready shape, and returns a
 * `CliOutput<StalledProjectsOutput>`. Failures from the fetcher are propagated
 * unchanged.
 *
 * @param deps - Injectable dependencies; defaults to the real SDK-backed fetcher.
 *
 * @public
 */
export async function runStalledProjects(
  deps: StalledProjectsDeps = {
    queryProjectsEnriched: realQueryProjectsEnriched,
  }
): Promise<CliOutput<StalledProjectsOutput>> {
  const result = await deps.queryProjectsEnriched({});

  if (!result.success || result.data === null) {
    return {
      success: false,
      data: null,
      error: result.error,
    };
  }

  const items = result.data.kind === "list" ? result.data.items : [];

  const projects: StalledProject[] = items
    .filter((p) => p.stalled)
    .map((p) => ({
      id: p.id,
      name: p.name,
      folderName: p.folderName,
      remainingTaskCount: p.remainingTaskCount,
    }));

  return {
    success: true,
    data: { projects, count: projects.length },
    error: null,
  };
}

/**
 * Centralized descriptor for the `stalled-projects` command.
 *
 * Drives the CLI subcommand `stalled-projects` and the MCP tool
 * `stalled_projects`. Returns active projects where all remaining work is
 * blocked, formatted for immediate decision-making.
 *
 * @public
 */
export const stalledProjectsDescriptor = defineCommand({
  name: "stalledProjects",
  cliName: "stalled-projects",
  mcpName: "stalled_projects",
  description:
    "Active projects where all remaining work is blocked (stalled). " +
    "Returns a decision-ready list with project name, folder, and " +
    "remaining task count so you can unblock or defer each project.",
  cliPositional: [],
  inputSchema: z.object({}),
  handler: async (): Promise<CliOutput<StalledProjectsOutput>> =>
    runStalledProjects(),
});

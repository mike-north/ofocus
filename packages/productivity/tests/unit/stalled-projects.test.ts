/**
 * Tests for `runStalledProjects` — filters enriched projects to those where
 * `stalled === true` and returns them in a decision-ready shape.
 *
 * Expected values are hand-derived from spec §6, not captured from output.
 *
 * @see docs/specs/2026-06-08-ofocus-derived-state-design.md §6
 */
import { describe, it, expect } from "vitest";
import type { CliOutput, OFProject, QueryResult } from "@ofocus/sdk";
import type { EnrichedProject } from "../../src/derived/types.js";
import {
  runStalledProjects,
  type StalledProject,
  type StalledProjectsDeps,
} from "../../src/commands/stalled-projects.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal OFProject extended with enriched fields. */
function makeEnrichedProject(
  overrides: Partial<
    OFProject & { availableTaskCount: number; stalled: boolean; empty: boolean }
  > = {}
): EnrichedProject {
  return {
    id: "proj",
    name: "Test Project",
    note: null,
    status: "active",
    sequential: false,
    folderId: null,
    folderName: null,
    taskCount: 3,
    remainingTaskCount: 3,
    availableTaskCount: 0,
    stalled: false,
    empty: false,
    ...overrides,
  };
}

/** Build a fake `queryProjectsEnriched` that returns the provided projects. */
function makeFakeFetcher(
  projects: EnrichedProject[]
): StalledProjectsDeps["queryProjectsEnriched"] {
  return async () => ({
    success: true,
    data: {
      kind: "list" as const,
      items: projects,
      totalCount: projects.length,
      returnedCount: projects.length,
      hasMore: false,
      offset: 0,
      limit: 100,
    },
    error: null,
  });
}

/** Build a fake `queryProjectsEnriched` that returns a failure. */
function makeFailingFetcher(): StalledProjectsDeps["queryProjectsEnriched"] {
  return async () => ({
    success: false,
    data: null,
    error: {
      code: "UNKNOWN_ERROR" as const,
      message: "fetch failed",
    },
  });
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const STALLED_PROJECT = makeEnrichedProject({
  id: "stalled-1",
  name: "Stalled Project",
  folderName: "Work",
  remainingTaskCount: 5,
  availableTaskCount: 0,
  stalled: true,
  empty: false,
});

const EMPTY_PROJECT = makeEnrichedProject({
  id: "empty-1",
  name: "Empty Project",
  folderName: "Personal",
  remainingTaskCount: 0,
  availableTaskCount: 0,
  stalled: false,
  empty: true,
});

const HEALTHY_PROJECT = makeEnrichedProject({
  id: "healthy-1",
  name: "Healthy Project",
  folderName: "Work",
  remainingTaskCount: 4,
  availableTaskCount: 2,
  stalled: false,
  empty: false,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("runStalledProjects", () => {
  it("returns only stalled projects, filtered from a mixed set (spec §6)", async () => {
    const deps: StalledProjectsDeps = {
      queryProjectsEnriched: makeFakeFetcher([
        STALLED_PROJECT,
        EMPTY_PROJECT,
        HEALTHY_PROJECT,
      ]),
    };

    const result = await runStalledProjects(deps);

    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.count).toBe(1);
    expect(result.data!.projects).toHaveLength(1);
  });

  it("maps stalled projects to a decision-ready StalledProject shape (spec §6)", async () => {
    const deps: StalledProjectsDeps = {
      queryProjectsEnriched: makeFakeFetcher([STALLED_PROJECT]),
    };

    const result = await runStalledProjects(deps);

    expect(result.success).toBe(true);
    const project = result.data!.projects[0] as StalledProject;
    // spec §6: decision-ready shape includes id, name, folderName, remainingTaskCount
    expect(project.id).toBe("stalled-1");
    expect(project.name).toBe("Stalled Project");
    expect(project.folderName).toBe("Work");
    expect(project.remainingTaskCount).toBe(5);
  });

  it("returns a CliOutput success envelope (spec §6)", async () => {
    const deps: StalledProjectsDeps = {
      queryProjectsEnriched: makeFakeFetcher([STALLED_PROJECT]),
    };

    const output: CliOutput<{ projects: StalledProject[]; count: number }> =
      await runStalledProjects(deps);

    expect(output.success).toBe(true);
    expect(output.error).toBeNull();
    expect(output.data).not.toBeNull();
  });

  it("returns an empty list when no projects are stalled", async () => {
    const deps: StalledProjectsDeps = {
      queryProjectsEnriched: makeFakeFetcher([EMPTY_PROJECT, HEALTHY_PROJECT]),
    };

    const result = await runStalledProjects(deps);

    expect(result.success).toBe(true);
    expect(result.data!.count).toBe(0);
    expect(result.data!.projects).toHaveLength(0);
  });

  it("returns an empty list when the input is empty", async () => {
    const deps: StalledProjectsDeps = {
      queryProjectsEnriched: makeFakeFetcher([]),
    };

    const result = await runStalledProjects(deps);

    expect(result.success).toBe(true);
    expect(result.data!.count).toBe(0);
    expect(result.data!.projects).toHaveLength(0);
  });

  it("propagates a fetcher failure as a CliOutput failure", async () => {
    const deps: StalledProjectsDeps = {
      queryProjectsEnriched: makeFailingFetcher(),
    };

    const result = await runStalledProjects(deps);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("excludes empty projects (stalled: false, empty: true) — not in stalled set", async () => {
    const deps: StalledProjectsDeps = {
      queryProjectsEnriched: makeFakeFetcher([EMPTY_PROJECT]),
    };

    const result = await runStalledProjects(deps);

    expect(result.success).toBe(true);
    expect(result.data!.projects).toHaveLength(0);
  });

  it("excludes healthy projects (stalled: false) from the result", async () => {
    const deps: StalledProjectsDeps = {
      queryProjectsEnriched: makeFakeFetcher([HEALTHY_PROJECT]),
    };

    const result = await runStalledProjects(deps);

    expect(result.success).toBe(true);
    expect(result.data!.projects).toHaveLength(0);
  });

  it("includes folderName as null when project has no folder", async () => {
    const noFolderProject = makeEnrichedProject({
      id: "no-folder",
      name: "Orphan Stalled",
      folderName: null,
      remainingTaskCount: 2,
      stalled: true,
    });

    const deps: StalledProjectsDeps = {
      queryProjectsEnriched: makeFakeFetcher([noFolderProject]),
    };

    const result = await runStalledProjects(deps);

    expect(result.success).toBe(true);
    const project = result.data!.projects[0] as StalledProject;
    expect(project.folderName).toBeNull();
    expect(project.remainingTaskCount).toBe(2);
  });
});

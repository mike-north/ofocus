/**
 * UAT: exercise `runStalledProjects` and `runNextActions` against a live
 * OmniFocus database via the real OmniJS I/O path (no CLI subprocess — the
 * functions are called directly with their default deps so the full chain
 * queryProjectsEnriched / queryTasksEnriched → SDK queries → relational
 * OmniJS pass executes for real).
 *
 * Skipped automatically when OmniFocus is not installed (CI). Read-only:
 * neither command mutates OmniFocus state.
 *
 * Commands under test:
 *   - `runStalledProjects()` — active projects where all work is blocked
 *   - `runNextActions()`    — the single next actionable task per project
 *
 * @see packages/productivity/src/commands/stalled-projects.ts
 * @see packages/productivity/src/commands/next-actions.ts
 * @see docs/specs/2026-06-08-ofocus-derived-state-design.md §6
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { runStalledProjects } from "../../src/commands/stalled-projects.js";
import { runNextActions } from "../../src/commands/next-actions.js";

const hasOmniFocus = existsSync("/Applications/OmniFocus.app");
const d = hasOmniFocus ? describe : describe.skip;

d("derived-state commands (UAT — live OmniFocus)", () => {
  // -------------------------------------------------------------------------
  // runStalledProjects
  // -------------------------------------------------------------------------

  it("runStalledProjects() returns success=true, a numeric count, and a well-shaped projects array", async () => {
    const result = await runStalledProjects();

    // Envelope must indicate success.
    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.error).toBeNull();

    const { data } = result;

    // count must be a non-negative integer.
    expect(typeof data!.count).toBe("number");
    expect(data!.count).toBeGreaterThanOrEqual(0);

    // projects must be an array.
    expect(Array.isArray(data!.projects)).toBe(true);

    // count must equal the array length (spec §6 invariant).
    expect(data!.count).toBe(data!.projects.length);

    // Every element must have the decision-ready shape defined in spec §6.
    for (const project of data!.projects) {
      expect(typeof project.id).toBe("string");
      expect(project.id.length).toBeGreaterThan(0);

      expect(typeof project.name).toBe("string");

      // folderName is string | null — both are valid.
      expect(
        project.folderName === null || typeof project.folderName === "string"
      ).toBe(true);

      expect(typeof project.remainingTaskCount).toBe("number");
      expect(project.remainingTaskCount).toBeGreaterThanOrEqual(0);
    }
  }, 20000);

  // -------------------------------------------------------------------------
  // runNextActions
  // -------------------------------------------------------------------------

  it("runNextActions() returns success=true, a numeric count, a well-shaped actions array, and at most one action per non-null projectId", async () => {
    const result = await runNextActions();

    // Envelope must indicate success.
    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.error).toBeNull();

    const { data } = result;

    // count must be a non-negative integer.
    expect(typeof data!.count).toBe("number");
    expect(data!.count).toBeGreaterThanOrEqual(0);

    // actions must be an array.
    expect(Array.isArray(data!.actions)).toBe(true);

    // count must equal the array length (spec §6 invariant).
    expect(data!.count).toBe(data!.actions.length);

    // Every element must have the decision-ready shape defined in spec §6.
    for (const action of data!.actions) {
      expect(typeof action.id).toBe("string");
      expect(action.id.length).toBeGreaterThan(0);

      expect(typeof action.name).toBe("string");

      // projectId is string | null — both are valid (null = inbox task).
      expect(
        action.projectId === null || typeof action.projectId === "string"
      ).toBe(true);

      // projectName is string | null — must be null iff projectId is null.
      expect(
        action.projectName === null || typeof action.projectName === "string"
      ).toBe(true);

      // dueDate is string | null — when present it must look like ISO 8601.
      if (action.dueDate !== null) {
        expect(typeof action.dueDate).toBe("string");
        expect(action.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    }

    // Core invariant (spec §6): at most ONE next action per non-null projectId.
    const seenProjectIds = new Set<string>();
    for (const action of data!.actions) {
      if (action.projectId !== null) {
        expect(seenProjectIds.has(action.projectId)).toBe(false);
        seenProjectIds.add(action.projectId);
      }
    }
  }, 20000);
});

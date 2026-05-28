import { describe, it, expect } from "vitest";
import { commandRegistry } from "../../src/commands/index.js";

// Regression: when the subtask commands moved to the descriptor registry,
// their CLI flags were renamed (--parent → --parent-task-id, --tag → --tags,
// --estimate → --estimated-minutes) and short aliases were dropped. The
// hand-maintained `list-commands` registry still advertised the old flags,
// directing callers to invalid invocations. These tests assert the usage
// strings match the descriptor-derived flags so the drift can't return.
function usageFor(name: string): string {
  const entry = commandRegistry.find((c) => c.name === name);
  if (!entry) throw new Error(`No command registry entry for "${name}"`);
  return entry.usage;
}

describe("commandRegistry — subtask command usage strings", () => {
  it("subtask advertises the descriptor-derived flag names", () => {
    const usage = usageFor("subtask");
    expect(usage).toContain("--parent-task-id");
    expect(usage).toContain("--tags");
    expect(usage).toContain("--estimated-minutes");
    // removed flags / short aliases must not be advertised
    expect(usage).not.toMatch(/--parent\b(?!-task-id)/);
    expect(usage).not.toMatch(/--tag\b(?!s)/);
    expect(usage).not.toContain("--estimate ");
  });

  it("subtasks advertises the negated boolean forms", () => {
    const usage = usageFor("subtasks");
    expect(usage).toContain("--completed");
    expect(usage).toContain("--no-completed");
    expect(usage).toContain("--flagged");
    expect(usage).toContain("--no-flagged");
  });

  it("move-to-parent advertises --parent-task-id, not --parent", () => {
    const usage = usageFor("move-to-parent");
    expect(usage).toContain("--parent-task-id");
    expect(usage).not.toMatch(/--parent\b(?!-task-id)/);
  });
});

// Regression: when the batch-ops commands moved to the descriptor registry,
// each took its IDs as a variadic positional and update-batch gained the MCP
// superset of flags (--title/--note, previously CLI-absent). The
// hand-maintained `list-commands` usage strings must reflect the
// descriptor-derived surface so they can't drift from the real flags.
describe("commandRegistry — batch-ops command usage strings", () => {
  it("complete-batch / delete-batch take a variadic task-ids positional", () => {
    expect(usageFor("complete-batch")).toContain("<task-ids...>");
    expect(usageFor("delete-batch")).toContain("<task-ids...>");
  });

  it("update-batch advertises the MCP superset of update flags", () => {
    const usage = usageFor("update-batch");
    expect(usage).toContain("<task-ids...>");
    expect(usage).toContain("--title");
    expect(usage).toContain("--note");
    expect(usage).toContain("--due");
    expect(usage).toContain("--defer");
    expect(usage).toContain("--flag");
    expect(usage).toContain("--no-flag");
    expect(usage).toContain("--project");
    expect(usage).toContain("--tags");
    expect(usage).toContain("--estimated-minutes");
  });

  it("defer / defer-batch advertise --days and --to", () => {
    const single = usageFor("defer");
    expect(single).toContain("<task-id>");
    expect(single).toContain("--days");
    expect(single).toContain("--to");

    const batch = usageFor("defer-batch");
    expect(batch).toContain("<task-ids...>");
    expect(batch).toContain("--days");
    expect(batch).toContain("--to");
  });
});

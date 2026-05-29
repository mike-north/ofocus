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

// Regression: when the project/folder/tag commands moved to the descriptor
// registry, short aliases were dropped and flag names were normalized to
// kebab-case. The hand-maintained `list-commands` usage strings must reflect
// the descriptor-derived surface so they can't drift.
describe("commandRegistry — project/folder/tag command usage strings", () => {
  it("projects advertises --folder, --status, --sequential and pagination", () => {
    const usage = usageFor("projects");
    expect(usage).toContain("--folder");
    expect(usage).toContain("--status");
    expect(usage).toContain("--sequential");
    expect(usage).toContain("--no-sequential");
    expect(usage).toContain("--limit");
    expect(usage).toContain("--offset");
  });

  it("folders advertises --parent and pagination flags", () => {
    const usage = usageFor("folders");
    expect(usage).toContain("--parent");
    expect(usage).toContain("--limit");
    expect(usage).toContain("--offset");
  });

  it("tags advertises --parent and pagination flags", () => {
    const usage = usageFor("tags");
    expect(usage).toContain("--parent");
    expect(usage).toContain("--limit");
    expect(usage).toContain("--offset");
  });

  it("create-project advertises descriptor-derived flag names", () => {
    const usage = usageFor("create-project");
    expect(usage).toContain("<name>");
    expect(usage).toContain("--note");
    expect(usage).toContain("--folder-id");
    expect(usage).toContain("--folder-name");
    expect(usage).toContain("--sequential");
    expect(usage).toContain("--no-sequential");
    expect(usage).toContain("--status");
    expect(usage).toContain("--due-date");
    expect(usage).toContain("--defer-date");
    // old short aliases must not appear
    expect(usage).not.toContain("-n ");
    expect(usage).not.toContain("-d ");
    // old flag names must not appear
    expect(usage).not.toMatch(/--folder\b(?![-])/);
    expect(usage).not.toContain("--due ");
    expect(usage).not.toContain("--defer ");
  });

  it("create-folder advertises --parent-folder-id and --parent-folder-name", () => {
    const usage = usageFor("create-folder");
    expect(usage).toContain("<name>");
    expect(usage).toContain("--parent-folder-id");
    expect(usage).toContain("--parent-folder-name");
    // old flags must not appear
    expect(usage).not.toMatch(/--parent\b(?!-folder)/);
    expect(usage).not.toContain("--parent-id");
  });

  it("create-tag advertises --parent-tag-id and --parent-tag-name", () => {
    const usage = usageFor("create-tag");
    expect(usage).toContain("<name>");
    expect(usage).toContain("--parent-tag-id");
    expect(usage).toContain("--parent-tag-name");
    // old flags must not appear
    expect(usage).not.toMatch(/--parent\b(?!-tag)/);
    expect(usage).not.toContain("--parent-id");
  });

  it("update-tag advertises --name, --parent-tag-id and --parent-tag-name", () => {
    const usage = usageFor("update-tag");
    expect(usage).toContain("<tag-id>");
    expect(usage).toContain("--name");
    expect(usage).toContain("--parent-tag-id");
    expect(usage).toContain("--parent-tag-name");
    // old flags must not appear
    expect(usage).not.toMatch(/--parent\b(?!-tag)/);
  });

  it("delete-tag advertises positional <tag-id> only", () => {
    const usage = usageFor("delete-tag");
    expect(usage).toContain("<tag-id>");
  });

  it("update-project advertises descriptor-derived flag names", () => {
    const usage = usageFor("update-project");
    expect(usage).toContain("<project-id>");
    expect(usage).toContain("--name");
    expect(usage).toContain("--note");
    expect(usage).toContain("--status");
    expect(usage).toContain("--folder-id");
    expect(usage).toContain("--folder-name");
    expect(usage).toContain("--sequential");
    expect(usage).toContain("--no-sequential");
    expect(usage).toContain("--due-date");
    expect(usage).toContain("--defer-date");
    // old flags must not appear
    expect(usage).not.toContain("-n ");
    expect(usage).not.toContain("-d ");
    expect(usage).not.toMatch(/--folder\b(?![-])/);
    expect(usage).not.toContain("--due ");
    expect(usage).not.toContain("--defer ");
  });

  it("delete-project advertises positional <project-id> only", () => {
    const usage = usageFor("delete-project");
    expect(usage).toContain("<project-id>");
  });

  it("update-folder advertises --parent-folder-id and --parent-folder-name", () => {
    const usage = usageFor("update-folder");
    expect(usage).toContain("<folder-id>");
    expect(usage).toContain("--name");
    expect(usage).toContain("--parent-folder-id");
    expect(usage).toContain("--parent-folder-name");
    // old flags must not appear
    expect(usage).not.toMatch(/--parent\b(?!-folder)/);
    expect(usage).not.toContain("--parent-id");
  });

  it("delete-folder advertises positional <folder-id> only", () => {
    const usage = usageFor("delete-folder");
    expect(usage).toContain("<folder-id>");
  });
});

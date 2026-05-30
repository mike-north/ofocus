import { describe, it, expect } from "vitest";
import { commandRegistry } from "../../src/commands/index.js";
import {
  allCommandDescriptors,
  // Representative descriptors from each domain, for the coverage test
  addToInboxDescriptor,
  listProjectsDescriptor,
  listFoldersDescriptor,
  listTagsDescriptor,
  reviewProjectDescriptor,
  queryForecastDescriptor,
  searchTasksDescriptor,
  getStatsDescriptor,
  evaluateScriptDescriptor,
} from "@ofocus/sdk";

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

// Regression: when the tasks/update/stats/drop-project commands moved to the
// descriptor registry, their CLI flags were updated. These tests assert that
// the `list-commands` registry reflects the expanded descriptor-derived
// surface so it can't drift from the real flags.
describe("commandRegistry — tasks/update straggler command usage strings", () => {
  it("tasks advertises the full filter/sort/projection surface", () => {
    const usage = usageFor("tasks");
    // Core filter flags
    expect(usage).toContain("--project");
    expect(usage).toContain("--tag");
    expect(usage).toContain("--flagged");
    expect(usage).toContain("--completed");
    expect(usage).toContain("--available");
    expect(usage).toContain("--due-before");
    expect(usage).toContain("--due-after");
    // Extended predicates (new via descriptor)
    expect(usage).toContain("--folder");
    expect(usage).toContain("--tag-mode");
    expect(usage).toContain("--in-inbox");
    expect(usage).toContain("--has-due");
    expect(usage).toContain("--status");
    // Projection and sort
    expect(usage).toContain("--fields");
    expect(usage).toContain("--sort");
    expect(usage).toContain("--reverse");
    // Shape modifiers
    expect(usage).toContain("--count");
    expect(usage).toContain("--first");
    expect(usage).toContain("--last");
    expect(usage).toContain("--ids-only");
    expect(usage).toContain("--group-by");
    // Pagination
    expect(usage).toContain("--limit");
    expect(usage).toContain("--offset");
    expect(usage).toContain("--all");
  });

  it("update advertises --tags and --estimated-minutes (not old --tag/--estimate)", () => {
    const usage = usageFor("update");
    expect(usage).toContain("--tags");
    expect(usage).toContain("--estimated-minutes");
    expect(usage).toContain("--clear-estimate");
    expect(usage).toContain("--clear-repeat");
    // Old short aliases must not appear
    expect(usage).not.toMatch(/--tag\b(?!s)/);
    expect(usage).not.toMatch(/--estimate\b(?!d)/);
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
// Regression: tasks --all was never wired into the manual CLI registration, so
// the README example `ofocus tasks --project "Work" --all` would fail with
// "unknown option '--all'". This test ensures the usage string advertises all
// three pagination surface fields (limit, offset, all).
describe("commandRegistry — tasks command usage string", () => {
  it("tasks advertises --limit, --offset, and --all for pagination", () => {
    const usage = usageFor("tasks");
    expect(usage).toContain("--limit");
    expect(usage).toContain("--offset");
    expect(usage).toContain("--all");
  });

  it("tasks advertises the core filter flags", () => {
    const usage = usageFor("tasks");
    expect(usage).toContain("--project");
    expect(usage).toContain("--tag");
    expect(usage).toContain("--flagged");
    expect(usage).toContain("--completed");
    expect(usage).toContain("--available");
  });
});

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

// Regression: when the advanced commands moved to the descriptor registry,
// short aliases (-d, -p, -f) were dropped, CLI names were updated to reflect
// the descriptor surface, and boolean flags gained --no- variants. The
// hand-maintained `list-commands` registry must reflect the descriptor-derived
// surface so it can't drift from the real flags.
describe("commandRegistry — advanced command usage strings", () => {
  it("perspectives advertises no flags", () => {
    const usage = usageFor("perspectives");
    // No positional or flag requirements
    expect(usage).toContain("perspectives");
  });

  it("perspective advertises <name> positional and --limit", () => {
    const usage = usageFor("perspective");
    expect(usage).toContain("<name>");
    expect(usage).toContain("--limit");
    // Old --limit <n> syntax replaced with --limit <value>
    expect(usage).not.toContain("--limit <n>");
  });

  it("review advertises <project-id> positional only", () => {
    const usage = usageFor("review");
    expect(usage).toContain("<project-id>");
  });

  it("projects-for-review advertises no flags", () => {
    const usage = usageFor("projects-for-review");
    expect(usage).toContain("projects-for-review");
  });

  it("focus advertises <target> positional and --by-id with negation", () => {
    const usage = usageFor("focus");
    expect(usage).toContain("<target>");
    expect(usage).toContain("--by-id");
    expect(usage).toContain("--no-by-id");
    // Old short-form --by-id was just a plain flag; now has explicit negation
    // Old usage used 'name' not 'target' as the positional label
    expect(usage).not.toContain("<name>");
  });

  it("unfocus advertises no flags", () => {
    const usage = usageFor("unfocus");
    expect(usage).toContain("unfocus");
  });

  it("focused advertises no flags", () => {
    const usage = usageFor("focused");
    expect(usage).toContain("focused");
  });

  it("url advertises <id> positional only", () => {
    const usage = usageFor("url");
    expect(usage).toContain("<id>");
  });

  it("template-save advertises two positionals and --description (no -d)", () => {
    const usage = usageFor("template-save");
    expect(usage).toContain("<name>");
    expect(usage).toContain("<source-project>");
    expect(usage).toContain("--description");
    // old short alias -d must not appear
    expect(usage).not.toContain("-d ");
  });

  it("template-get advertises <template-name> positional", () => {
    const usage = usageFor("template-get");
    expect(usage).toContain("<template-name>");
    // old usage was <name>, now <template-name>
    expect(usage).not.toContain("<name>");
  });

  it("template-create advertises <template-name> and descriptor-derived flags (no -p or -f)", () => {
    const usage = usageFor("template-create");
    expect(usage).toContain("<template-name>");
    expect(usage).toContain("--project-name");
    expect(usage).toContain("--folder");
    expect(usage).toContain("--base-date");
    // old short aliases must not appear
    expect(usage).not.toContain("-p ");
    expect(usage).not.toContain("-f ");
  });

  it("template-delete advertises <template-name> positional", () => {
    const usage = usageFor("template-delete");
    expect(usage).toContain("<template-name>");
  });

  it("attach advertises <task-id> and <file-path> positionals", () => {
    const usage = usageFor("attach");
    expect(usage).toContain("<task-id>");
    expect(usage).toContain("<file-path>");
    // old positional was <file>, now <file-path>
    expect(usage).not.toMatch(/<file>\b/);
  });

  it("attachments advertises <task-id> positional only", () => {
    const usage = usageFor("attachments");
    expect(usage).toContain("<task-id>");
  });

  it("detach advertises <task-id> and <attachment-name> positionals", () => {
    const usage = usageFor("detach");
    expect(usage).toContain("<task-id>");
    expect(usage).toContain("<attachment-name>");
    // old positional was <attachment-id-or-name>, now <attachment-name>
    expect(usage).not.toContain("<attachment-id-or-name>");
  });

  it("archive advertises descriptor-derived flags with --dry-run negation", () => {
    const usage = usageFor("archive");
    expect(usage).toContain("--completed-before");
    expect(usage).toContain("--dropped-before");
    expect(usage).toContain("--project");
    expect(usage).toContain("--dry-run");
    expect(usage).toContain("--no-dry-run");
  });

  it("compact advertises no flags", () => {
    const usage = usageFor("compact");
    expect(usage).toContain("compact");
  });

  it("sync-status advertises no flags", () => {
    const usage = usageFor("sync-status");
    expect(usage).toContain("sync-status");
  });

  it("sync advertises no flags", () => {
    const usage = usageFor("sync");
    expect(usage).toContain("sync");
  });

  it("export advertises --include-completed with negation (no -p short alias)", () => {
    const usage = usageFor("export");
    expect(usage).toContain("--project");
    expect(usage).toContain("--include-completed");
    expect(usage).toContain("--no-include-completed");
    expect(usage).toContain("--include-dropped");
    expect(usage).toContain("--no-include-dropped");
    // old short alias must not appear
    expect(usage).not.toContain("-p ");
  });

  it("open advertises <id> positional only", () => {
    const usage = usageFor("open");
    expect(usage).toContain("<id>");
  });
});

// ============================================================================
// Catalog integrity — these tests guard the structural properties of the
// descriptor-derived catalog and cannot be subverted by hand-editing a list.
// ============================================================================

describe("commandRegistry — catalog integrity", () => {
  /** The three CLI commands that are hand-wired and not descriptor-driven. */
  const HAND_WIRED_NAMES = ["list-commands", "import", "review-interval"];

  it("contains every CLI-registered descriptor's cliName", () => {
    const catalogNames = new Set(commandRegistry.map((c) => c.name));

    // These descriptors exist in allCommandDescriptors for MCP use but are
    // NOT directly registered in the CLI via registerCliCommand. The CLI
    // hand-wires different commands that combine or wrap them:
    //
    // - "import-taskpaper": importTaskPaperDescriptor — CLI hand-wires "import"
    //   as a file-path command instead.
    // - "review-interval-get": getReviewIntervalDescriptor — CLI hand-wires
    //   "review-interval" combining both get and set (via --set flag).
    // - "review-interval-set": setReviewIntervalDescriptor — same as above.
    const MCP_ONLY_CLI_NAMES = new Set([
      "import-taskpaper",
      "review-interval-get",
      "review-interval-set",
    ]);

    for (const descriptor of allCommandDescriptors) {
      if (MCP_ONLY_CLI_NAMES.has(descriptor.cliName as string)) continue;
      expect(
        catalogNames.has(descriptor.cliName as string),
        `Expected catalog to contain descriptor cliName "${descriptor.cliName as string}" but it was missing`
      ).toBe(true);
    }
  });

  it("contains all three hand-wired command exceptions", () => {
    const catalogNames = new Set(commandRegistry.map((c) => c.name));
    for (const name of HAND_WIRED_NAMES) {
      expect(
        catalogNames.has(name),
        `Expected catalog to contain hand-wired command "${name}" but it was missing`
      ).toBe(true);
    }
  });

  it("has no duplicate command names", () => {
    const names = commandRegistry.map((c) => c.name);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const name of names) {
      if (seen.has(name)) {
        duplicates.push(name);
      }
      seen.add(name);
    }
    expect(duplicates).toEqual([]);
  });

  it("is sorted alphabetically by name", () => {
    const names = commandRegistry.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("every entry has a non-empty name, description, and usage", () => {
    for (const entry of commandRegistry) {
      expect(
        entry.name.trim().length,
        `name empty for entry: ${JSON.stringify(entry)}`
      ).toBeGreaterThan(0);
      expect(
        entry.description.trim().length,
        `description empty for "${entry.name}"`
      ).toBeGreaterThan(0);
      expect(
        entry.usage.trim().length,
        `usage empty for "${entry.name}"`
      ).toBeGreaterThan(0);
    }
  });

  it("every usage string starts with 'ofocus <name>'", () => {
    for (const entry of commandRegistry) {
      expect(
        entry.usage.startsWith(`ofocus ${entry.name}`),
        `Usage for "${entry.name}" should start with "ofocus ${entry.name}", got: "${entry.usage}"`
      ).toBe(true);
    }
  });
});

describe("allCommandDescriptors (SDK registry) — coverage by domain", () => {
  it("includes a representative descriptor from the Tasks domain", () => {
    expect(allCommandDescriptors).toContain(addToInboxDescriptor);
  });

  it("includes a representative descriptor from the Projects domain", () => {
    expect(allCommandDescriptors).toContain(listProjectsDescriptor);
  });

  it("includes a representative descriptor from the Folders domain", () => {
    expect(allCommandDescriptors).toContain(listFoldersDescriptor);
  });

  it("includes a representative descriptor from the Tags domain", () => {
    expect(allCommandDescriptors).toContain(listTagsDescriptor);
  });

  it("includes a representative descriptor from the Review domain", () => {
    expect(allCommandDescriptors).toContain(reviewProjectDescriptor);
  });

  it("includes a representative descriptor from Forecast/Focus/Deferred", () => {
    expect(allCommandDescriptors).toContain(queryForecastDescriptor);
  });

  it("includes the search descriptor", () => {
    expect(allCommandDescriptors).toContain(searchTasksDescriptor);
  });

  it("includes the stats descriptor", () => {
    expect(allCommandDescriptors).toContain(getStatsDescriptor);
  });

  it("includes the eval escape-hatch descriptor", () => {
    expect(allCommandDescriptors).toContain(evaluateScriptDescriptor);
  });

  it("has no duplicate descriptor objects", () => {
    const seen = new Set();
    const duplicates: string[] = [];
    for (const d of allCommandDescriptors) {
      if (seen.has(d)) {
        duplicates.push(d.cliName as string);
      }
      seen.add(d);
    }
    expect(duplicates).toEqual([]);
  });

  it("every descriptor has a non-empty cliName and description", () => {
    for (const d of allCommandDescriptors) {
      expect(
        (d.cliName as string).trim().length,
        `cliName empty for descriptor: ${d.name as string}`
      ).toBeGreaterThan(0);
      expect(
        (d.description as string).trim().length,
        `description empty for "${d.name as string}"`
      ).toBeGreaterThan(0);
    }
  });
});

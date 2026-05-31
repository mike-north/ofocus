import type { CommandInfo } from "@ofocus/sdk";
import {
  addToInboxDescriptor,
  completeTaskDescriptor,
  updateTaskDescriptor,
  dropTaskDescriptor,
  deleteTaskDescriptor,
  duplicateTaskDescriptor,
  createSubtaskDescriptor,
  querySubtasksDescriptor,
  moveTaskToParentDescriptor,
  completeTasksDescriptor,
  updateTasksDescriptor,
  deleteTasksDescriptor,
  deferTaskDescriptor,
  deferTasksDescriptor,
  searchTasksDescriptor,
  quickCaptureDescriptor,
  applyRepetitionRuleDescriptor,
  clearRepetitionRuleDescriptor,
  listProjectsDescriptor,
  createProjectDescriptor,
  updateProjectDescriptor,
  deleteProjectDescriptor,
  dropProjectDescriptor,
  reviewProjectDescriptor,
  queryProjectsForReviewDescriptor,
  listFoldersDescriptor,
  createFolderDescriptor,
  updateFolderDescriptor,
  deleteFolderDescriptor,
  listTagsDescriptor,
  createTagDescriptor,
  updateTagDescriptor,
  deleteTagDescriptor,
  listPerspectivesDescriptor,
  queryPerspectiveDescriptor,
  queryForecastDescriptor,
  focusOnDescriptor,
  unfocusDescriptor,
  getFocusedDescriptor,
  queryDeferredDescriptor,
  exportTaskPaperDescriptor,
  saveTemplateDescriptor,
  listTemplatesDescriptor,
  getTemplateDescriptor,
  createFromTemplateDescriptor,
  deleteTemplateDescriptor,
  addAttachmentDescriptor,
  listAttachmentsDescriptor,
  removeAttachmentDescriptor,
  archiveTasksDescriptor,
  compactDatabaseDescriptor,
  getSyncStatusDescriptor,
  triggerSyncDescriptor,
  getStatsDescriptor,
  generateUrlDescriptor,
  openItemDescriptor,
  evaluateScriptDescriptor,
  queryTasksDescriptor,
} from "@ofocus/sdk";
import { productivityDescriptors } from "@ofocus/productivity";
import { usageStringForDescriptor } from "../registry-adapter.js";

/**
 * Descriptors for every command registered via `registerCliCommand` in cli.ts.
 *
 * This list must stay in sync with the `registerCliCommand` calls in cli.ts.
 * New descriptor-based commands should be added here AND registered in cli.ts.
 * Do NOT add `importTaskPaperDescriptor` here — the CLI surfaces `import` as
 * a hand-wired file-path command (see HAND_WIRED_COMMANDS below).
 */
const CLI_DESCRIPTORS = [
  addToInboxDescriptor,
  queryTasksDescriptor,
  listProjectsDescriptor,
  listTagsDescriptor,
  completeTaskDescriptor,
  updateTaskDescriptor,
  createProjectDescriptor,
  createFolderDescriptor,
  listFoldersDescriptor,
  dropTaskDescriptor,
  deleteTaskDescriptor,
  createTagDescriptor,
  updateTagDescriptor,
  deleteTagDescriptor,
  createSubtaskDescriptor,
  querySubtasksDescriptor,
  moveTaskToParentDescriptor,
  completeTasksDescriptor,
  updateTasksDescriptor,
  deleteTasksDescriptor,
  searchTasksDescriptor,
  listPerspectivesDescriptor,
  queryPerspectiveDescriptor,
  reviewProjectDescriptor,
  queryProjectsForReviewDescriptor,
  queryForecastDescriptor,
  focusOnDescriptor,
  unfocusDescriptor,
  getFocusedDescriptor,
  queryDeferredDescriptor,
  generateUrlDescriptor,
  deferTaskDescriptor,
  deferTasksDescriptor,
  applyRepetitionRuleDescriptor,
  clearRepetitionRuleDescriptor,
  quickCaptureDescriptor,
  exportTaskPaperDescriptor,
  getStatsDescriptor,
  saveTemplateDescriptor,
  listTemplatesDescriptor,
  getTemplateDescriptor,
  createFromTemplateDescriptor,
  deleteTemplateDescriptor,
  addAttachmentDescriptor,
  listAttachmentsDescriptor,
  removeAttachmentDescriptor,
  archiveTasksDescriptor,
  compactDatabaseDescriptor,
  getSyncStatusDescriptor,
  triggerSyncDescriptor,
  updateProjectDescriptor,
  deleteProjectDescriptor,
  dropProjectDescriptor,
  updateFolderDescriptor,
  deleteFolderDescriptor,
  duplicateTaskDescriptor,
  evaluateScriptDescriptor,
  openItemDescriptor,
] as const;

/**
 * Hand-wired commands that are not (yet) expressible as descriptors and must
 * be listed explicitly in the catalog.
 *
 * - `list-commands`: Cannot be a descriptor — it has no OmniFocus handler and
 *   reads from the descriptor registry itself.
 * - `import`: The CLI surfaces a file-path argument that reads content before
 *   calling `importTaskPaper`; the MCP descriptor (`import-taskpaper`) takes
 *   raw content and is a different surface.
 * - `review-interval`: Combines two MCP descriptors (`getReviewInterval` and
 *   `setReviewInterval`) into a single CLI command controlled by `--set`.
 */
const HAND_WIRED_COMMANDS: CommandInfo[] = [
  {
    name: "list-commands",
    description:
      "List all available CLI commands with descriptions and usage. Use this to discover what operations are possible. Returns structured metadata about each command suitable for semantic activation by AI agents.",
    usage: "ofocus list-commands",
  },
  {
    name: "import",
    description:
      "Import tasks from a TaskPaper format file. Creates tasks in the inbox and optionally creates projects that don't exist. TaskPaper format uses indentation and @tags for metadata like @due(date), @flagged, @done.",
    usage:
      "ofocus import <file> [--create-projects] [--default-project <value>]",
  },
  {
    name: "review-interval",
    description:
      "Get or set the review interval for a project. Review intervals determine how often projects appear in the Review perspective. Omit --set to get current interval; use --set <days> to change it.",
    usage: "ofocus review-interval <project-id> [--set <value>]",
  },
];

/**
 * Derive the `CommandInfo` catalog from the descriptor registry.
 *
 * Each CLI-registered descriptor contributes one entry with:
 * - `name` = `descriptor.cliName`
 * - `description` = `descriptor.description`
 * - `usage` = derived by {@link usageStringForDescriptor} (same logic as Commander registration)
 *
 * The three hand-wired exceptions (`list-commands`, `import`, `review-interval`)
 * are appended explicitly and sorted into the final catalog alphabetically.
 */
function buildCommandRegistry(): CommandInfo[] {
  // `CLI_DESCRIPTORS` and `productivityDescriptors` are both arrays of resolved
  // descriptors but with structurally distinct element types (different schema
  // generics). The `.map` below only reads `cliName`/`description` and forwards
  // each element to `usageStringForDescriptor`, so widening to that adapter's
  // accepted element type is sufficient and safe.
  const fromDescriptors: CommandInfo[] = [
    ...CLI_DESCRIPTORS,
    ...productivityDescriptors,
  ].map((d) => ({
    name: d.cliName,
    description: d.description,
    usage: usageStringForDescriptor(d),
  }));

  const all = [...fromDescriptors, ...HAND_WIRED_COMMANDS];

  // Sort deterministically by name so the catalog is stable across runs.
  all.sort((a, b) => a.name.localeCompare(b.name));

  return all;
}

/**
 * Registry of all available commands derived from the descriptor registry.
 *
 * Usage strings are computed from each descriptor's schema via
 * {@link usageStringForDescriptor}, matching the flags that
 * `registerCliCommand` actually registers in Commander. This eliminates the
 * hand-maintained drift that arose when updating flags by hand.
 */
export const commandRegistry: CommandInfo[] = buildCommandRegistry();

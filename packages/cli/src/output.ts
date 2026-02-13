import type {
  CliOutput,
  OFTask,
  OFProject,
  OFTag,
  OFFolder,
  OFPerspective,
  OFTaskWithChildren,
  BatchResult,
  ReviewResult,
  CommandInfo,
  FocusResult,
  UrlResult,
  DeferResult,
  TaskPaperExportResult,
  TaskPaperImportResult,
  StatsResult,
  SaveTemplateResult,
  ListTemplatesResult,
  CreateFromTemplateResult,
  DeleteTemplateResult,
  AddAttachmentResult,
  ListAttachmentsResult,
  RemoveAttachmentResult,
  ArchiveResult,
  CompactResult,
  SyncStatus,
  SyncResult,
  PaginatedResult,
} from "@ofocus/sdk";

/**
 * Output the result as JSON to stdout.
 */
export function outputJson<T>(result: CliOutput<T>): void {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Output the result in human-readable format to stdout.
 */
export function outputHuman<T>(result: CliOutput<T>): void {
  if (!result.success) {
    const errorMsg = result.error?.message ?? "Unknown error";
    const details = result.error?.details;
    console.error("Error: " + errorMsg);
    if (details) {
      console.error("Details: " + details);
    }
    return;
  }

  const data = result.data;

  if (data === null || data === undefined) {
    console.log("Success (no data)");
    return;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log("No results found.");
      return;
    }

    // Detect type from first element
    const first: unknown = data[0];
    if (isTask(first)) {
      formatTasks(data as OFTask[]);
    } else if (isTaskWithChildren(first)) {
      formatTasksWithChildren(data as OFTaskWithChildren[]);
    } else if (isProject(first)) {
      formatProjects(data as OFProject[]);
    } else if (isTag(first)) {
      formatTags(data as OFTag[]);
    } else if (isFolder(first)) {
      formatFolders(data as OFFolder[]);
    } else if (isPerspective(first)) {
      formatPerspectives(data as OFPerspective[]);
    } else if (isCommandInfo(first)) {
      formatCommands(data as CommandInfo[]);
    } else {
      // Generic array output
      for (const item of data) {
        console.log(JSON.stringify(item));
      }
    }
    return;
  }

  // Handle single objects
  if (typeof data === "object") {
    // Check paginated results first (before other type checks)
    if (isPaginatedResult(data)) {
      formatPaginatedResult(data);
    } else if (isTask(data)) {
      formatTask(data);
    } else if (isTaskWithChildren(data)) {
      formatTaskWithChildren(data);
    } else if (isProject(data)) {
      formatProject(data);
    } else if (isTag(data)) {
      formatTag(data);
    } else if (isFolder(data)) {
      formatFolder(data);
    } else if (isPerspective(data)) {
      formatPerspective(data);
    } else if (isBatchResult(data)) {
      formatBatchResult(data as BatchResult<unknown>);
    } else if (isReviewResult(data)) {
      formatReviewResult(data);
    } else if (isFocusResult(data)) {
      formatFocusResult(data);
    } else if (isUrlResult(data)) {
      formatUrlResult(data);
    } else if (isDeferResult(data)) {
      formatDeferResult(data);
    } else if (isDropResult(data)) {
      formatDropResult(data);
    } else if (isDeleteResult(data)) {
      formatDeleteResult(data);
    } else if (isTaskPaperExportResult(data)) {
      formatTaskPaperExportResult(data);
    } else if (isTaskPaperImportResult(data)) {
      formatTaskPaperImportResult(data);
    } else if (isStatsResult(data)) {
      formatStatsResult(data);
    } else if (isSaveTemplateResult(data)) {
      formatSaveTemplateResult(data);
    } else if (isListTemplatesResult(data)) {
      formatListTemplatesResult(data);
    } else if (isCreateFromTemplateResult(data)) {
      formatCreateFromTemplateResult(data);
    } else if (isDeleteTemplateResult(data)) {
      formatDeleteTemplateResult(data);
    } else if (isAddAttachmentResult(data)) {
      formatAddAttachmentResult(data);
    } else if (isListAttachmentsResult(data)) {
      formatListAttachmentsResult(data);
    } else if (isRemoveAttachmentResult(data)) {
      formatRemoveAttachmentResult(data);
    } else if (isArchiveResult(data)) {
      formatArchiveResult(data);
    } else if (isCompactResult(data)) {
      formatCompactResult(data);
    } else if (isSyncStatus(data)) {
      formatSyncStatus(data);
    } else if (isSyncResult(data)) {
      formatSyncResult(data);
    } else {
      // Generic object output
      console.log(JSON.stringify(data, null, 2));
    }
    return;
  }

  // Handle primitives
  console.log(String(data));
}

/**
 * Output based on format preference.
 */
export function output<T>(result: CliOutput<T>, json: boolean): void {
  if (json) {
    outputJson(result);
  } else {
    outputHuman(result);
  }
}

// Type guards
function isTask(obj: unknown): obj is OFTask {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "name" in obj &&
    "flagged" in obj &&
    "completed" in obj
  );
}

function isProject(obj: unknown): obj is OFProject {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "name" in obj &&
    "status" in obj &&
    "sequential" in obj
  );
}

function isTag(obj: unknown): obj is OFTag {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "name" in obj &&
    "availableTaskCount" in obj
  );
}

function isCommandInfo(obj: unknown): obj is CommandInfo {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "name" in obj &&
    "description" in obj &&
    "usage" in obj
  );
}

function isFolder(obj: unknown): obj is OFFolder {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "name" in obj &&
    "projectCount" in obj &&
    "folderCount" in obj
  );
}

function isPerspective(obj: unknown): obj is OFPerspective {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "name" in obj &&
    "custom" in obj
  );
}

function isTaskWithChildren(obj: unknown): obj is OFTaskWithChildren {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "name" in obj &&
    "childTaskCount" in obj &&
    "isActionGroup" in obj
  );
}

interface DropResultLike {
  taskId: string;
  taskName: string;
  dropped: boolean;
}

function isDropResult(obj: unknown): obj is DropResultLike {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "taskId" in obj &&
    "taskName" in obj &&
    "dropped" in obj
  );
}

interface DeleteResultLike {
  taskId: string;
  deleted: true;
}

function isDeleteResult(obj: unknown): obj is DeleteResultLike {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "taskId" in obj &&
    "deleted" in obj &&
    (obj as { deleted: unknown }).deleted === true
  );
}

function isBatchResult(obj: unknown): obj is BatchResult<unknown> {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "succeeded" in obj &&
    "failed" in obj &&
    "totalSucceeded" in obj &&
    "totalFailed" in obj
  );
}

function isReviewResult(obj: unknown): obj is ReviewResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "projectId" in obj &&
    "projectName" in obj &&
    "lastReviewed" in obj
  );
}

function isFocusResult(obj: unknown): obj is FocusResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "focused" in obj &&
    "targetType" in obj
  );
}

function isUrlResult(obj: unknown): obj is UrlResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "url" in obj &&
    "type" in obj &&
    (obj as { type: unknown }).type !== undefined &&
    ["task", "project", "folder", "tag"].includes(
      (obj as { type: string }).type
    )
  );
}

function isDeferResult(obj: unknown): obj is DeferResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "taskId" in obj &&
    "newDeferDate" in obj &&
    "previousDeferDate" in obj
  );
}

// Formatters
function formatTask(task: OFTask): void {
  const flags: string[] = [];
  if (task.flagged) flags.push("flagged");
  if (task.completed) flags.push("completed");

  const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
  console.log(`${task.name}${flagStr}`);
  console.log(`  ID: ${task.id}`);
  if (task.projectName) console.log(`  Project: ${task.projectName}`);
  if (task.dueDate) console.log(`  Due: ${task.dueDate}`);
  if (task.deferDate) console.log(`  Defer: ${task.deferDate}`);
  if (task.tags.length > 0) console.log(`  Tags: ${task.tags.join(", ")}`);
  if (task.note) console.log(`  Note: ${task.note}`);
}

function formatTasks(tasks: OFTask[]): void {
  for (const task of tasks) {
    const flags: string[] = [];
    if (task.flagged) flags.push("*");
    if (task.completed) flags.push("x");

    const flagStr = flags.length > 0 ? `[${flags.join("")}] ` : "[ ] ";
    const dueStr = task.dueDate ? ` (due: ${task.dueDate})` : "";
    console.log(`${flagStr}${task.name}${dueStr}`);
    console.log(`    ${task.id}`);
  }
}

function formatProject(project: OFProject): void {
  console.log(project.name + " (" + project.status + ")");
  console.log("  ID: " + project.id);
  console.log("  Sequential: " + (project.sequential ? "yes" : "no"));
  console.log(
    "  Tasks: " +
      String(project.remainingTaskCount) +
      "/" +
      String(project.taskCount)
  );
  if (project.folderName) console.log("  Folder: " + project.folderName);
  if (project.note) console.log("  Note: " + project.note);
}

function formatProjects(projects: OFProject[]): void {
  for (const project of projects) {
    const statusIcon =
      project.status === "active"
        ? "-"
        : project.status === "completed"
          ? "x"
          : "o";
    console.log(
      "[" +
        statusIcon +
        "] " +
        project.name +
        " (" +
        String(project.remainingTaskCount) +
        " tasks)"
    );
    console.log("    " + project.id);
  }
}

function formatTag(tag: OFTag): void {
  console.log(tag.name);
  console.log("  ID: " + tag.id);
  console.log("  Available tasks: " + String(tag.availableTaskCount));
  if (tag.parentName) console.log("  Parent: " + tag.parentName);
}

function formatTags(tags: OFTag[]): void {
  for (const tag of tags) {
    const parentStr = tag.parentName ? " (in " + tag.parentName + ")" : "";
    console.log(
      tag.name + parentStr + " - " + String(tag.availableTaskCount) + " tasks"
    );
    console.log("  " + tag.id);
  }
}

function formatCommands(commands: CommandInfo[]): void {
  for (const cmd of commands) {
    console.log(cmd.name);
    console.log("  Usage: " + cmd.usage);
    console.log("  " + cmd.description);
    console.log();
  }
}

// Folder formatters
function formatFolder(folder: OFFolder): void {
  console.log(folder.name);
  console.log(`  ID: ${folder.id}`);
  console.log(`  Projects: ${String(folder.projectCount)}`);
  console.log(`  Subfolders: ${String(folder.folderCount)}`);
  if (folder.parentName) console.log(`  Parent: ${folder.parentName}`);
}

function formatFolders(folders: OFFolder[]): void {
  for (const folder of folders) {
    const parentStr = folder.parentName ? ` (in ${folder.parentName})` : "";
    console.log(
      `${folder.name}${parentStr} - ${String(folder.projectCount)} projects, ${String(folder.folderCount)} subfolders`
    );
    console.log(`  ${folder.id}`);
  }
}

// Perspective formatters
function formatPerspective(perspective: OFPerspective): void {
  const customStr = perspective.custom ? " (custom)" : " (built-in)";
  console.log(perspective.name + customStr);
  console.log(`  ID: ${perspective.id}`);
}

function formatPerspectives(perspectives: OFPerspective[]): void {
  for (const perspective of perspectives) {
    const customStr = perspective.custom ? "[custom]" : "[built-in]";
    console.log(`${customStr} ${perspective.name}`);
    console.log(`  ${perspective.id}`);
  }
}

// Task with children formatters
function formatTaskWithChildren(task: OFTaskWithChildren): void {
  const flags: string[] = [];
  if (task.flagged) flags.push("flagged");
  if (task.completed) flags.push("completed");
  if (task.isActionGroup) flags.push("action group");

  const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
  console.log(`${task.name}${flagStr}`);
  console.log(`  ID: ${task.id}`);
  if (task.parentTaskName) console.log(`  Parent: ${task.parentTaskName}`);
  console.log(`  Children: ${String(task.childTaskCount)}`);
  if (task.projectName) console.log(`  Project: ${task.projectName}`);
  if (task.dueDate) console.log(`  Due: ${task.dueDate}`);
  if (task.deferDate) console.log(`  Defer: ${task.deferDate}`);
  if (task.tags.length > 0) console.log(`  Tags: ${task.tags.join(", ")}`);
  if (task.note) console.log(`  Note: ${task.note}`);
}

function formatTasksWithChildren(tasks: OFTaskWithChildren[]): void {
  for (const task of tasks) {
    const flags: string[] = [];
    if (task.flagged) flags.push("*");
    if (task.completed) flags.push("x");

    const flagStr = flags.length > 0 ? `[${flags.join("")}] ` : "[ ] ";
    const childStr =
      task.childTaskCount > 0
        ? ` (${String(task.childTaskCount)} subtasks)`
        : "";
    console.log(`${flagStr}${task.name}${childStr}`);
    console.log(`    ${task.id}`);
  }
}

// Drop/Delete result formatters
function formatDropResult(result: DropResultLike): void {
  if (result.dropped) {
    console.log(`Dropped: ${result.taskName}`);
    console.log(`  Task ID: ${result.taskId}`);
  } else {
    console.log(`Failed to drop task: ${result.taskId}`);
  }
}

function formatDeleteResult(result: DeleteResultLike): void {
  console.log(`Deleted task: ${result.taskId}`);
}

// Batch result formatter
function formatBatchResult(result: BatchResult<unknown>): void {
  console.log(
    `Completed: ${String(result.totalSucceeded)} succeeded, ${String(result.totalFailed)} failed`
  );

  if (result.succeeded.length > 0) {
    console.log("\nSucceeded:");
    for (const item of result.succeeded) {
      if (typeof item === "object" && item !== null && "taskId" in item) {
        const taskItem = item as { taskId: string; taskName?: string };
        const name = taskItem.taskName ? ` - ${taskItem.taskName}` : "";
        console.log(`  ${taskItem.taskId}${name}`);
      } else {
        console.log(`  ${JSON.stringify(item)}`);
      }
    }
  }

  if (result.failed.length > 0) {
    console.log("\nFailed:");
    for (const item of result.failed) {
      console.log(`  ${item.id}: ${item.error}`);
    }
  }
}

// Review result formatter
function formatReviewResult(result: ReviewResult): void {
  console.log(`Reviewed: ${result.projectName}`);
  console.log(`  Project ID: ${result.projectId}`);
  console.log(`  Last reviewed: ${result.lastReviewed}`);
  if (result.nextReviewDate) {
    console.log(`  Next review: ${result.nextReviewDate}`);
  }
}

// Focus result formatter
function formatFocusResult(result: FocusResult): void {
  if (result.focused) {
    console.log(`Focused: ${result.targetName ?? "unknown"}`);
    console.log(`  ID: ${result.targetId ?? "unknown"}`);
    console.log(`  Type: ${result.targetType ?? "unknown"}`);
  } else {
    console.log("Not focused (showing all items)");
  }
}

// URL result formatter
function formatUrlResult(result: UrlResult): void {
  console.log(result.name);
  console.log(`  Type: ${result.type}`);
  console.log(`  ID: ${result.id}`);
  console.log(`  URL: ${result.url}`);
}

// Defer result formatter
function formatDeferResult(result: DeferResult): void {
  console.log(`Deferred: ${result.taskName}`);
  console.log(`  Task ID: ${result.taskId}`);
  if (result.previousDeferDate) {
    console.log(`  Previous defer: ${result.previousDeferDate}`);
  }
  console.log(`  New defer: ${result.newDeferDate}`);
}

// TaskPaper type guards
function isTaskPaperExportResult(obj: unknown): obj is TaskPaperExportResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "content" in obj &&
    "taskCount" in obj &&
    "projectCount" in obj
  );
}

function isTaskPaperImportResult(obj: unknown): obj is TaskPaperImportResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "tasksCreated" in obj &&
    "projectsCreated" in obj &&
    "errors" in obj
  );
}

// TaskPaper result formatters
function formatTaskPaperExportResult(result: TaskPaperExportResult): void {
  console.log(result.content);
  console.log(
    `\nExported ${String(result.taskCount)} tasks from ${String(result.projectCount)} projects`
  );
}

function formatTaskPaperImportResult(result: TaskPaperImportResult): void {
  console.log(`Import complete:`);
  console.log(`  Tasks created: ${String(result.tasksCreated)}`);
  console.log(`  Projects created: ${String(result.projectsCreated)}`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${String(result.errors.length)}`);
    for (const error of result.errors) {
      console.log(`    - ${error}`);
    }
  }
}

// Stats type guard
function isStatsResult(obj: unknown): obj is StatsResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "periodStart" in obj &&
    "periodEnd" in obj &&
    "tasksCompleted" in obj &&
    "tasksOverdue" in obj &&
    "tasksAvailable" in obj
  );
}

// Stats result formatter
function formatStatsResult(result: StatsResult): void {
  console.log(`Statistics for ${result.periodStart} to ${result.periodEnd}`);
  if (result.projectFilter) {
    console.log(`  Project: ${result.projectFilter}`);
  }
  console.log();
  console.log("Tasks:");
  console.log(`  Completed:  ${String(result.tasksCompleted)}`);
  console.log(`  Remaining:  ${String(result.tasksRemaining)}`);
  console.log(`  Available:  ${String(result.tasksAvailable)}`);
  console.log(`  Overdue:    ${String(result.tasksOverdue)}`);
  console.log(`  Flagged:    ${String(result.tasksFlagged)}`);
  console.log(`  Due today:  ${String(result.tasksDueToday)}`);
  console.log(`  Due this week: ${String(result.tasksDueThisWeek)}`);
  console.log();
  console.log("Projects:");
  console.log(`  Active:     ${String(result.projectsActive)}`);
  console.log(`  On hold:    ${String(result.projectsOnHold)}`);
}

// Template type guards
function isSaveTemplateResult(obj: unknown): obj is SaveTemplateResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "name" in obj &&
    "taskCount" in obj &&
    "path" in obj
  );
}

function isListTemplatesResult(obj: unknown): obj is ListTemplatesResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "templates" in obj &&
    Array.isArray((obj as { templates: unknown }).templates)
  );
}

function isCreateFromTemplateResult(
  obj: unknown
): obj is CreateFromTemplateResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "projectName" in obj &&
    "tasksCreated" in obj &&
    "projectId" in obj
  );
}

function isDeleteTemplateResult(obj: unknown): obj is DeleteTemplateResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "name" in obj &&
    "deleted" in obj &&
    (obj as { deleted: unknown }).deleted === true &&
    !("taskId" in obj) // Differentiate from task delete result
  );
}

// Template result formatters
function formatSaveTemplateResult(result: SaveTemplateResult): void {
  console.log(`Template saved: ${result.name}`);
  console.log(`  Tasks: ${String(result.taskCount)}`);
  console.log(`  Path: ${result.path}`);
}

function formatListTemplatesResult(result: ListTemplatesResult): void {
  if (result.templates.length === 0) {
    console.log("No templates found.");
    console.log(
      "  Use 'ofocus template-save' to create a template from an existing project."
    );
    return;
  }

  console.log(`Templates (${String(result.templates.length)}):`);
  for (const template of result.templates) {
    console.log(`  ${template.name}`);
    if (template.description) {
      console.log(`    Description: ${template.description}`);
    }
    console.log(`    Tasks: ${String(template.taskCount)}`);
    if (template.sourceProject) {
      console.log(`    Source: ${template.sourceProject}`);
    }
    console.log(`    Created: ${template.createdAt}`);
  }
}

function formatCreateFromTemplateResult(
  result: CreateFromTemplateResult
): void {
  console.log(`Project created from template: ${result.projectName}`);
  console.log(`  Project ID: ${result.projectId}`);
  console.log(`  Tasks created: ${String(result.tasksCreated)}`);
}

function formatDeleteTemplateResult(result: DeleteTemplateResult): void {
  console.log(`Template deleted: ${result.name}`);
}

// Attachment type guards
function isAddAttachmentResult(obj: unknown): obj is AddAttachmentResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "taskId" in obj &&
    "taskName" in obj &&
    "fileName" in obj &&
    "attached" in obj
  );
}

function isListAttachmentsResult(obj: unknown): obj is ListAttachmentsResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "taskId" in obj &&
    "taskName" in obj &&
    "attachments" in obj &&
    Array.isArray((obj as { attachments: unknown }).attachments)
  );
}

function isRemoveAttachmentResult(obj: unknown): obj is RemoveAttachmentResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "taskId" in obj &&
    "attachmentName" in obj &&
    "removed" in obj
  );
}

// Attachment result formatters
function formatAddAttachmentResult(result: AddAttachmentResult): void {
  if (result.attached) {
    console.log(`Attached: ${result.fileName}`);
    console.log(`  Task: ${result.taskName}`);
    console.log(`  Task ID: ${result.taskId}`);
  } else {
    console.log(`Failed to attach file to task: ${result.taskId}`);
  }
}

function formatListAttachmentsResult(result: ListAttachmentsResult): void {
  console.log(`Attachments for: ${result.taskName}`);
  console.log(`  Task ID: ${result.taskId}`);
  if (result.attachments.length === 0) {
    console.log("  No attachments");
    return;
  }
  console.log(`  Count: ${String(result.attachments.length)}`);
  for (const att of result.attachments) {
    console.log(`  - ${att.name}`);
    console.log(`      ID: ${att.id}`);
  }
}

function formatRemoveAttachmentResult(result: RemoveAttachmentResult): void {
  if (result.removed) {
    console.log(`Removed attachment: ${result.attachmentName}`);
    console.log(`  Task ID: ${result.taskId}`);
  } else {
    console.log(`Failed to remove attachment from task: ${result.taskId}`);
  }
}

// Archive type guards
function isArchiveResult(obj: unknown): obj is ArchiveResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "tasksArchived" in obj &&
    "projectsArchived" in obj &&
    "dryRun" in obj
  );
}

function isCompactResult(obj: unknown): obj is CompactResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "compacted" in obj &&
    "message" in obj
  );
}

// Archive result formatters
function formatArchiveResult(result: ArchiveResult): void {
  if (result.dryRun) {
    console.log("Archive preview (dry run):");
  } else {
    console.log("Archive complete:");
  }
  console.log(`  Tasks archived: ${String(result.tasksArchived)}`);
  console.log(`  Projects archived: ${String(result.projectsArchived)}`);
  if (result.archivePath) {
    console.log(`  Archive path: ${result.archivePath}`);
  }
}

function formatCompactResult(result: CompactResult): void {
  if (result.compacted) {
    console.log("Database compaction:");
    console.log(`  ${result.message}`);
  } else {
    console.log(`Compaction failed: ${result.message}`);
  }
}

// Sync type guards
function isSyncStatus(obj: unknown): obj is SyncStatus {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "syncing" in obj &&
    "syncEnabled" in obj
  );
}

function isSyncResult(obj: unknown): obj is SyncResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "triggered" in obj &&
    "message" in obj &&
    !("compacted" in obj) // Distinguish from CompactResult
  );
}

function isPaginatedResult(obj: unknown): obj is PaginatedResult<unknown> {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "items" in obj &&
    "totalCount" in obj &&
    "returnedCount" in obj &&
    "hasMore" in obj &&
    "offset" in obj &&
    "limit" in obj &&
    Array.isArray((obj as { items: unknown }).items)
  );
}

// Sync result formatters
function formatSyncStatus(result: SyncStatus): void {
  console.log("Sync Status:");
  console.log(`  Syncing: ${result.syncing ? "yes" : "no"}`);
  console.log(`  Sync enabled: ${result.syncEnabled ? "yes" : "no"}`);
  if (result.lastSync) {
    console.log(`  Last sync: ${result.lastSync}`);
  }
  if (result.accountName) {
    console.log(`  Account: ${result.accountName}`);
  }
}

function formatSyncResult(result: SyncResult): void {
  if (result.triggered) {
    console.log("Sync:");
    console.log(`  ${result.message}`);
  } else {
    console.log(`Sync failed: ${result.message}`);
  }
}

// Paginated result formatter
function formatPaginatedResult(result: PaginatedResult<unknown>): void {
  const items = result.items;
  const start = result.offset + 1;
  const end = result.offset + result.returnedCount;

  // Format the items based on their type
  if (items.length === 0) {
    console.log("No results found.");
  } else {
    const first: unknown = items[0];
    if (isTask(first)) {
      formatTasks(items as OFTask[]);
    } else if (isTaskWithChildren(first)) {
      formatTasksWithChildren(items as OFTaskWithChildren[]);
    } else if (isProject(first)) {
      formatProjects(items as OFProject[]);
    } else if (isTag(first)) {
      formatTags(items as OFTag[]);
    } else if (isFolder(first)) {
      formatFolders(items as OFFolder[]);
    } else if (isPerspective(first)) {
      formatPerspectives(items as OFPerspective[]);
    } else {
      // Generic array output
      for (const item of items) {
        console.log(JSON.stringify(item));
      }
    }
  }

  // Show pagination info
  console.log();
  if (result.totalCount === 0) {
    console.log("Total: 0 items");
  } else {
    console.log(
      `Showing ${String(start)}-${String(end)} of ${String(result.totalCount)} items`
    );
    if (result.hasMore) {
      const remaining = result.totalCount - end;
      console.log(
        `(${String(remaining)} more available, use --offset ${String(end)} to see next page)`
      );
    }
  }
}

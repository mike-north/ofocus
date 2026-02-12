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
    if (isTask(data)) {
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
    } else if (isDropResult(data)) {
      formatDropResult(data);
    } else if (isDeleteResult(data)) {
      formatDeleteResult(data);
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
      task.childTaskCount > 0 ? ` (${String(task.childTaskCount)} subtasks)` : "";
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

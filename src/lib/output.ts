import type {
  CliOutput,
  CliError,
  OFTask,
  OFProject,
  OFTag,
  CommandInfo,
} from "./types.js";
import { ErrorCode, createError } from "./errors.js";

/**
 * Create a successful CLI output.
 */
export function success<T>(data: T): CliOutput<T> {
  return {
    success: true,
    data,
    error: null,
  };
}

/**
 * Create a failed CLI output with a structured error.
 */
export function failure<T = null>(error: CliError): CliOutput<T> {
  return {
    success: false,
    data: null,
    error,
  };
}

/**
 * Create a failed CLI output with a simple string message.
 * This is a convenience function that wraps the message in an UNKNOWN_ERROR.
 */
export function failureMessage<T = null>(message: string): CliOutput<T> {
  return failure<T>(createError(ErrorCode.UNKNOWN_ERROR, message));
}

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
    } else if (isProject(first)) {
      formatProjects(data as OFProject[]);
    } else if (isTag(first)) {
      formatTags(data as OFTag[]);
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
    } else if (isProject(data)) {
      formatProject(data);
    } else if (isTag(data)) {
      formatTag(data);
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

import type { CliError } from "./errors.js";

/**
 * Standard CLI output format for all commands.
 */
export interface CliOutput<T> {
  success: boolean;
  data: T | null;
  error: CliError | null;
}

// Re-export CliError for convenience
export type { CliError } from "./errors.js";

/**
 * Metadata about a CLI command for semantic activation by AI agents.
 */
export interface CommandInfo {
  name: string;
  description: string;
  usage: string;
}

/**
 * OmniFocus task representation.
 */
export interface OFTask {
  id: string;
  name: string;
  note: string | null;
  flagged: boolean;
  completed: boolean;
  dueDate: string | null;
  deferDate: string | null;
  completionDate: string | null;
  projectId: string | null;
  projectName: string | null;
  tags: string[];
}

/**
 * OmniFocus project representation.
 */
export interface OFProject {
  id: string;
  name: string;
  note: string | null;
  status: "active" | "on-hold" | "completed" | "dropped";
  sequential: boolean;
  folderId: string | null;
  folderName: string | null;
  taskCount: number;
  remainingTaskCount: number;
}

/**
 * OmniFocus tag representation.
 */
export interface OFTag {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  availableTaskCount: number;
}

/**
 * OmniFocus perspective representation.
 */
export interface OFPerspective {
  id: string;
  name: string;
}

/**
 * Options for adding a task to the inbox.
 */
export interface InboxOptions {
  note?: string | undefined;
  due?: string | undefined;
  defer?: string | undefined;
  flag?: boolean | undefined;
  tags?: string[] | undefined;
}

/**
 * Options for querying tasks.
 */
export interface TaskQueryOptions {
  project?: string | undefined;
  tag?: string | undefined;
  dueBefore?: string | undefined;
  dueAfter?: string | undefined;
  flagged?: boolean | undefined;
  completed?: boolean | undefined;
  available?: boolean | undefined;
}

/**
 * Options for querying projects.
 */
export interface ProjectQueryOptions {
  folder?: string | undefined;
  status?: "active" | "on-hold" | "completed" | "dropped" | undefined;
  sequential?: boolean | undefined;
}

/**
 * Options for querying tags.
 */
export interface TagQueryOptions {
  parent?: string | undefined;
}

/**
 * Options for updating a task.
 */
export interface TaskUpdateOptions {
  title?: string | undefined;
  note?: string | undefined;
  due?: string | undefined;
  defer?: string | undefined;
  flag?: boolean | undefined;
  project?: string | undefined;
  tags?: string[] | undefined;
}

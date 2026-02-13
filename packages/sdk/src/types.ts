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
  estimatedMinutes: number | null;
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
  custom: boolean;
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
  estimatedMinutes?: number | undefined;
  repeat?: RepetitionRule | undefined;
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
  estimatedMinutes?: number | undefined;
  clearEstimate?: boolean | undefined;
  repeat?: RepetitionRule | undefined;
  clearRepeat?: boolean | undefined;
}

/**
 * OmniFocus folder representation.
 */
export interface OFFolder {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  projectCount: number;
  folderCount: number;
}

/**
 * Options for creating a project.
 */
export interface CreateProjectOptions {
  note?: string | undefined;
  folderId?: string | undefined;
  folderName?: string | undefined;
  sequential?: boolean | undefined;
  status?: "active" | "on-hold" | undefined;
  dueDate?: string | undefined;
  deferDate?: string | undefined;
}

/**
 * Options for creating a folder.
 */
export interface CreateFolderOptions {
  parentFolderId?: string | undefined;
  parentFolderName?: string | undefined;
}

/**
 * Options for querying folders.
 */
export interface FolderQueryOptions {
  parent?: string | undefined;
}

/**
 * Options for creating a tag.
 */
export interface CreateTagOptions {
  parentTagId?: string | undefined;
  parentTagName?: string | undefined;
}

/**
 * Options for updating a tag.
 */
export interface UpdateTagOptions {
  name?: string | undefined;
  parentTagId?: string | undefined;
  parentTagName?: string | undefined;
}

/**
 * OmniFocus task with hierarchy information.
 */
export interface OFTaskWithChildren extends OFTask {
  parentTaskId: string | null;
  parentTaskName: string | null;
  childTaskCount: number;
  isActionGroup: boolean;
}

/**
 * Options for querying subtasks.
 */
export interface SubtaskQueryOptions {
  completed?: boolean | undefined;
  flagged?: boolean | undefined;
}

/**
 * Result from a batch operation.
 */
export interface BatchResult<T> {
  succeeded: T[];
  failed: { id: string; error: string }[];
  totalSucceeded: number;
  totalFailed: number;
}

/**
 * Repetition rule for recurring tasks.
 */
export interface RepetitionRule {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  repeatMethod: "due-again" | "defer-another";
  daysOfWeek?: number[] | undefined;
  dayOfMonth?: number | undefined;
}

/**
 * Options for searching tasks.
 */
export interface SearchOptions {
  scope?: "name" | "note" | "both" | undefined;
  limit?: number | undefined;
  includeCompleted?: boolean | undefined;
}

/**
 * Result from a review operation.
 */
export interface ReviewResult {
  projectId: string;
  projectName: string;
  lastReviewed: string;
  nextReviewDate: string | null;
}

/**
 * Options for updating a project.
 */
export interface UpdateProjectOptions {
  name?: string | undefined;
  note?: string | undefined;
  status?: "active" | "on-hold" | "completed" | "dropped" | undefined;
  folderId?: string | undefined;
  folderName?: string | undefined;
  sequential?: boolean | undefined;
  dueDate?: string | undefined;
  deferDate?: string | undefined;
}

/**
 * Options for updating a folder.
 */
export interface UpdateFolderOptions {
  name?: string | undefined;
  parentFolderId?: string | undefined;
  parentFolderName?: string | undefined;
}

/**
 * Options for duplicating a task.
 */
export interface DuplicateTaskOptions {
  includeSubtasks?: boolean | undefined;
}

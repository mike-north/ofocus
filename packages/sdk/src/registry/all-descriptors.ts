/**
 * Canonical array of every command descriptor registered in the SDK.
 *
 * This array is the single source of truth for the full command surface.
 * Consumers (CLI `list-commands`, documentation generators, test coverage
 * assertions) import this rather than maintaining their own parallel lists.
 *
 * When a new command is added to the SDK, add its descriptor here. No other
 * list needs to be updated — the CLI and MCP surfaces derive automatically.
 *
 * @public
 */

import type { ResolvedCommandDescriptor } from "./define.js";

// Tasks
import { addToInboxDescriptor } from "../commands/inbox.js";
import { queryTasksDescriptor } from "../commands/tasks.js";
import { completeTaskDescriptor } from "../commands/complete.js";
import { updateTaskDescriptor } from "../commands/update.js";
import { dropTaskDescriptor, deleteTaskDescriptor } from "../commands/drop.js";
import { duplicateTaskDescriptor } from "../commands/duplicate.js";
import {
  createSubtaskDescriptor,
  querySubtasksDescriptor,
  moveTaskToParentDescriptor,
} from "../commands/subtasks.js";
import {
  completeTasksDescriptor,
  updateTasksDescriptor,
  deleteTasksDescriptor,
} from "../commands/batch.js";
import {
  deferTaskDescriptor,
  deferTasksDescriptor,
} from "../commands/defer.js";
import { searchTasksDescriptor } from "../commands/search.js";
import { quickCaptureDescriptor } from "../commands/quick.js";
import {
  applyRepetitionRuleDescriptor,
  clearRepetitionRuleDescriptor,
} from "../commands/repetition.js";

// Projects
import { listProjectsDescriptor } from "../commands/projects.js";
import { createProjectDescriptor } from "../commands/create-project.js";
import {
  updateProjectDescriptor,
  deleteProjectDescriptor,
  dropProjectDescriptor,
} from "../commands/projects-crud.js";
import {
  reviewProjectDescriptor,
  queryProjectsForReviewDescriptor,
  getReviewIntervalDescriptor,
  setReviewIntervalDescriptor,
} from "../commands/review.js";

// Folders
import {
  listFoldersDescriptor,
  createFolderDescriptor,
} from "../commands/folders.js";
import {
  updateFolderDescriptor,
  deleteFolderDescriptor,
} from "../commands/folders-crud.js";

// Tags
import { listTagsDescriptor } from "../commands/tags.js";
import {
  createTagDescriptor,
  updateTagDescriptor,
  deleteTagDescriptor,
} from "../commands/tags-crud.js";

// Perspectives
import {
  listPerspectivesDescriptor,
  queryPerspectiveDescriptor,
} from "../commands/perspectives.js";

// Forecast, Focus, Deferred
import { queryForecastDescriptor } from "../commands/forecast.js";
import {
  focusOnDescriptor,
  unfocusDescriptor,
  getFocusedDescriptor,
} from "../commands/focus.js";
import { queryDeferredDescriptor } from "../commands/deferred.js";

// TaskPaper
import {
  exportTaskPaperDescriptor,
  importTaskPaperDescriptor,
} from "../commands/taskpaper.js";

// Templates
import {
  saveTemplateDescriptor,
  listTemplatesDescriptor,
  getTemplateDescriptor,
  createFromTemplateDescriptor,
  deleteTemplateDescriptor,
} from "../commands/templates.js";

// Attachments
import {
  addAttachmentDescriptor,
  listAttachmentsDescriptor,
  removeAttachmentDescriptor,
} from "../commands/attachments.js";

// Archive & cleanup
import {
  archiveTasksDescriptor,
  compactDatabaseDescriptor,
} from "../commands/archive.js";

// Sync
import {
  getSyncStatusDescriptor,
  triggerSyncDescriptor,
} from "../commands/sync.js";

// Statistics
import { getStatsDescriptor } from "../commands/stats.js";

// URL & deep linking
import { generateUrlDescriptor } from "../commands/url.js";
import { openItemDescriptor } from "../commands/open.js";

// Eval escape hatch
import { evaluateScriptDescriptor } from "../commands/evaluate.js";

/**
 * Every command descriptor registered in the SDK, in no particular order.
 *
 * This is the authoritative list. CLI and MCP surfaces are derived from it.
 * Note: `importTaskPaperDescriptor` (`cliName: "import-taskpaper"`) is the
 * MCP tool surface for content-based import. The CLI exposes a different
 * file-path-based `import` command that is hand-wired in `cli.ts`.
 *
 * @public
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous descriptor array; each element is a valid ResolvedCommandDescriptor with differing input/output/schema generics */
export const allCommandDescriptors: readonly ResolvedCommandDescriptor<
  any,
  any,
  any
>[] = [
  // Tasks
  addToInboxDescriptor,
  queryTasksDescriptor,
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
  // Projects
  listProjectsDescriptor,
  createProjectDescriptor,
  updateProjectDescriptor,
  deleteProjectDescriptor,
  dropProjectDescriptor,
  reviewProjectDescriptor,
  queryProjectsForReviewDescriptor,
  getReviewIntervalDescriptor,
  setReviewIntervalDescriptor,
  // Folders
  listFoldersDescriptor,
  createFolderDescriptor,
  updateFolderDescriptor,
  deleteFolderDescriptor,
  // Tags
  listTagsDescriptor,
  createTagDescriptor,
  updateTagDescriptor,
  deleteTagDescriptor,
  // Perspectives
  listPerspectivesDescriptor,
  queryPerspectiveDescriptor,
  // Forecast, Focus, Deferred
  queryForecastDescriptor,
  focusOnDescriptor,
  unfocusDescriptor,
  getFocusedDescriptor,
  queryDeferredDescriptor,
  // TaskPaper
  exportTaskPaperDescriptor,
  importTaskPaperDescriptor,
  // Templates
  saveTemplateDescriptor,
  listTemplatesDescriptor,
  getTemplateDescriptor,
  createFromTemplateDescriptor,
  deleteTemplateDescriptor,
  // Attachments
  addAttachmentDescriptor,
  listAttachmentsDescriptor,
  removeAttachmentDescriptor,
  // Archive & cleanup
  archiveTasksDescriptor,
  compactDatabaseDescriptor,
  // Sync
  getSyncStatusDescriptor,
  triggerSyncDescriptor,
  // Statistics
  getStatsDescriptor,
  // URL & deep linking
  generateUrlDescriptor,
  openItemDescriptor,
  // Eval escape hatch
  evaluateScriptDescriptor,
];
/* eslint-enable @typescript-eslint/no-explicit-any */

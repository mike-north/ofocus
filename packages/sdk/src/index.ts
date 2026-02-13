// Types
export type {
  CliOutput,
  CliError,
  CommandInfo,
  OFTask,
  OFProject,
  OFTag,
  OFPerspective,
  OFFolder,
  OFTaskWithChildren,
  InboxOptions,
  TaskQueryOptions,
  ProjectQueryOptions,
  TagQueryOptions,
  TaskUpdateOptions,
  CreateProjectOptions,
  CreateFolderOptions,
  FolderQueryOptions,
  CreateTagOptions,
  UpdateTagOptions,
  SubtaskQueryOptions,
  BatchResult,
  RepetitionRule,
  SearchOptions,
  ReviewResult,
  UpdateProjectOptions,
  UpdateFolderOptions,
  DuplicateTaskOptions,
} from "./types.js";

// Error handling
export { ErrorCode, createError, parseAppleScriptError } from "./errors.js";
export type { ErrorCode as ErrorCodeType } from "./errors.js";

// Result helpers
export { success, failure, failureMessage } from "./result.js";

// Utilities
export { escapeAppleScript } from "./escape.js";
export {
  validateId,
  validateDateString,
  validateTags,
  validateProjectName,
  validateFolderName,
  validateTagName,
  validateRepetitionRule,
  validateEstimatedMinutes,
  validateSearchQuery,
} from "./validation.js";

// AppleScript utilities
export {
  runAppleScript,
  runAppleScriptFile,
  omniFocusScript,
  omniFocusScriptWithHelpers,
  jsonHelpers,
} from "./applescript.js";
export type { AppleScriptResult } from "./applescript.js";

// Commands
export { addToInbox } from "./commands/inbox.js";
export { queryTasks } from "./commands/tasks.js";
export { queryProjects } from "./commands/projects.js";
export { queryTags } from "./commands/tags.js";
export { completeTask } from "./commands/complete.js";
export type { CompleteResult } from "./commands/complete.js";
export { updateTask } from "./commands/update.js";

// Phase 1: Projects & Folders
export { createProject } from "./commands/create-project.js";
export { createFolder, queryFolders } from "./commands/folders.js";

// Phase 1: Project CRUD
export {
  updateProject,
  deleteProject,
  dropProject,
} from "./commands/projects-crud.js";
export type {
  DeleteProjectResult,
  DropProjectResult,
} from "./commands/projects-crud.js";

// Phase 1: Folder CRUD
export { updateFolder, deleteFolder } from "./commands/folders-crud.js";
export type { DeleteFolderResult } from "./commands/folders-crud.js";

// Phase 1: Drop/Delete Tasks
export { dropTask, deleteTask } from "./commands/drop.js";
export type { DropResult, DeleteResult } from "./commands/drop.js";

// Phase 1: Tags CRUD
export { createTag, updateTag, deleteTag } from "./commands/tags-crud.js";
export type { DeleteTagResult } from "./commands/tags-crud.js";

// Phase 2: Subtasks
export {
  createSubtask,
  querySubtasks,
  moveTaskToParent,
} from "./commands/subtasks.js";

// Phase 3: Batch Operations
export { completeTasks, updateTasks, deleteTasks } from "./commands/batch.js";
export type { BatchCompleteItem, BatchDeleteItem } from "./commands/batch.js";

// Phase 3: Repetition helpers
export {
  buildRRule,
  buildRepetitionRuleScript,
} from "./commands/repetition.js";

// Phase 4: Search
export { searchTasks } from "./commands/search.js";

// Phase 4: Perspectives
export { listPerspectives, queryPerspective } from "./commands/perspectives.js";
export type { PerspectiveQueryOptions } from "./commands/perspectives.js";

// Phase 4: Review
export {
  reviewProject,
  queryProjectsForReview,
  getReviewInterval,
  setReviewInterval,
} from "./commands/review.js";
export type { ReviewIntervalResult } from "./commands/review.js";

// Phase 5: Forecast, Focus, Deferred
export { queryForecast } from "./commands/forecast.js";
export type { ForecastOptions } from "./commands/forecast.js";

export { focus, unfocus, getFocused } from "./commands/focus.js";
export type { FocusResult } from "./commands/focus.js";

export { queryDeferred } from "./commands/deferred.js";
export type { DeferredQueryOptions } from "./commands/deferred.js";

export { generateUrl } from "./commands/url.js";
export type { UrlResult } from "./commands/url.js";

export { deferTask, deferTasks } from "./commands/defer.js";
export type {
  DeferOptions,
  DeferResult,
  BatchDeferItem,
} from "./commands/defer.js";

// Phase 6: Quick Capture
export { quickCapture, parseQuickInput } from "./commands/quick.js";
export type { ParsedQuickInput, QuickOptions } from "./commands/quick.js";

// Phase 6: TaskPaper Import/Export
export { exportTaskPaper, importTaskPaper } from "./commands/taskpaper.js";
export type {
  TaskPaperExportOptions,
  TaskPaperExportResult,
  TaskPaperImportOptions,
  TaskPaperImportResult,
} from "./commands/taskpaper.js";

// Phase 6: Statistics
export { getStats } from "./commands/stats.js";
export type { StatsOptions, StatsResult } from "./commands/stats.js";

// Phase 7: Templates
export {
  saveTemplate,
  listTemplates,
  getTemplate,
  createFromTemplate,
  deleteTemplate,
} from "./commands/templates.js";
export type {
  TemplateTask,
  ProjectTemplate,
  TemplateSummary,
  SaveTemplateOptions,
  SaveTemplateResult,
  ListTemplatesResult,
  CreateFromTemplateOptions,
  CreateFromTemplateResult,
  DeleteTemplateResult,
} from "./commands/templates.js";

// Phase 8: Attachments
export {
  addAttachment,
  listAttachments,
  removeAttachment,
} from "./commands/attachments.js";
export type {
  OFAttachment,
  AddAttachmentResult,
  ListAttachmentsResult,
  RemoveAttachmentResult,
} from "./commands/attachments.js";

// Phase 8: Archive & Cleanup
export { archiveTasks, compactDatabase } from "./commands/archive.js";
export type {
  ArchiveOptions,
  ArchiveResult,
  CompactResult,
} from "./commands/archive.js";

// Phase 8: Sync
export { getSyncStatus, triggerSync } from "./commands/sync.js";
export type { SyncStatus, SyncResult } from "./commands/sync.js";

// Phase 9: Task Utilities
export { duplicateTask } from "./commands/duplicate.js";
export type { DuplicateTaskResult } from "./commands/duplicate.js";

export { openItem } from "./commands/open.js";
export type { OpenResult } from "./commands/open.js";

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
  PaginationOptions,
  PaginatedResult,
  TaskQueryOptions,
  ProjectQueryOptions,
  TagQueryOptions,
  TaskUpdateOptions,
  CreateProjectOptions,
  CreateFolderOptions,
  FolderQueryOptions,
  CreateTagOptions,
  UpdateTagOptions,
  BatchResult,
  RepetitionRule,
  ReviewResult,
  UpdateProjectOptions,
  UpdateFolderOptions,
  DuplicateTaskOptions,
} from "./types.js";

// Error handling
export { ErrorCode, createError, parseScriptError } from "./errors.js";
export type { ErrorCode as ErrorCodeType } from "./errors.js";

// Result helpers
export { success, failure, failureMessage } from "./result.js";

// Auto-paginating async iteration over list queries
export { paginate, paginatePages, PaginationError } from "./pagination.js";
export type { ListQueryFn, QueryFnItem } from "./pagination.js";

// Validation
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
  validatePaginationParams,
  MAX_PAGINATION_LIMIT,
} from "./validation.js";

// Script execution engine (OmniJS via osascript)
export {
  runOmniJS,
  runOmniJSWrapped,
  wrapOmniJS,
  toOmniJSDate,
  escapeJSString,
} from "./omnijs.js";
export type { OmniJSResult } from "./omnijs.js";

// Shared query layer (predicates, projection, sort, aggregate, etc.)
export {
  buildListQueryBody,
  compileTaskPredicates,
  compileProjection,
  compileSort,
  compileAggregate,
  parseDate,
  parseDuration,
  taskFieldSpec,
  projectFieldSpec,
  folderFieldSpec,
  tagFieldSpec,
  taskGroupKeys,
  splitCommaSeparated,
  commaSeparatedStringArray,
  listProjectionSchema,
  listSortSchema,
} from "./query/index.js";
export type {
  BaseListQueryOptions,
  QueryResult,
  TagMode,
  TaskStatus,
  NumericRange,
  ParsedDate,
  EntityFieldSpec,
  FieldGetter,
  GroupKeySpec,
  CompiledProjection,
  CompileProjectionOptions,
  CompiledSort,
  CompileSortOptions,
  AggregateShape,
  CompiledAggregate,
  CompiledPredicates,
  BuildListQueryBodyArgs,
} from "./query/index.js";

// Tasks
export { addToInbox } from "./commands/inbox.js";
export { queryTasks, queryTasksDescriptor } from "./commands/tasks.js";
export { completeTask } from "./commands/complete.js";
export type { CompleteResult } from "./commands/complete.js";
export { updateTask, updateTaskDescriptor } from "./commands/update.js";
export { dropTask, deleteTask } from "./commands/drop.js";
export type { DropResult, DeleteResult } from "./commands/drop.js";
export { duplicateTask } from "./commands/duplicate.js";
export type { DuplicateTaskResult } from "./commands/duplicate.js";
export { deferTask, deferTasks } from "./commands/defer.js";
export type {
  DeferOptions,
  DeferResult,
  BatchDeferItem,
} from "./commands/defer.js";

// Subtasks
export {
  createSubtask,
  querySubtasks,
  moveTaskToParent,
} from "./commands/subtasks.js";
export type { SubtaskQueryOptions } from "./commands/subtasks.js";

// Batch operations
export { completeTasks, updateTasks, deleteTasks } from "./commands/batch.js";
export type { BatchCompleteItem, BatchDeleteItem } from "./commands/batch.js";

// Projects
export { queryProjects } from "./commands/projects.js";
export { createProject } from "./commands/create-project.js";
export {
  updateProject,
  deleteProject,
  dropProject,
} from "./commands/projects-crud.js";
export type {
  DeleteProjectResult,
  DropProjectResult,
} from "./commands/projects-crud.js";

// Folders
export { createFolder, queryFolders } from "./commands/folders.js";
export { updateFolder, deleteFolder } from "./commands/folders-crud.js";
export type { DeleteFolderResult } from "./commands/folders-crud.js";

// Tags
export { queryTags } from "./commands/tags.js";
export { createTag, updateTag, deleteTag } from "./commands/tags-crud.js";
export type { DeleteTagResult } from "./commands/tags-crud.js";

// Perspectives
export {
  listPerspectives,
  queryPerspective,
  createPerspective,
  renamePerspective,
  deletePerspective,
} from "./commands/perspectives.js";
export type {
  PerspectiveQueryOptions,
  CreatePerspectiveOptions,
  CreatePerspectiveResult,
  RenamePerspectiveResult,
  DeletePerspectiveResult,
} from "./commands/perspectives.js";

// Review
export {
  reviewProject,
  queryProjectsForReview,
  getReviewInterval,
  setReviewInterval,
} from "./commands/review.js";
export type { ReviewIntervalResult } from "./commands/review.js";

// Forecast, Focus, Deferred
export { queryForecast } from "./commands/forecast.js";
export type { ForecastOptions } from "./commands/forecast.js";
export { focusOn, unfocus, getFocused } from "./commands/focus.js";
export type { FocusResult } from "./commands/focus.js";
export { queryDeferred } from "./commands/deferred.js";
export type { DeferredQueryOptions } from "./commands/deferred.js";

// Search
export { searchTasks } from "./commands/search.js";
export type { SearchOptions } from "./commands/search.js";

// Quick capture
export { quickCapture, parseQuickInput } from "./commands/quick.js";
export type { ParsedQuickInput, QuickOptions } from "./commands/quick.js";

// TaskPaper import/export
export { exportTaskPaper, importTaskPaper } from "./commands/taskpaper.js";
export type {
  TaskPaperExportOptions,
  TaskPaperExportResult,
  TaskPaperImportOptions,
  TaskPaperImportResult,
} from "./commands/taskpaper.js";

// Templates
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

// Attachments
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

// Statistics
export { getStats, getStatsDescriptor } from "./commands/stats.js";
export type { StatsOptions, StatsResult } from "./commands/stats.js";

// URL & deep linking
export { generateUrl } from "./commands/url.js";
export type { UrlResult } from "./commands/url.js";
export { openItem } from "./commands/open.js";
export type { OpenResult } from "./commands/open.js";

// Archive & cleanup
export { archiveTasks, compactDatabase } from "./commands/archive.js";
export type {
  ArchiveOptions,
  ArchiveResult,
  CompactResult,
} from "./commands/archive.js";

// Sync
export { getSyncStatus, triggerSync } from "./commands/sync.js";
export type { SyncStatus, SyncResult } from "./commands/sync.js";

// Repetition helpers and commands
export {
  buildRRule,
  repeatMethodToOmniJS,
  applyRepetitionRule,
  clearRepetitionRule,
} from "./commands/repetition.js";
export type {
  ApplyRepetitionRuleResult,
  ClearRepetitionRuleResult,
} from "./commands/repetition.js";

// Centralized command registry — drives CLI subcommands and MCP tools
// from a single descriptor per command.
export {
  defineCommand,
  toKebabCase,
  toSnakeCase,
  validateCanonicalName,
  allCommandDescriptors,
} from "./registry/index.js";
export type {
  CommandDescriptor,
  ResolvedCommandDescriptor,
} from "./registry/index.js";

// Command descriptors (migrated to the centralized registry).
export { addToInboxDescriptor } from "./commands/inbox.js";
export { completeTaskDescriptor } from "./commands/complete.js";
export { dropTaskDescriptor, deleteTaskDescriptor } from "./commands/drop.js";
export { duplicateTaskDescriptor } from "./commands/duplicate.js";
export { searchTasksDescriptor } from "./commands/search.js";
export { queryForecastDescriptor } from "./commands/forecast.js";
export { queryDeferredDescriptor } from "./commands/deferred.js";
export { quickCaptureDescriptor } from "./commands/quick.js";
export {
  createSubtaskDescriptor,
  querySubtasksDescriptor,
  moveTaskToParentDescriptor,
} from "./commands/subtasks.js";
export {
  completeTasksDescriptor,
  updateTasksDescriptor,
  deleteTasksDescriptor,
} from "./commands/batch.js";
export { deferTaskDescriptor, deferTasksDescriptor } from "./commands/defer.js";
export { listProjectsDescriptor } from "./commands/projects.js";
export { createProjectDescriptor } from "./commands/create-project.js";
export {
  updateProjectDescriptor,
  deleteProjectDescriptor,
  dropProjectDescriptor,
} from "./commands/projects-crud.js";
export {
  listFoldersDescriptor,
  createFolderDescriptor,
} from "./commands/folders.js";
export {
  updateFolderDescriptor,
  deleteFolderDescriptor,
} from "./commands/folders-crud.js";
export { listTagsDescriptor } from "./commands/tags.js";
export {
  createTagDescriptor,
  updateTagDescriptor,
  deleteTagDescriptor,
} from "./commands/tags-crud.js";
export {
  applyRepetitionRuleDescriptor,
  clearRepetitionRuleDescriptor,
} from "./commands/repetition.js";

// Eval escape hatch
export {
  evaluateScript,
  evaluateScriptDescriptor,
} from "./commands/evaluate.js";
export type {
  EvaluateScriptInput,
  EvaluateScriptResult,
} from "./commands/evaluate.js";

// Batch 6: Advanced command descriptors (perspectives, review, focus, sync,
// archive, attachments, taskpaper, templates, url, open).
export {
  listPerspectivesDescriptor,
  queryPerspectiveDescriptor,
} from "./commands/perspectives.js";
export {
  reviewProjectDescriptor,
  queryProjectsForReviewDescriptor,
  getReviewIntervalDescriptor,
  setReviewIntervalDescriptor,
} from "./commands/review.js";
export {
  focusOnDescriptor,
  unfocusDescriptor,
  getFocusedDescriptor,
} from "./commands/focus.js";
export {
  getSyncStatusDescriptor,
  triggerSyncDescriptor,
} from "./commands/sync.js";
export {
  archiveTasksDescriptor,
  compactDatabaseDescriptor,
} from "./commands/archive.js";
export {
  addAttachmentDescriptor,
  listAttachmentsDescriptor,
  removeAttachmentDescriptor,
} from "./commands/attachments.js";
export {
  exportTaskPaperDescriptor,
  importTaskPaperDescriptor,
} from "./commands/taskpaper.js";
export {
  saveTemplateDescriptor,
  listTemplatesDescriptor,
  getTemplateDescriptor,
  createFromTemplateDescriptor,
  deleteTemplateDescriptor,
} from "./commands/templates.js";
export { generateUrlDescriptor } from "./commands/url.js";
export { openItemDescriptor } from "./commands/open.js";

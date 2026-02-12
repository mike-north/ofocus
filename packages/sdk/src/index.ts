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
export {
  completeTasks,
  updateTasks,
  deleteTasks,
} from "./commands/batch.js";
export type {
  BatchCompleteItem,
  BatchDeleteItem,
} from "./commands/batch.js";

// Phase 3: Repetition helpers
export { buildRRule, buildRepetitionRuleScript } from "./commands/repetition.js";

// Phase 4: Search
export { searchTasks } from "./commands/search.js";

// Phase 4: Perspectives
export { listPerspectives, queryPerspective } from "./commands/perspectives.js";
export type { PerspectiveQueryOptions } from "./commands/perspectives.js";

// Phase 4: Review
export { reviewProject, queryProjectsForReview } from "./commands/review.js";

// Types
export type {
  CliOutput,
  CliError,
  CommandInfo,
  OFTask,
  OFProject,
  OFTag,
  OFPerspective,
  InboxOptions,
  TaskQueryOptions,
  ProjectQueryOptions,
  TagQueryOptions,
  TaskUpdateOptions,
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

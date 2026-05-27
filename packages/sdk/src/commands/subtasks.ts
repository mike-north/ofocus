import type {
  CliOutput,
  InboxOptions,
  SubtaskQueryOptions,
  OFTaskWithChildren,
  PaginatedResult,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateId,
  validateDateString,
  validateTags,
  validateEstimatedMinutes,
  validateRepetitionRule,
} from "../validation.js";
import { escapeJSString, toOmniJSDate, runOmniJSWrapped } from "../omnijs.js";
import { buildRRule } from "./repetition.js";

/**
 * Serialize a task with children info as a JS expression for OmniJS scripts.
 */
const serializeTaskWithChildrenExpr = `
function serializeTaskWithChildren(task, parentTask) {
  var projId = null;
  var projName = null;
  if (task.containingProject) {
    projId = task.containingProject.id.primaryKey;
    projName = task.containingProject.name;
  }
  return {
    id: task.id.primaryKey,
    name: task.name,
    note: task.note || null,
    flagged: task.flagged,
    completed: task.completed,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    deferDate: task.deferDate ? task.deferDate.toISOString() : null,
    completionDate: task.completionDate ? task.completionDate.toISOString() : null,
    projectId: projId,
    projectName: projName,
    tags: task.tags.map(function(t) { return t.name; }),
    estimatedMinutes: task.estimatedMinutes || null,
    parentTaskId: parentTask ? parentTask.id.primaryKey : null,
    parentTaskName: parentTask ? parentTask.name : null,
    childTaskCount: task.children.length,
    isActionGroup: task.children.length > 0
  };
}`;

/**
 * Create a subtask under a parent task in OmniFocus.
 */
export async function createSubtask(
  title: string,
  parentTaskId: string,
  options: InboxOptions = {}
): Promise<CliOutput<OFTaskWithChildren>> {
  // Validate inputs
  const idError = validateId(parentTaskId, "task");
  if (idError) return failure(idError);

  if (!title || title.trim() === "") {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Task title cannot be empty")
    );
  }

  if (options.due !== undefined) {
    const dueError = validateDateString(options.due);
    if (dueError) return failure(dueError);
  }

  if (options.defer !== undefined) {
    const deferError = validateDateString(options.defer);
    if (deferError) return failure(deferError);
  }

  const tagsError = validateTags(options.tags);
  if (tagsError) return failure(tagsError);

  const estimateError = validateEstimatedMinutes(options.estimatedMinutes);
  if (estimateError) return failure(estimateError);

  const repeatError = validateRepetitionRule(options.repeat);
  if (repeatError) return failure(repeatError);

  // Build the OmniJS script
  const scriptParts: string[] = [];

  scriptParts.push(serializeTaskWithChildrenExpr);

  scriptParts.push(`
var parentTask = flattenedTasks.byId("${escapeJSString(parentTaskId)}");
if (!parentTask) {
  throw new Error("Parent task not found: ${escapeJSString(parentTaskId)}");
}
var task = new Task("${escapeJSString(title)}", parentTask.ending);`);

  if (options.note !== undefined) {
    scriptParts.push(`task.note = "${escapeJSString(options.note)}";`);
  }

  if (options.flag === true) {
    scriptParts.push(`task.flagged = true;`);
  }

  if (options.due !== undefined) {
    scriptParts.push(`task.dueDate = ${toOmniJSDate(options.due)};`);
  }

  if (options.defer !== undefined) {
    scriptParts.push(`task.deferDate = ${toOmniJSDate(options.defer)};`);
  }

  if (options.estimatedMinutes !== undefined) {
    scriptParts.push(
      `task.estimatedMinutes = ${String(options.estimatedMinutes)};`
    );
  }

  // Handle tags
  if (options.tags && options.tags.length > 0) {
    for (const tagName of options.tags) {
      const varName = `tag_${sanitizeVarName(tagName)}`;
      scriptParts.push(
        `var ${varName} = flattenedTags.byName("${escapeJSString(tagName)}");`
      );
      scriptParts.push(`if (${varName}) { task.addTag(${varName}); }`);
    }
  }

  // Handle repetition rule
  if (options.repeat) {
    const rrule = buildRRule(options.repeat);
    const method =
      options.repeat.repeatMethod === "due-again"
        ? "Task.RepetitionMethod.DueDate"
        : "Task.RepetitionMethod.DeferDate";
    scriptParts.push(
      `task.repetitionRule = new Task.RepetitionRule("${escapeJSString(rrule)}", ${method});`
    );
  }

  scriptParts.push(
    `return JSON.stringify(serializeTaskWithChildren(task, parentTask));`
  );

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFTaskWithChildren>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to create subtask")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No task data returned")
    );
  }

  return success(result.data);
}

/**
 * Query subtasks of a parent task in OmniFocus with pagination.
 */
export async function querySubtasks(
  parentTaskId: string,
  options: SubtaskQueryOptions = {}
): Promise<CliOutput<PaginatedResult<OFTaskWithChildren>>> {
  // Validate parent task ID
  const idError = validateId(parentTaskId, "task");
  if (idError) return failure(idError);

  // Pagination defaults
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  // Build filter conditions
  const conditions: string[] = [];

  if (options.completed === true) {
    conditions.push("t.completed");
  } else if (options.completed === false) {
    conditions.push("!t.completed");
  }

  if (options.flagged === true) {
    conditions.push("t.flagged");
  } else if (options.flagged === false) {
    conditions.push("!t.flagged");
  }

  const filterExpr = conditions.length > 0 ? conditions.join(" && ") : "true";

  const body = `
${serializeTaskWithChildrenExpr}

var parentTask = flattenedTasks.byId("${escapeJSString(parentTaskId)}");
if (!parentTask) {
  throw new Error("Parent task not found: ${escapeJSString(parentTaskId)}");
}

var childTasks = parentTask.children.filter(function(t) {
  return ${filterExpr};
});

var totalCount = childTasks.length;
var pageOffset = ${String(offset)};
var pageLimit = ${String(limit)};
var paged = childTasks.slice(pageOffset, pageOffset + pageLimit);

var items = paged.map(function(t) {
  return serializeTaskWithChildren(t, parentTask);
});

return JSON.stringify({
  items: items,
  totalCount: totalCount,
  returnedCount: paged.length,
  hasMore: totalCount > (pageOffset + paged.length),
  offset: pageOffset,
  limit: pageLimit
});`;

  const result =
    await runOmniJSWrapped<PaginatedResult<OFTaskWithChildren>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query subtasks")
    );
  }

  return success(
    result.data ?? {
      items: [],
      totalCount: 0,
      returnedCount: 0,
      hasMore: false,
      offset,
      limit,
    }
  );
}

/**
 * Move a task to become a subtask of another task.
 */
export async function moveTaskToParent(
  taskId: string,
  parentTaskId: string
): Promise<CliOutput<OFTaskWithChildren>> {
  // Validate task IDs
  const taskIdError = validateId(taskId, "task");
  if (taskIdError) return failure(taskIdError);

  const parentIdError = validateId(parentTaskId, "task");
  if (parentIdError) return failure(parentIdError);

  const body = `
${serializeTaskWithChildrenExpr}

var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}

var parentTask = flattenedTasks.byId("${escapeJSString(parentTaskId)}");
if (!parentTask) {
  throw new Error("Parent task not found: ${escapeJSString(parentTaskId)}");
}

moveTasks([task], parentTask.ending);

return JSON.stringify(serializeTaskWithChildren(task, parentTask));`;

  const result = await runOmniJSWrapped<OFTaskWithChildren>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to move task")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No task data returned")
    );
  }

  return success(result.data);
}

/**
 * Sanitize a string for use as a JavaScript variable name suffix.
 */
function sanitizeVarName(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, "_");
}

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
import { escapeAppleScript, toAppleScriptDate } from "../escape.js";
import { runComposedScript } from "../applescript.js";
import { loadScriptContentCached } from "../asset-loader.js";
import { buildRepetitionRuleScript } from "./repetition.js";

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

  // Build properties for the new subtask
  const properties: string[] = [`name:"${escapeAppleScript(title)}"`];

  if (options.note !== undefined) {
    properties.push(`note:"${escapeAppleScript(options.note)}"`);
  }

  if (options.flag === true) {
    properties.push("flagged:true");
  }

  if (options.due !== undefined) {
    properties.push(`due date:date "${toAppleScriptDate(options.due)}"`);
  }

  if (options.defer !== undefined) {
    properties.push(`defer date:date "${toAppleScriptDate(options.defer)}"`);
  }

  if (options.estimatedMinutes !== undefined) {
    properties.push(`estimated minutes:${String(options.estimatedMinutes)}`);
  }

  // Build repetition rule script if provided
  const repetitionScript = options.repeat
    ? buildRepetitionRuleScript("newTask", options.repeat)
    : "";

  let tagScript = "";
  if (options.tags && options.tags.length > 0) {
    for (const tagName of options.tags) {
      tagScript += `
    try
      set theTag to first flattened tag whose name is "${escapeAppleScript(tagName)}"
      add theTag to tags of newTask
    end try
      `;
    }
  }

  // Load external AppleScript helpers
  const [jsonHelpers, taskWithChildrenSerializer] = await Promise.all([
    loadScriptContentCached("helpers/json.applescript"),
    loadScriptContentCached("serializers/task-with-children.applescript"),
  ]);

  const body = `
    set parentTask to first flattened task whose id is "${escapeAppleScript(parentTaskId)}"
    set newTask to make new task at end of tasks of parentTask with properties {${properties.join(", ")}}

    ${tagScript}
    ${repetitionScript}

    return my serializeTaskWithChildren(newTask, parentTask)
  `;

  const result = await runComposedScript<OFTaskWithChildren>(
    [jsonHelpers, taskWithChildrenSerializer],
    body
  );

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

  // Build filter conditions
  const conditions: string[] = [];

  if (options.completed === true) {
    conditions.push("completed is true");
  } else if (options.completed === false) {
    conditions.push("completed is false");
  }

  if (options.flagged === true) {
    conditions.push("flagged is true");
  } else if (options.flagged === false) {
    conditions.push("flagged is false");
  }

  const whereClause =
    conditions.length > 0 ? ` where ${conditions.join(" and ")}` : "";

  // Pagination defaults
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  // Load external AppleScript helpers
  const [jsonHelpers, taskWithChildrenSerializer] = await Promise.all([
    loadScriptContentCached("helpers/json.applescript"),
    loadScriptContentCached("serializers/task-with-children.applescript"),
  ]);

  const body = `
    set parentTask to first flattened task whose id is "${escapeAppleScript(parentTaskId)}"
    set output to "{\\"items\\": ["
    set isFirst to true
    set totalCount to 0
    set returnedCount to 0
    set currentIndex to 0

    set childTasks to tasks of parentTask${whereClause}

    repeat with t in childTasks
      set totalCount to totalCount + 1

      -- Check if within pagination range
      if currentIndex >= ${String(offset)} and returnedCount < ${String(limit)} then
        if not isFirst then set output to output & ","
        set isFirst to false
        set returnedCount to returnedCount + 1

        set output to output & (my serializeTaskWithChildren(t, parentTask))
      end if

      set currentIndex to currentIndex + 1
    end repeat

    set hasMore to (totalCount > (${String(offset)} + returnedCount))

    set output to output & "]," & ¬
      "\\"totalCount\\": " & totalCount & "," & ¬
      "\\"returnedCount\\": " & returnedCount & "," & ¬
      "\\"hasMore\\": " & hasMore & "," & ¬
      "\\"offset\\": ${String(offset)}," & ¬
      "\\"limit\\": ${String(limit)}" & ¬
      "}"

    return output
  `;

  const result = await runComposedScript<PaginatedResult<OFTaskWithChildren>>(
    [jsonHelpers, taskWithChildrenSerializer],
    body
  );

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

  // Load external AppleScript helpers
  const [jsonHelpers, taskWithChildrenSerializer] = await Promise.all([
    loadScriptContentCached("helpers/json.applescript"),
    loadScriptContentCached("serializers/task-with-children.applescript"),
  ]);

  const body = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"
    set parentTask to first flattened task whose id is "${escapeAppleScript(parentTaskId)}"

    move theTask to end of tasks of parentTask

    return my serializeTaskWithChildren(theTask, parentTask)
  `;

  const result = await runComposedScript<OFTaskWithChildren>(
    [jsonHelpers, taskWithChildrenSerializer],
    body
  );

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

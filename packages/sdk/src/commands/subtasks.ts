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
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";
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

  const script = `
    set parentTask to first flattened task whose id is "${escapeAppleScript(parentTaskId)}"
    set newTask to make new task at end of tasks of parentTask with properties {${properties.join(", ")}}

    ${tagScript}
    ${repetitionScript}

    -- Return the created task info
    set taskId to id of newTask
    set taskName to name of newTask
    set taskNote to note of newTask
    set taskFlagged to flagged of newTask
    set taskCompleted to completed of newTask

    set dueStr to ""
    try
      set dueStr to (due date of newTask) as string
    end try

    set deferStr to ""
    try
      set deferStr to (defer date of newTask) as string
    end try

    set projId to ""
    set projName to ""
    try
      set proj to containing project of newTask
      set projId to id of proj
      set projName to name of proj
    end try

    set tagNames to {}
    repeat with t in tags of newTask
      set end of tagNames to name of t
    end repeat

    set estMinutes to 0
    try
      set estMinutes to estimated minutes of newTask
      if estMinutes is missing value then set estMinutes to 0
    end try

    -- Use the known parent task ID since we just created this subtask under it
    set parentId to "${escapeAppleScript(parentTaskId)}"
    set parentName to ""
    try
      set parentName to name of parentTask
    end try

    set childCount to count of tasks of newTask
    set isGroup to childCount > 0

    return "{" & ¬
      "\\"id\\": \\"" & taskId & "\\"," & ¬
      "\\"name\\": \\"" & (my escapeJson(taskName)) & "\\"," & ¬
      "\\"note\\": " & (my jsonString(taskNote)) & "," & ¬
      "\\"flagged\\": " & taskFlagged & "," & ¬
      "\\"completed\\": " & taskCompleted & "," & ¬
      "\\"dueDate\\": " & (my jsonString(dueStr)) & "," & ¬
      "\\"deferDate\\": " & (my jsonString(deferStr)) & "," & ¬
      "\\"completionDate\\": null," & ¬
      "\\"projectId\\": " & (my jsonString(projId)) & "," & ¬
      "\\"projectName\\": " & (my jsonString(projName)) & "," & ¬
      "\\"tags\\": " & (my jsonArray(tagNames)) & "," & ¬
      "\\"estimatedMinutes\\": " & estMinutes & "," & ¬
      "\\"parentTaskId\\": " & (my jsonString(parentId)) & "," & ¬
      "\\"parentTaskName\\": " & (my jsonString(parentName)) & "," & ¬
      "\\"childTaskCount\\": " & childCount & "," & ¬
      "\\"isActionGroup\\": " & isGroup & ¬
      "}"
  `;

  const result = await runAppleScript<OFTaskWithChildren>(
    omniFocusScriptWithHelpers(script)
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

  const script = `
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

        set taskId to id of t
        set taskName to name of t
        set taskNote to note of t
        set taskFlagged to flagged of t
        set taskCompleted to completed of t

        set dueStr to ""
        try
          set dueStr to (due date of t) as string
        end try

        set deferStr to ""
        try
          set deferStr to (defer date of t) as string
        end try

        set completionStr to ""
        try
          set completionStr to (completion date of t) as string
        end try

        set projId to ""
        set projName to ""
        try
          set proj to containing project of t
          set projId to id of proj
          set projName to name of proj
        end try

        set tagNames to {}
        repeat with tg in tags of t
          set end of tagNames to name of tg
        end repeat

        set estMinutes to 0
        try
          set estMinutes to estimated minutes of t
          if estMinutes is missing value then set estMinutes to 0
        end try

        -- We know the parent task since we're querying its children
        set pTaskId to id of parentTask
        set pTaskName to name of parentTask

        set childCount to count of tasks of t
        set isGroup to childCount > 0

        set output to output & "{" & ¬
          "\\"id\\": \\"" & taskId & "\\"," & ¬
          "\\"name\\": \\"" & (my escapeJson(taskName)) & "\\"," & ¬
          "\\"note\\": " & (my jsonString(taskNote)) & "," & ¬
          "\\"flagged\\": " & taskFlagged & "," & ¬
          "\\"completed\\": " & taskCompleted & "," & ¬
          "\\"dueDate\\": " & (my jsonString(dueStr)) & "," & ¬
          "\\"deferDate\\": " & (my jsonString(deferStr)) & "," & ¬
          "\\"completionDate\\": " & (my jsonString(completionStr)) & "," & ¬
          "\\"projectId\\": " & (my jsonString(projId)) & "," & ¬
          "\\"projectName\\": " & (my jsonString(projName)) & "," & ¬
          "\\"tags\\": " & (my jsonArray(tagNames)) & "," & ¬
          "\\"estimatedMinutes\\": " & estMinutes & "," & ¬
          "\\"parentTaskId\\": \\"" & pTaskId & "\\"," & ¬
          "\\"parentTaskName\\": \\"" & (my escapeJson(pTaskName)) & "\\"," & ¬
          "\\"childTaskCount\\": " & childCount & "," & ¬
          "\\"isActionGroup\\": " & isGroup & ¬
          "}"
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

  const result = await runAppleScript<PaginatedResult<OFTaskWithChildren>>(
    omniFocusScriptWithHelpers(script)
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

  const script = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"
    set parentTask to first flattened task whose id is "${escapeAppleScript(parentTaskId)}"

    move theTask to end of tasks of parentTask

    -- Return updated task info
    set taskId to id of theTask
    set taskName to name of theTask
    set taskNote to note of theTask
    set taskFlagged to flagged of theTask
    set taskCompleted to completed of theTask

    set dueStr to ""
    try
      set dueStr to (due date of theTask) as string
    end try

    set deferStr to ""
    try
      set deferStr to (defer date of theTask) as string
    end try

    set completionStr to ""
    try
      set completionStr to (completion date of theTask) as string
    end try

    set projId to ""
    set projName to ""
    try
      set proj to containing project of theTask
      set projId to id of proj
      set projName to name of proj
    end try

    set tagNames to {}
    repeat with t in tags of theTask
      set end of tagNames to name of t
    end repeat

    set estMinutes to 0
    try
      set estMinutes to estimated minutes of theTask
      if estMinutes is missing value then set estMinutes to 0
    end try

    -- We know the parent since we just moved this task there
    set pTaskId to id of parentTask
    set pTaskName to name of parentTask

    set childCount to count of tasks of theTask
    set isGroup to childCount > 0

    return "{" & ¬
      "\\"id\\": \\"" & taskId & "\\"," & ¬
      "\\"name\\": \\"" & (my escapeJson(taskName)) & "\\"," & ¬
      "\\"note\\": " & (my jsonString(taskNote)) & "," & ¬
      "\\"flagged\\": " & taskFlagged & "," & ¬
      "\\"completed\\": " & taskCompleted & "," & ¬
      "\\"dueDate\\": " & (my jsonString(dueStr)) & "," & ¬
      "\\"deferDate\\": " & (my jsonString(deferStr)) & "," & ¬
      "\\"completionDate\\": " & (my jsonString(completionStr)) & "," & ¬
      "\\"projectId\\": " & (my jsonString(projId)) & "," & ¬
      "\\"projectName\\": " & (my jsonString(projName)) & "," & ¬
      "\\"tags\\": " & (my jsonArray(tagNames)) & "," & ¬
      "\\"estimatedMinutes\\": " & estMinutes & "," & ¬
      "\\"parentTaskId\\": \\"" & pTaskId & "\\"," & ¬
      "\\"parentTaskName\\": \\"" & (my escapeJson(pTaskName)) & "\\"," & ¬
      "\\"childTaskCount\\": " & childCount & "," & ¬
      "\\"isActionGroup\\": " & isGroup & ¬
      "}"
  `;

  const result = await runAppleScript<OFTaskWithChildren>(
    omniFocusScriptWithHelpers(script)
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

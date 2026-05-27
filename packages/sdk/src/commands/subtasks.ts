import type {
  CliOutput,
  InboxOptions,
  OFTask,
  OFTaskWithChildren,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateId,
  validateDateString,
  validateTags,
  validateEstimatedMinutes,
  validateRepetitionRule,
  validatePaginationParams,
} from "../validation.js";
import { escapeJSString, toOmniJSDate, runOmniJSWrapped } from "../omnijs.js";
import { buildRRule } from "./repetition.js";
import { sanitizeVarName } from "../utils/sanitize.js";
import {
  buildListQueryBody,
  compileAggregate,
  compileProjection,
  compileSort,
  compileTaskPredicates,
  taskFieldSpec,
  taskGroupKeys,
  type QueryResult,
  type BaseListQueryOptions,
  type TaskQueryOptions,
} from "../query/index.js";

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
    estimatedMinutes: task.estimatedMinutes != null ? task.estimatedMinutes : null,
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
    for (const [i, tagName] of options.tags.entries()) {
      const varName = sanitizeVarName(tagName, i);
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
 * Options for querying subtasks.
 *
 * Extends {@link BaseListQueryOptions} so callers get the full shared-query
 * vocabulary (sort, fields, count, groupBy, etc.) in addition to the
 * subtask-specific predicates.
 *
 * @public
 */
export interface SubtaskQueryOptions extends BaseListQueryOptions {
  /** When set, filter by completion status. */
  completed?: boolean | undefined;
  /** When set, filter by flagged status. */
  flagged?: boolean | undefined;
}

/**
 * Query subtasks of a parent task in OmniFocus.
 *
 * The preset for this command scopes results to children of the given parent
 * task via the `parentTaskId` predicate. Default fields include id, name,
 * completed, and flagged since that metadata is the primary reason to query
 * subtasks.
 *
 * Returns a discriminated {@link QueryResult} — the `kind` field tells the
 * caller whether the response is a paged list, a count, an ID list, a single
 * item, or grouped buckets.
 *
 * @public
 */
export async function querySubtasks(
  parentTaskId: string,
  options: SubtaskQueryOptions = {}
): Promise<CliOutput<QueryResult<OFTask>>> {
  // Validate parent task ID
  const idError = validateId(parentTaskId, "task");
  if (idError) return failure(idError);

  // Validate pagination
  const paginationError = validatePaginationParams(options.limit, options.offset);
  if (paginationError) return failure(paginationError);

  // Build the task query options: scope to children of the given parent,
  // plus any caller-supplied filters
  const taskOptions: TaskQueryOptions = {
    ...options,
    parentTaskId,
    ...(options.completed !== undefined ? { completed: options.completed } : {}),
    ...(options.flagged !== undefined ? { flagged: options.flagged } : {}),
  };

  // Apply default fields for subtask results if the caller didn't specify
  const fieldSpec =
    options.fields !== undefined
      ? taskFieldSpec
      : {
          ...taskFieldSpec,
          defaultFields: ["id", "name", "completed", "flagged"],
        };

  // Compile each phase
  const pred = compileTaskPredicates(taskOptions);
  const proj = compileProjection(fieldSpec, taskOptions);
  const sort = compileSort(fieldSpec, taskOptions);
  const agg = compileAggregate(taskOptions, taskGroupKeys);

  const errors = [
    ...pred.validationErrors,
    ...proj.validationErrors,
    ...sort.validationErrors,
    ...agg.validationErrors,
  ];
  if (errors.length > 0) {
    const first = errors[0];
    if (first) return failure(first);
  }

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const body = buildListQueryBody({
    source: "flattenedTasks",
    itemVar: "t",
    conditions: pred.conditions,
    comparator: sort.comparator,
    mapExpression: proj.mapExpression,
    aggregate: agg,
    limit,
    offset,
    groupKey: agg.groupKey,
  });

  const result = await runOmniJSWrapped<QueryResult<OFTask>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query subtasks")
    );
  }

  if (result.data === undefined) {
    return success(makeEmptyResult(agg.shape, limit, offset));
  }

  return success(result.data);
}

function makeEmptyResult(
  shape: ReturnType<typeof compileAggregate>["shape"],
  limit: number,
  offset: number
): QueryResult<OFTask> {
  switch (shape) {
    case "count":
      return { kind: "count", count: 0 };
    case "ids":
      return { kind: "ids", ids: [] };
    case "single-first":
    case "single-last":
      return { kind: "single", item: null };
    case "groups":
      return { kind: "groups", groups: [], totalCount: 0 };
    case "list":
      return {
        kind: "list",
        items: [],
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
        offset,
        limit,
      };
    default: {
      const exhaustive: never = shape;
      throw new Error(`Unknown shape: ${String(exhaustive)}`);
    }
  }
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

import type { CliOutput, TaskUpdateOptions, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateId,
  validateDateString,
  validateTags,
  validateProjectName,
  validateEstimatedMinutes,
  validateRepetitionRule,
} from "../validation.js";
import { escapeJSString, toOmniJSDate, runOmniJSWrapped } from "../omnijs.js";
import { buildRRule, repeatMethodToOmniJS } from "./repetition.js";
import { sanitizeVarName } from "../utils/sanitize.js";

/**
 * Update properties of an existing task in OmniFocus.
 */
export async function updateTask(
  taskId: string,
  options: TaskUpdateOptions
): Promise<CliOutput<OFTask>> {
  // Validate inputs
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  if (options.due !== undefined && options.due !== "") {
    const dueError = validateDateString(options.due);
    if (dueError) return failure(dueError);
  }

  if (options.defer !== undefined && options.defer !== "") {
    const deferError = validateDateString(options.defer);
    if (deferError) return failure(deferError);
  }

  const tagsError = validateTags(options.tags);
  if (tagsError) return failure(tagsError);

  const projectError = validateProjectName(options.project);
  if (projectError) return failure(projectError);

  const estimateError = validateEstimatedMinutes(options.estimatedMinutes);
  if (estimateError) return failure(estimateError);

  const repeatError = validateRepetitionRule(options.repeat);
  if (repeatError) return failure(repeatError);

  // Build the OmniJS script
  const scriptParts: string[] = [];

  scriptParts.push(`
var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}`);

  if (options.title !== undefined) {
    scriptParts.push(`task.name = "${escapeJSString(options.title)}";`);
  }

  if (options.note !== undefined) {
    scriptParts.push(`task.note = "${escapeJSString(options.note)}";`);
  }

  if (options.flag !== undefined) {
    scriptParts.push(`task.flagged = ${String(options.flag)};`);
  }

  if (options.due !== undefined) {
    if (options.due === "") {
      scriptParts.push(`task.dueDate = null;`);
    } else {
      scriptParts.push(`task.dueDate = ${toOmniJSDate(options.due)};`);
    }
  }

  if (options.defer !== undefined) {
    if (options.defer === "") {
      scriptParts.push(`task.deferDate = null;`);
    } else {
      scriptParts.push(`task.deferDate = ${toOmniJSDate(options.defer)};`);
    }
  }

  if (options.project !== undefined) {
    if (options.project === "") {
      scriptParts.push(`moveTasks([task], inbox.beginning);`);
    } else {
      scriptParts.push(`
var proj = flattenedProjects.byName("${escapeJSString(options.project)}");
if (!proj) {
  throw new Error("Project not found: ${escapeJSString(options.project)}");
}
moveTasks([task], proj.ending);`);
    }
  }

  if (options.estimatedMinutes !== undefined) {
    scriptParts.push(
      `task.estimatedMinutes = ${String(options.estimatedMinutes)};`
    );
  }

  if (options.clearEstimate === true) {
    scriptParts.push(`task.estimatedMinutes = null;`);
  }

  // Handle repetition rule
  if (options.clearRepeat === true) {
    scriptParts.push(`task.repetitionRule = null;`);
  } else if (options.repeat !== undefined) {
    const rrule = buildRRule(options.repeat);
    const method = repeatMethodToOmniJS(options.repeat.repeatMethod);
    scriptParts.push(
      `task.repetitionRule = new Task.RepetitionRule("${escapeJSString(rrule)}", ${method});`
    );
  }

  // Handle tags - clear and re-add
  if (options.tags !== undefined) {
    scriptParts.push(`
task.clearTags();`);
    for (const [i, tagName] of options.tags.entries()) {
      const varName = sanitizeVarName(tagName, i);
      scriptParts.push(`
var ${varName} = flattenedTags.byName("${escapeJSString(tagName)}");
if (${varName}) { task.addTag(${varName}); }`);
    }
  }

  // Serialize and return
  scriptParts.push(`
var projId = null;
var projName = null;
if (task.containingProject) {
  projId = task.containingProject.id.primaryKey;
  projName = task.containingProject.name;
}
var tagNames = task.tags.map(function(t) { return t.name; });

return JSON.stringify({
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
  tags: tagNames,
  estimatedMinutes: task.estimatedMinutes != null ? task.estimatedMinutes : null
});`);

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFTask>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to update task")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No task data returned")
    );
  }

  return success(result.data);
}

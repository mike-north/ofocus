import type { CliOutput, InboxOptions, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateDateString,
  validateTags,
  validateEstimatedMinutes,
  validateRepetitionRule,
} from "../validation.js";
import { escapeJSString, toOmniJSDate, runOmniJSWrapped } from "../omnijs.js";
import { buildRRule } from "./repetition.js";

/**
 * Add a task to the OmniFocus inbox.
 */
export async function addToInbox(
  title: string,
  options: InboxOptions = {}
): Promise<CliOutput<OFTask>> {
  // Validate inputs
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

  scriptParts.push(
    `var task = new Task("${escapeJSString(title)}", inbox.beginning);`
  );

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

  // Serialize and return
  scriptParts.push(`
var tagNames = task.tags.map(function(t) { return t.name; });
return JSON.stringify({
  id: task.id.primaryKey,
  name: task.name,
  note: task.note || null,
  flagged: task.flagged,
  completed: task.completed,
  dueDate: task.dueDate ? task.dueDate.toISOString() : null,
  deferDate: task.deferDate ? task.deferDate.toISOString() : null,
  completionDate: null,
  projectId: null,
  projectName: null,
  tags: tagNames,
  estimatedMinutes: task.estimatedMinutes || null
});`);

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFTask>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to add task to inbox")
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

import type { CliOutput, InboxOptions, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateDateString,
  validateTags,
} from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import {
  runAppleScript,
  omniFocusScriptWithHelpers,
} from "../applescript.js";

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

  const properties: string[] = [`name:"${escapeAppleScript(title)}"`];

  if (options.note !== undefined) {
    properties.push(`note:"${escapeAppleScript(options.note)}"`);
  }

  if (options.flag === true) {
    properties.push("flagged:true");
  }

  if (options.due !== undefined) {
    properties.push(`due date:date "${options.due}"`);
  }

  if (options.defer !== undefined) {
    properties.push(`defer date:date "${options.defer}"`);
  }

  // Build the AppleScript
  let script = `
    set newTask to make new inbox task with properties {${properties.join(", ")}}
  `;

  // Handle tags separately (requires looking them up)
  if (options.tags && options.tags.length > 0) {
    for (const tagName of options.tags) {
      script += `
    try
      set theTag to first flattened tag whose name is "${escapeAppleScript(tagName)}"
      add theTag to tags of newTask
    end try
      `;
    }
  }

  // Return the created task info
  script += `
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

    set tagNames to {}
    repeat with t in tags of newTask
      set end of tagNames to name of t
    end repeat

    return "{" & ¬
      "\\"id\\": \\"" & taskId & "\\"," & ¬
      "\\"name\\": \\"" & taskName & "\\"," & ¬
      "\\"note\\": " & (my jsonString(taskNote)) & "," & ¬
      "\\"flagged\\": " & taskFlagged & "," & ¬
      "\\"completed\\": " & taskCompleted & "," & ¬
      "\\"dueDate\\": " & (my jsonString(dueStr)) & "," & ¬
      "\\"deferDate\\": " & (my jsonString(deferStr)) & "," & ¬
      "\\"completionDate\\": null," & ¬
      "\\"projectId\\": null," & ¬
      "\\"projectName\\": null," & ¬
      "\\"tags\\": " & (my jsonArray(tagNames)) & ¬
      "}"
  `;

  const result = await runAppleScript<OFTask>(omniFocusScriptWithHelpers(script));

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

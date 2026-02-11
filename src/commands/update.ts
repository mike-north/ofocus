import type { CliOutput, TaskUpdateOptions, OFTask } from "../lib/types.js";
import { success, failure } from "../lib/output.js";
import { ErrorCode, createError } from "../lib/errors.js";
import {
  validateId,
  validateDateString,
  validateTags,
  validateProjectName,
} from "../lib/validation.js";
import { escapeAppleScript } from "../lib/escape.js";
import {
  runAppleScript,
  omniFocusScriptWithHelpers,
} from "../lib/applescript.js";

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

  // Build the update statements
  const updates: string[] = [];

  if (options.title !== undefined) {
    updates.push(
      `set name of theTask to "${escapeAppleScript(options.title)}"`
    );
  }

  if (options.note !== undefined) {
    updates.push(`set note of theTask to "${escapeAppleScript(options.note)}"`);
  }

  if (options.flag !== undefined) {
    updates.push("set flagged of theTask to " + String(options.flag));
  }

  if (options.due !== undefined) {
    if (options.due === "") {
      updates.push(`set due date of theTask to missing value`);
    } else {
      updates.push(`set due date of theTask to date "${options.due}"`);
    }
  }

  if (options.defer !== undefined) {
    if (options.defer === "") {
      updates.push(`set defer date of theTask to missing value`);
    } else {
      updates.push(`set defer date of theTask to date "${options.defer}"`);
    }
  }

  if (options.project !== undefined) {
    if (options.project === "") {
      updates.push(`set containing project of theTask to missing value`);
    } else {
      updates.push(
        `set theProject to first flattened project whose name is "${escapeAppleScript(options.project)}"`
      );
      updates.push(`move theTask to end of tasks of theProject`);
    }
  }

  const updateScript = updates.join("\n    ");

  // Handle tags - clear and re-add
  let tagScript = "";
  if (options.tags !== undefined) {
    tagScript = `
    -- Clear existing tags
    repeat with existingTag in (tags of theTask)
      remove existingTag from tags of theTask
    end repeat
    `;

    for (const tagName of options.tags) {
      tagScript += `
    try
      set theTag to first flattened tag whose name is "${escapeAppleScript(tagName)}"
      add theTag to tags of theTask
    end try
      `;
    }
  }

  const script = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"

    ${updateScript}
    ${tagScript}

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
      "\\"tags\\": " & (my jsonArray(tagNames)) & ¬
      "}"
  `;

  const result = await runAppleScript<OFTask>(
    omniFocusScriptWithHelpers(script)
  );

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

import type { CliOutput, SearchOptions, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateSearchQuery } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";

/**
 * Search tasks in OmniFocus.
 */
export async function searchTasks(
  query: string,
  options: SearchOptions = {}
): Promise<CliOutput<OFTask[]>> {
  // Validate search query
  const queryError = validateSearchQuery(query);
  if (queryError) return failure(queryError);

  const scope = options.scope ?? "both";
  const limit = options.limit ?? 100;
  const includeCompleted = options.includeCompleted ?? false;

  // Escape query for safe embedding in JS string literal; search is case-insensitive
  const escapedQuery = escapeJSString(query.toLowerCase());

  // Build filter condition based on scope
  let searchConditionExpr: string;
  switch (scope) {
    case "name":
      searchConditionExpr = `(t.name.toLowerCase().indexOf("${escapedQuery}") !== -1)`;
      break;
    case "note":
      searchConditionExpr = `(t.note && t.note.toLowerCase().indexOf("${escapedQuery}") !== -1)`;
      break;
    default:
      // "both"
      searchConditionExpr = `(t.name.toLowerCase().indexOf("${escapedQuery}") !== -1 || (t.note && t.note.toLowerCase().indexOf("${escapedQuery}") !== -1))`;
      break;
  }

  const completedFilterExpr = includeCompleted
    ? ""
    : "if (t.completed) return false;";

  const body = `
var maxResults = ${String(limit)};
var results = [];

var allTasks = flattenedTasks;

for (var i = 0; i < allTasks.length; i++) {
  if (results.length >= maxResults) break;

  var t = allTasks[i];

  ${completedFilterExpr}

  if (!${searchConditionExpr}) continue;

  var projId = null;
  var projName = null;
  if (t.containingProject) {
    projId = t.containingProject.id.primaryKey;
    projName = t.containingProject.name;
  }

  results.push({
    id: t.id.primaryKey,
    name: t.name,
    note: t.note || null,
    flagged: t.flagged,
    completed: t.completed,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    deferDate: t.deferDate ? t.deferDate.toISOString() : null,
    completionDate: t.completionDate ? t.completionDate.toISOString() : null,
    projectId: projId,
    projectName: projName,
    tags: t.tags.map(function(tg) { return tg.name; }),
    estimatedMinutes: t.estimatedMinutes != null ? t.estimatedMinutes : null
  });
}

return JSON.stringify(results);`;

  const result = await runOmniJSWrapped<OFTask[]>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to search tasks")
    );
  }

  return success(result.data ?? []);
}

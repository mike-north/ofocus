/**
 * OmniJS read of live task state (completion, estimate, due) for a set of ids.
 *
 * Mirrors `recurrence/scan-rule.ts`: locate each task via `Task.byIdentifier`,
 * skip ids that no longer exist, and return a JSON array of rows. The caller
 * diffs requested ids against returned rows to detect missing tasks.
 */
import { escapeJSString, runOmniJSWrapped } from "@ofocus/sdk";
import type { TaskState } from "./types.js";

/**
 * Build the OmniJS body that reads state for `ids`. Missing tasks are skipped
 * (not present in the output array). Exported for testing.
 *
 * @public
 */
export function buildTaskStateScript(ids: string[]): string {
  const arr = ids.map((id) => `"${escapeJSString(id)}"`).join(",");
  return `
var ids = [${arr}];
var rows = [];
for (var i = 0; i < ids.length; i++) {
  var task = Task.byIdentifier(ids[i]);
  if (!task) { continue; }
  rows.push({
    taskId: task.id.primaryKey,
    name: task.name,
    completed: task.completed,
    estimatedMinutes: (task.estimatedMinutes != null) ? task.estimatedMinutes : null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null
  });
}
return JSON.stringify(rows);`;
}

/** Whether a value is a plain string-keyed record. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse the OmniJS result into validated {@link TaskState} rows. Exported for testing.
 *
 * @public
 */
export function parseTaskStates(raw: unknown): TaskState[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskState[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const taskId = row["taskId"];
    const name = row["name"];
    if (typeof taskId !== "string" || typeof name !== "string") continue;
    const estimate = row["estimatedMinutes"];
    const due = row["dueDate"];
    out.push({
      taskId,
      name,
      completed: row["completed"] === true,
      estimatedMinutes: typeof estimate === "number" ? estimate : null,
      dueDate: typeof due === "string" ? due : null,
    });
  }
  return out;
}

/**
 * Live read of task state for `ids`. Empty input short-circuits (no OmniJS call).
 *
 * @public
 */
export async function readTaskStates(ids: string[]): Promise<TaskState[]> {
  if (ids.length === 0) return [];
  const result = await runOmniJSWrapped<unknown>(buildTaskStateScript(ids));
  if (!result.success) {
    throw new Error(result.error?.message ?? "Failed to read task states");
  }
  return parseTaskStates(result.data ?? []);
}

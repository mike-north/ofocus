/**
 * Mark the first `available` task in each project (by input order) as the next
 * action. Diverges from native single-valued `Task.Status.Next` so an overdue
 * or due-soon first action still qualifies (spec §5.2).
 *
 * Inbox tasks (null `projectId`) collapse into a single `__inbox__` bucket, so
 * only the first available inbox task is flagged as the next action.
 *
 * @public
 */
export function markNextActions(
  tasks: readonly {
    id: string;
    projectId: string | null;
    effectiveStatus: string;
  }[]
): Record<string, boolean> {
  const seenProject = new Set<string>();
  const out: Record<string, boolean> = {};
  for (const t of tasks) {
    const key = t.projectId ?? "__inbox__";
    const isNext = t.effectiveStatus === "available" && !seenProject.has(key);
    if (isNext) seenProject.add(key);
    out[t.id] = isNext;
  }
  return out;
}

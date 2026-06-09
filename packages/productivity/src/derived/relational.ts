/// <reference types="@ofocus/omnijs-types/globals" />
import { defineOmniScript, runOmniScript, type CliOutput } from "@ofocus/sdk";

/**
 * Relational facts that require querying OmniFocus's live object graph:
 * whether a task has an incomplete sequential predecessor, and whether it has
 * incomplete children. These facts feed the `sequential-predecessor` and
 * `incomplete-children` {@link BlockedReason} causes (spec §5.5).
 *
 * @public
 */
export interface RelationalFacts {
  taskId: string;
  hasIncompleteSequentialPredecessor: boolean;
  hasIncompleteChildren: boolean;
}

/**
 * A typed OmniScript that accepts a list of task IDs and returns one
 * {@link RelationalFacts} record per ID. The body is self-contained: it only
 * references its `args` parameter and OmniFocus globals (`flattenedTasks`,
 * `Task`, etc.) — no closures or imports.
 *
 * @public
 */
export const relationalFactsScript = defineOmniScript(
  (args: { taskIds: string[] }) => {
    return args.taskIds.map((id) => {
      const t = flattenedTasks.byId(id);
      if (t === null) {
        return {
          taskId: id,
          hasIncompleteSequentialPredecessor: false,
          hasIncompleteChildren: false,
        };
      }
      const hasIncompleteChildren = t.children.some(
        (c) => !c.completed && !c.dropped
      );
      let hasPred = false;
      const project = t.containingProject;
      if (project?.sequential) {
        const siblings = project.task.children;
        let earlierIncomplete = false;
        let foundSelf = false;
        for (const s of siblings) {
          if (s.id.primaryKey === t.id.primaryKey) {
            foundSelf = true;
            break;
          }
          if (!s.completed && !s.dropped) {
            earlierIncomplete = true;
          }
        }
        // Only a direct top-level action of the project can be blocked by a
        // top-level predecessor. A nested task (inside an action group) is not in
        // `project.task.children`, so `foundSelf` stays false and we conservatively
        // report no predecessor rather than a false positive. (Action-group
        // predecessors are a documented v1 limitation — see the spec note below.)
        hasPred = foundSelf && earlierIncomplete;
      }
      return {
        taskId: id,
        hasIncompleteSequentialPredecessor: hasPred,
        hasIncompleteChildren,
      };
    });
  }
);

/**
 * Run the {@link relationalFactsScript} via osascript against a live OmniFocus
 * instance and return one {@link RelationalFacts} record per requested task ID.
 *
 * @public
 */
export async function fetchRelationalFacts(
  taskIds: string[]
): Promise<CliOutput<RelationalFacts[]>> {
  return runOmniScript(relationalFactsScript, { taskIds });
}

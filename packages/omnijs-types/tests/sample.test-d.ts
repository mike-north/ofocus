// Positive: a representative script body type-checks against the ambient globals.
const t: Task | null = flattenedTasks.byId("abc");
const status: TaskStatus | undefined = t?.taskStatus;
const proj: Project | null = t?.containingProject ?? null;
void status;
void proj;

// Positive: the named type is also importable (the API-Extractor surface).
import type { Task as TaskType } from "@ofocus/omnijs-types";
const t2: TaskType | null = t;
void t2;

// Negative: unknown members are rejected.
// @ts-expect-error - `nope` is not a member of the task collection
flattenedTasks.nope();
// @ts-expect-error - Task has no `frobnicate` method
t?.frobnicate();

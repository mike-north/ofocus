/**
 * Type-level tests for the auto-pagination helpers.
 *
 * These assert that {@link paginate} / {@link paginatePages} infer the element
 * type `T` and options type `O` from the query function alone, with no explicit
 * type arguments. Enforced by `tsc` via `tsconfig.test-d.json` (`pnpm test:types`).
 *
 * Negative cases use `@ts-expect-error`: if the expected error ever disappears,
 * the unused directive becomes a compile error and this file fails to build.
 */
import {
  paginate,
  paginatePages,
  type QueryFnItem,
} from "../../src/pagination.js";
import { queryTasks } from "../../src/commands/tasks.js";
import { queryProjects } from "../../src/commands/projects.js";
import type { OFTask, OFProject } from "../../src/types.js";

/**
 * Exact (mutually-assignable) type equality. Unlike a bare assignment, this
 * fails if the element type collapses to `never`/`unknown` or widens to a
 * union — assignment-based checks would silently pass those regressions.
 */
type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
    ? true
    : false;

// --- Exact element-type inference (guards against collapse-to-never) ---

const exactTaskItem: Equal<QueryFnItem<typeof queryTasks>, OFTask> = true;
void exactTaskItem;

const exactProjectItem: Equal<
  QueryFnItem<typeof queryProjects>,
  OFProject
> = true;
void exactProjectItem;

// --- Positive: element type inferred from the query function ---

const taskItems: AsyncGenerator<OFTask, void, undefined> = paginate(
  queryTasks,
  {
    flagged: true,
  }
);
void taskItems;

const taskPages: AsyncGenerator<OFTask[], void, undefined> =
  paginatePages(queryTasks);
void taskPages;

// Inference flows through to a different entity type.
const projectItems: AsyncGenerator<OFProject, void, undefined> =
  paginate(queryProjects);
void projectItems;

// pageSize is an accepted third argument.
const sizedPages: AsyncGenerator<OFTask[], void, undefined> = paginatePages(
  queryTasks,
  { available: true },
  50
);
void sizedPages;

// --- Negative: wrong element type on the result generator ---

// @ts-expect-error - paginate(queryTasks) yields OFTask, not OFProject
const wrongElement: AsyncGenerator<OFProject, void, undefined> =
  paginate(queryTasks);
void wrongElement;

// --- Negative: the argument must be a list query function ---

// @ts-expect-error - a plain (number) => Promise<number> is not a ListQueryFn
void paginate((n: number) => Promise.resolve(n));

// --- Negative: options are type-checked against the query's own options ---

// @ts-expect-error - notARealKey is not a valid TaskQueryOptions field
void paginate(queryTasks, { notARealKey: true });

// --- Negative: the yielded item is not assignable to an unrelated type ---

async function itemBinding(): Promise<void> {
  for await (const task of paginate(queryTasks, { flagged: true })) {
    // @ts-expect-error - task is OFTask, not string
    const s: string = task;
    void s;
  }
}
void itemBinding;

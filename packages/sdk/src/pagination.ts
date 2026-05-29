import type { CliOutput, PaginationOptions } from "./types.js";
import type { QueryResult } from "./query/index.js";
import { ErrorCode, createError, type CliError } from "./errors.js";

/**
 * Default page size used when neither an explicit `pageSize` argument nor an
 * `options.limit` is provided. Mirrors the per-call default used by the
 * underlying query commands (e.g. `queryTasks`).
 */
const DEFAULT_PAGE_SIZE = 100;

/**
 * A query function in the SDK's uniform list-query shape: it accepts a single
 * options object (carrying at least {@link PaginationOptions}) and resolves to
 * a {@link CliOutput} wrapping a {@link QueryResult}.
 *
 * Single-`options` list queries — `queryTasks`, `queryProjects`, `queryTags`,
 * `queryFolders`, `queryDeferred`, `queryForecast`, … — conform directly, which
 * is what lets a single generic helper auto-paginate them. Queries that take a
 * required leading argument (e.g. `searchTasks(query, options)`,
 * `querySubtasks(parentTaskId, options)`) do not match this shape directly;
 * wrap them in a single-`options` closure first — e.g.
 * `paginate((options) => searchTasks(query, options))`.
 *
 * @typeParam T - The entity type yielded by the query (e.g. `OFTask`).
 * @typeParam O - The query's options type (must extend {@link PaginationOptions}).
 *
 * @public
 */
export type ListQueryFn<T, O extends PaginationOptions> = (
  options: O
) => Promise<CliOutput<QueryResult<T>>>;

/**
 * The entity type produced by a {@link ListQueryFn}, extracted from its result.
 * This is what lets {@link paginate} / {@link paginatePages} infer the element
 * type from the query function alone, without an explicit type argument.
 *
 * @typeParam F - A {@link ListQueryFn}.
 *
 * @public
 */
export type QueryFnItem<F> = F extends (
  // `never` in this (contravariant) parameter position lets the conditional
  // match any ListQueryFn regardless of its concrete options type; we only
  // care about the inferred result item `T`.
  options: never
) => Promise<CliOutput<QueryResult<infer T>>>
  ? T
  : never;

/**
 * Error thrown by {@link paginate} and {@link paginatePages} when a page cannot
 * be retrieved or the query does not produce a paginated list.
 *
 * It carries the underlying {@link CliError} so callers can branch on the
 * structured {@link PaginationError.code} from inside a normal `try`/`catch`
 * around the `for await` loop.
 *
 * @public
 */
export class PaginationError extends Error {
  /** The structured error code from the underlying {@link CliError}. */
  readonly code: ErrorCode;
  /** The full underlying {@link CliError}. */
  readonly cliError: CliError;

  constructor(cliError: CliError) {
    super(cliError.message);
    this.name = "PaginationError";
    this.code = cliError.code;
    this.cliError = cliError;
  }
}

/**
 * Auto-paginate a list query, yielding one full page (`T[]`) at a time.
 *
 * The helper owns pagination control: it overrides `limit` and `offset` on each
 * call (using `pageSize` as the per-page `limit` and stepping `offset` forward),
 * and keeps requesting pages until the query reports `hasMore === false`. It
 * does **not** strip aggregating options (`count` / `idsOnly` / `first` /
 * `last` / `groupBy`); if the query returns a non-`list` shape it throws a
 * {@link PaginationError} instead.
 *
 * Page size resolves as `pageSize ?? options.limit ?? 100`. Iteration starts at
 * `options.offset ?? 0`.
 *
 * @typeParam F - The list query function type; the item and options types are
 * inferred from it.
 * @param queryFn - A list query in the {@link ListQueryFn} shape.
 * @param options - Query options. `limit`/`offset` are overridden by the helper.
 * @param pageSize - Optional per-page size; overrides `options.limit`.
 * @returns An async generator yielding non-empty pages of items.
 *
 * @throws {@link PaginationError} if a page fails (`success === false`), the
 * query returns no data, or the result is not a `list` shape.
 *
 * @remarks
 * This is offset-based pagination over a live OmniFocus database. If the
 * underlying data changes mid-iteration (tasks added, completed, or deleted),
 * pages can skip or duplicate items. This is inherent to offset pagination and
 * is not corrected here.
 *
 * @example
 * ```ts
 * for await (const page of paginatePages(queryProjects, { status: "active" }, 250)) {
 *   await processBatch(page);
 * }
 * ```
 *
 * @public
 */
export function paginatePages<
  F extends ListQueryFn<unknown, PaginationOptions>,
>(
  queryFn: F,
  options?: Parameters<F>[0],
  pageSize?: number
): AsyncGenerator<QueryFnItem<F>[], void, undefined> {
  // The public surface infers the item/options types from `F`; the work happens
  // in the fully-typed generic implementation below. These casts bridge the
  // inferred `F` to the explicit `<item, options>` form — sound because `F` is a
  // `ListQueryFn` by constraint, so its options extend `PaginationOptions` and
  // its items are `QueryFnItem<F>`.
  return paginatePagesImpl(
    queryFn as unknown as ListQueryFn<QueryFnItem<F>, PaginationOptions>,
    options as PaginationOptions | undefined,
    pageSize
  );
}

/** Internal generic implementation behind {@link paginatePages}. */
async function* paginatePagesImpl<T, O extends PaginationOptions>(
  queryFn: ListQueryFn<T, O>,
  options: O | undefined,
  pageSize: number | undefined
): AsyncGenerator<T[], void, undefined> {
  const size = pageSize ?? options?.limit ?? DEFAULT_PAGE_SIZE;
  let offset = options?.offset ?? 0;

  // A non-positive page size would never advance the offset (or step it
  // backward), so reject it up front rather than spin or query nonsense.
  if (!Number.isInteger(size) || size < 1) {
    throw new PaginationError(
      createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid page size: ${String(size)}; must be a positive integer`
      )
    );
  }

  for (;;) {
    // The helper owns limit/offset; spread the caller's other options through.
    // The literal is cast to O because the generic spread is not provably O.
    const result = await queryFn({
      ...options,
      limit: size,
      offset,
    } as O);

    if (!result.success) {
      throw new PaginationError(
        result.error ??
          createError(ErrorCode.UNKNOWN_ERROR, "Pagination query failed")
      );
    }

    const data = result.data;
    if (data === null) {
      throw new PaginationError(
        createError(
          ErrorCode.UNKNOWN_ERROR,
          "Pagination query succeeded but returned no data"
        )
      );
    }

    if (data.kind !== "list") {
      throw new PaginationError(
        createError(
          ErrorCode.VALIDATION_ERROR,
          `paginate()/paginatePages() require a list query; got kind=${data.kind}`
        )
      );
    }

    if (data.returnedCount > 0) {
      yield data.items;
    }

    // Stop when the query reports no more pages. The returnedCount guard also
    // defends against an infinite loop if a backend reports hasMore=true while
    // returning an empty page.
    if (!data.hasMore || data.returnedCount === 0) {
      break;
    }

    offset += size;
  }
}

/**
 * Auto-paginate a list query, yielding individual items.
 *
 * A thin wrapper over {@link paginatePages} that flattens each page. This is the
 * common case — iterate every matching entity without manual `offset`/`hasMore`
 * bookkeeping.
 *
 * See {@link paginatePages} for page-size resolution, error behavior, and the
 * live-data caveat.
 *
 * @typeParam F - The list query function type; the item and options types are
 * inferred from it.
 * @param queryFn - A list query in the {@link ListQueryFn} shape.
 * @param options - Query options. `limit`/`offset` are overridden by the helper.
 * @param pageSize - Optional per-page size; overrides `options.limit`.
 * @returns An async generator yielding individual items.
 *
 * @throws {@link PaginationError} under the same conditions as
 * {@link paginatePages}.
 *
 * @example
 * ```ts
 * for await (const task of paginate(queryTasks, { flagged: true })) {
 *   console.log(task.name);
 * }
 * ```
 *
 * @public
 */
export function paginate<F extends ListQueryFn<unknown, PaginationOptions>>(
  queryFn: F,
  options?: Parameters<F>[0],
  pageSize?: number
): AsyncGenerator<QueryFnItem<F>, void, undefined> {
  // See paginatePages for why these casts are sound.
  return paginateImpl(
    queryFn as unknown as ListQueryFn<QueryFnItem<F>, PaginationOptions>,
    options as PaginationOptions | undefined,
    pageSize
  );
}

/** Internal generic implementation behind {@link paginate}. */
async function* paginateImpl<T, O extends PaginationOptions>(
  queryFn: ListQueryFn<T, O>,
  options: O | undefined,
  pageSize: number | undefined
): AsyncGenerator<T, void, undefined> {
  for await (const page of paginatePagesImpl(queryFn, options, pageSize)) {
    yield* page;
  }
}

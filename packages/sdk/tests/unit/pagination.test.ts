import { describe, it, expect, vi } from "vitest";
import {
  paginate,
  paginatePages,
  PaginationError,
  type ListQueryFn,
} from "../../src/pagination.js";
import { success, failure } from "../../src/result.js";
import { ErrorCode, createError } from "../../src/errors.js";
import type { QueryResult } from "../../src/query/index.js";
import type { CliOutput, PaginationOptions } from "../../src/types.js";

/** Minimal entity for exercising the generic helpers. */
interface Item {
  id: string;
}

const makeItems = (count: number, offset = 0): Item[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `item-${String(offset + i)}`,
  }));

/**
 * A query fn that performs real offset/limit slicing over a fixed dataset, so
 * tests exercise the helper's offset stepping and hasMore handling end-to-end.
 * Records every options object it was called with.
 */
function makeOffsetQueryFn(allItems: Item[]): {
  fn: ListQueryFn<Item, PaginationOptions>;
  calls: PaginationOptions[];
} {
  const calls: PaginationOptions[] = [];
  const fn: ListQueryFn<Item, PaginationOptions> = (options) => {
    calls.push(options);
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    const items = allItems.slice(offset, offset + limit);
    const result: QueryResult<Item> = {
      kind: "list",
      items,
      totalCount: allItems.length,
      returnedCount: items.length,
      hasMore: offset + items.length < allItems.length,
      offset,
      limit,
    };
    return Promise.resolve(success(result));
  };
  return { fn, calls };
}

/** A query fn returning pre-canned result envelopes in sequence. */
function makeScriptedQueryFn(pages: CliOutput<QueryResult<Item>>[]): {
  fn: ListQueryFn<Item, PaginationOptions>;
  calls: PaginationOptions[];
} {
  const calls: PaginationOptions[] = [];
  let i = 0;
  const fn: ListQueryFn<Item, PaginationOptions> = (options) => {
    calls.push(options);
    const page = pages[i] ?? pages[pages.length - 1];
    i += 1;
    return Promise.resolve(page as CliOutput<QueryResult<Item>>);
  };
  return { fn, calls };
}

const listPage = (
  items: Item[],
  meta: { totalCount: number; hasMore: boolean; offset: number; limit: number }
): CliOutput<QueryResult<Item>> =>
  success<QueryResult<Item>>({
    kind: "list",
    items,
    totalCount: meta.totalCount,
    returnedCount: items.length,
    hasMore: meta.hasMore,
    offset: meta.offset,
    limit: meta.limit,
  });

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe("paginate", () => {
  it("flattens items across multiple pages in order", async () => {
    const all = makeItems(7);
    const { fn } = makeOffsetQueryFn(all);

    const items = await collect(paginate(fn, {}, 3));

    expect(items).toEqual(all);
  });

  it("yields nothing for an empty result and queries exactly once", async () => {
    const { fn, calls } = makeOffsetQueryFn([]);

    const items = await collect(paginate(fn));

    expect(items).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("stops requesting pages once a consumer breaks early", async () => {
    const { fn, calls } = makeOffsetQueryFn(makeItems(100));

    let seen = 0;
    for await (const _item of paginate(fn, {}, 2)) {
      seen += 1;
      if (seen === 1) break; // break before exhausting the first page
    }

    // Generator cleanup (.return) prevents any further query calls.
    expect(seen).toBe(1);
    expect(calls).toHaveLength(1);
  });
});

describe("paginatePages", () => {
  it("yields each page as an array and stops when hasMore is false", async () => {
    const all = makeItems(7);
    const { fn } = makeOffsetQueryFn(all);

    const pages = await collect(paginatePages(fn, {}, 3));

    expect(pages).toEqual([makeItems(3, 0), makeItems(3, 3), makeItems(1, 6)]);
  });

  it("forces limit=pageSize and steps offset by pageSize on each call", async () => {
    const { fn, calls } = makeOffsetQueryFn(makeItems(7));

    await collect(paginatePages(fn, {}, 3));

    expect(calls.map((c) => ({ limit: c.limit, offset: c.offset }))).toEqual([
      { limit: 3, offset: 0 },
      { limit: 3, offset: 3 },
      { limit: 3, offset: 6 },
    ]);
  });

  it("uses options.limit as the page size when pageSize is omitted", async () => {
    const { fn, calls } = makeOffsetQueryFn(makeItems(5));

    await collect(paginatePages(fn, { limit: 2 }));

    expect(calls.every((c) => c.limit === 2)).toBe(true);
    expect(calls).toHaveLength(3); // 2 + 2 + 1
  });

  it("defaults the page size to 100 when neither pageSize nor limit is given", async () => {
    const { fn, calls } = makeOffsetQueryFn(makeItems(1));

    await collect(paginatePages(fn));

    expect(calls[0]?.limit).toBe(100);
  });

  it("prefers the pageSize argument over options.limit", async () => {
    const { fn, calls } = makeOffsetQueryFn(makeItems(4));

    await collect(paginatePages(fn, { limit: 99 }, 2));

    expect(calls.every((c) => c.limit === 2)).toBe(true);
    expect(calls).toHaveLength(2); // 2 + 2
  });

  it("honors a custom starting offset from options", async () => {
    const all = makeItems(10);
    const { fn, calls } = makeOffsetQueryFn(all);

    const pages = await collect(paginatePages(fn, { offset: 8 }, 5));

    expect(calls[0]?.offset).toBe(8);
    expect(pages).toEqual([makeItems(2, 8)]); // only items 8 and 9 remain
  });

  it("passes non-pagination options through to the query fn", async () => {
    interface FilterOptions extends PaginationOptions {
      flagged?: boolean;
    }
    const calls: FilterOptions[] = [];
    const fn: ListQueryFn<Item, FilterOptions> = (options) => {
      calls.push(options);
      return Promise.resolve(
        listPage([], { totalCount: 0, hasMore: false, offset: 0, limit: 10 })
      );
    };

    await collect(paginatePages(fn, { flagged: true }, 10));

    expect(calls[0]?.flagged).toBe(true);
  });
});

describe("PaginationError handling", () => {
  it("throws a PaginationError carrying the failed page's CliError", async () => {
    const cliError = createError(
      ErrorCode.OMNIFOCUS_NOT_RUNNING,
      "OmniFocus is not running"
    );
    const { fn } = makeScriptedQueryFn([failure(cliError)]);

    await expect(collect(paginate(fn))).rejects.toMatchObject({
      name: "PaginationError",
      code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
      cliError,
    });
  });

  it("surfaces the failure even after some successful pages", async () => {
    const cliError = createError(ErrorCode.SCRIPT_ERROR, "boom");
    const { fn } = makeScriptedQueryFn([
      listPage(makeItems(2, 0), {
        totalCount: 4,
        hasMore: true,
        offset: 0,
        limit: 2,
      }),
      failure(cliError),
    ]);

    const gen = paginate(fn, {}, 2);
    const collected: Item[] = [];
    await expect(
      (async () => {
        for await (const item of gen) collected.push(item);
      })()
    ).rejects.toBeInstanceOf(PaginationError);
    expect(collected).toEqual(makeItems(2, 0)); // first page was yielded
  });

  it("throws when a success envelope carries null data", async () => {
    const { fn } = makeScriptedQueryFn([
      success<QueryResult<Item>>(null as unknown as QueryResult<Item>),
    ]);

    await expect(collect(paginate(fn))).rejects.toMatchObject({
      name: "PaginationError",
      code: ErrorCode.UNKNOWN_ERROR,
    });
  });

  it.each([
    { kind: "count", data: { kind: "count", count: 5 } },
    { kind: "ids", data: { kind: "ids", ids: ["a", "b"] } },
    { kind: "single", data: { kind: "single", item: null } },
    {
      kind: "groups",
      data: { kind: "groups", groups: [], totalCount: 0 },
    },
  ] as const)(
    "throws a VALIDATION_ERROR when the query returns a non-list shape (%s)",
    async ({ kind, data }) => {
      const { fn } = makeScriptedQueryFn([
        success(data as unknown as QueryResult<Item>),
      ]);

      await expect(collect(paginate(fn))).rejects.toMatchObject({
        name: "PaginationError",
        code: ErrorCode.VALIDATION_ERROR,
      });
      await expect(collect(paginate(fn))).rejects.toThrow(kind);
    }
  );

  it("terminates instead of looping when an empty page reports hasMore=true", async () => {
    // A buggy backend: returnedCount 0 but hasMore true. The guard must stop.
    const page = listPage([], {
      totalCount: 10,
      hasMore: true,
      offset: 0,
      limit: 5,
    });
    const fn = vi.fn<ListQueryFn<Item, PaginationOptions>>(() =>
      Promise.resolve(page)
    );

    const items = await collect(paginate(fn, {}, 5));

    expect(items).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5])(
    "throws a VALIDATION_ERROR for a non-positive-integer page size (%s)",
    async (badSize) => {
      const fn = vi.fn<ListQueryFn<Item, PaginationOptions>>(() =>
        Promise.resolve(
          listPage([], { totalCount: 0, hasMore: false, offset: 0, limit: 1 })
        )
      );

      await expect(collect(paginate(fn, {}, badSize))).rejects.toMatchObject({
        name: "PaginationError",
        code: ErrorCode.VALIDATION_ERROR,
      });
      // The guard fires before any query is issued.
      expect(fn).not.toHaveBeenCalled();
    }
  );

  // Regression: the non-list-shape error message must be generic — it must not
  // reference only "paginate()" when the failure is triggered via paginatePages().
  it("non-list error message is generic regardless of which entry point is used", async () => {
    const nonListData = { kind: "count", count: 5 };
    const makeCountQueryFn = () =>
      makeScriptedQueryFn([
        success(nonListData as unknown as QueryResult<Item>),
      ]);

    const paginateError = await collect(paginate(makeCountQueryFn().fn)).catch(
      (e: unknown) => e
    );
    const paginatePagesError = await collect(
      paginatePages(makeCountQueryFn().fn)
    ).catch((e: unknown) => e);

    // Both errors must include both entry points in the message so neither is
    // misleadingly attributed to just one helper.
    expect(paginateError).toBeInstanceOf(PaginationError);
    expect(paginatePagesError).toBeInstanceOf(PaginationError);
    expect((paginateError as PaginationError).message).toMatch(/paginate\(\)/);
    expect((paginateError as PaginationError).message).toMatch(
      /paginatePages\(\)/
    );
    expect((paginatePagesError as PaginationError).message).toMatch(
      /paginate\(\)/
    );
    expect((paginatePagesError as PaginationError).message).toMatch(
      /paginatePages\(\)/
    );
  });
});

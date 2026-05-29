---
"@ofocus/sdk": minor
"ofocus": minor
---

Add auto-paginating async iteration over list queries

Every list query (`queryTasks`, `queryProjects`, `queryTags`, `queryFolders`, `querySubtasks`, `queryDeferred`, `searchTasks`, `queryForecast`, …) is offset/limit paginated. Consuming a full result set previously meant manually looping on `offset`/`hasMore`. Two new generic helpers do that for you with a `for await` loop, fully type-inferred from the query function (no type arguments needed).

**New SDK exports**:

- `paginate(queryFn, options?, pageSize?)` — yields individual items across all pages.
- `paginatePages(queryFn, options?, pageSize?)` — yields whole `T[]` pages (batch processing / progress).
- `PaginationError` — thrown on a failed page or a non-list result; carries the underlying `code` and `cliError`.
- Types: `ListQueryFn<T, O>`, `QueryFnItem<F>`.

The element and options types are inferred from the query function — `paginate(queryTasks, { flagged: true })` yields `OFTask` with no annotations. A failed page, a non-`list` result (`count`/`idsOnly`/`first`/`last`/`groupBy`), or a non-positive page size throws a `PaginationError`.

This is offset-based pagination over a live database: if items are added, completed, or deleted mid-iteration, pages can skip or duplicate items.

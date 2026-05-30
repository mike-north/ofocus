---
"@ofocus/sdk": patch
"ofocus": patch
---

Correct pagination helper docs and generic error message

- `ListQueryFn` JSDoc now explicitly states that not all list queries conform directly to the single-`options` shape, adds `@example` blocks showing both the direct and wrapping patterns, and names `searchTasks`/`querySubtasks` as queries that require a closure.
- The non-list-shape `PaginationError` message already referenced both `paginate()` and `paginatePages()` generically; a regression test now guards this.
- README pagination section intro no longer implies `searchTasks`/`querySubtasks` pass directly; the wrapping example is already present in the section.
- Corrected the `auto-paginating-iteration` changeset description to clarify that `searchTasks`/`querySubtasks` require a wrapping arrow rather than working directly.

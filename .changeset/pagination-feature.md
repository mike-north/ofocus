---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"ofocus": minor
---

Add pagination support to query functions

**Breaking Change**: Query functions now return `PaginatedResult<T>` instead of raw arrays.

Before:

```typescript
const result = await queryTasks({ flagged: true });
// result.data was OFTask[]
```

After:

```typescript
const result = await queryTasks({ flagged: true });
// result.data is now PaginatedResult<OFTask>
// Access items via result.data.items
```

**New Features**:

- The following query functions support `limit` and `offset` parameters: `queryTasks`, `queryProjects`, `queryTags`, `queryFolders`
- Note: `queryPerspective` and `listPerspectives` support only `limit` (no offset) due to OmniFocus AppleScript limitations
- Default limit is 100 items
- Results include `totalCount`, `returnedCount`, `hasMore`, `offset`, and `limit` metadata
- CLI commands support `--limit` and `--offset` flags
- New `validatePaginationParams()` function and `MAX_PAGINATION_LIMIT` constant exported from SDK

**Improved Error Handling**:

- Delete functions (`deleteTask`, `deleteProject`, `deleteTag`, `deleteFolder`) now return proper `NOT_FOUND` errors instead of crashing when items don't exist
- Pagination parameters are validated (limit: 1-10000, offset: >= 0)

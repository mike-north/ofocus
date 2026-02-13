---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"ofocus": minor
---

Add pagination support to all query functions

**Breaking Change**: Query functions now return `PaginatedResult<T>` instead of raw arrays.

Before:

```typescript
const result = await queryTasks({ flagged: true });
// result.data was Task[]
```

After:

```typescript
const result = await queryTasks({ flagged: true });
// result.data is now PaginatedResult<Task>
// Access items via result.data.items
```

**New Features**:

- All query functions (`queryTasks`, `queryProjects`, `queryTags`, `queryFolders`) support `limit` and `offset` parameters
- Default limit is 100 items
- Results include `totalCount`, `returnedCount`, `hasMore`, `offset`, and `limit` metadata
- CLI commands support `--limit` and `--offset` flags
- New `validatePaginationParams()` function and `MAX_PAGINATION_LIMIT` constant exported from SDK

**Improved Error Handling**:

- Delete functions (`deleteTask`, `deleteProject`, `deleteTag`, `deleteFolder`) now return proper `NOT_FOUND` errors instead of crashing when items don't exist
- Pagination parameters are validated (limit: 1-10000, offset: >= 0)

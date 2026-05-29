---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Add `--all` pagination flag to every list command

Every list-style command now accepts `--all` (CLI) / `all: boolean` (MCP tool input / SDK option). When set, the entire match set is materialized server-side — no paging bookkeeping needed.

## Commands updated

- `tasks` / `tasks_list` / `queryTasks`
- `projects` / `projects_list` / `queryProjects`
- `folders` / `folders_list` / `queryFolders`
- `tags` / `tags_list` / `queryTags`
- `forecast` / `forecast` / `queryForecast`
- `deferred` / `deferred_list` / `queryDeferred`
- `search` / `search` / `searchTasks`
- `subtasks` / `subtasks_list` / `querySubtasks`

## Behavior

- `--all` skips the `--limit` / `--offset` slice and maps the full filtered result.
- The `PaginatedResult` envelope shape is **unchanged**: `hasMore` is `false`, `offset` is `0`, and `limit` equals `returnedCount` (the total number of items returned).
- `--all` is **mutually exclusive** with `--limit` and `--offset`. Supplying both returns a validation error: `"Cannot combine --all with --limit or --offset"`.
- `--all` does not affect `--count`, `--group-by`, `--first`, `--last`, `--ids-only`, or `--fields`. Those shape modifiers still apply; `--all` only changes the slicing step.

## CLI example

```bash
# Return all active tasks in a project — no need to page
ofocus tasks --project "Work" --all
```

## SDK example

```typescript
const result = await queryTasks({ project: "Work", all: true });
// result.data.kind === "list"
// result.data.hasMore === false
// result.data.items contains every matched task
```

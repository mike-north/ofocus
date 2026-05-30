---
"@ofocus/sdk": patch
"@ofocus/cli": patch
"@ofocus/mcp": patch
"ofocus": patch
---

Fix several OmniFocus operations that failed against a live database.

- **`eval` argument parsing from the CLI**: `ofocus eval ... --args '{"k":"v"}'` was rejected with `args: Expected object, received string` because the CLI passes `--args` as a JSON string while the schema only accepted an object. The `args` field now JSON-parses a string input before validation, so both the CLI (string) and MCP (object) inputs work. Invalid JSON still produces a clean validation error.
- **Task/project lookup by ID**: every command that looked up a task with `flattenedTasks.byId(...)` failed (`flattenedTasks.byId is not a function` — that API does not exist in OmniJS). Lookups now use `Task.byIdentifier(...)`. This fixes `update`, `complete`, `drop`, `delete`, `defer`, `duplicate`, subtasks, attachments, repetition, and batch operations, as well as the integration-test cleanup script (which previously left orphaned items behind).
- **Repetition rules**: applying a repetition rule failed for the same lookup reason; daily/weekly/monthly/yearly rules now apply and read back correctly. Note that yearly `BYMONTH` rules remain unsupported by OmniFocus itself and surface a clear error.
- **Project assignment via `update`**: moving a task into a project now succeeds (previously failed on the broken task lookup).
- **Dropping tasks and projects**: `drop` reported the wrong result because OmniJS exposes neither `task.dropped` nor `Project.markDropped()`. Tasks are now read back via `taskStatus === Task.Status.Dropped`, and projects are dropped by setting `status = Project.Status.Dropped`.
- **Opening / URL generation for projects**: `open` and `url` misclassified project IDs as tasks (a project's backing task shares its ID, and `Task.byIdentifier` was checked first). Projects are now resolved before tasks, producing the correct item type and `omnifocus:///project/...` URL.
- **Tag available-task counts**: `availableTaskCount` always came back `undefined` because OmniJS `Tag` has no such property. It is now computed as `tag.availableTasks.length`, so tag creation, queries, and count filters return real numbers.
- **Statistics**: `stats` counted only completed tasks (so `tasksDueToday`, overdue, and flagged counts were wrong) and was capped at the default page size. It now counts all tasks across the full database.
- **Templates**: creating a project from a template crashed when a template task had no `tags`. Loaded templates are normalized so a missing `tags` field defaults to an empty list.
- **Integration-test cleanup script**: now supports non-interactive runs via `--yes`/`--force`/`-y` or the `CI` / `OFOCUS_FORCE_CLEANUP` environment variables, and reliably removes all namespaced test items.

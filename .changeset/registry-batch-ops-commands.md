---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Drive the batch-ops and defer commands from centralized command descriptors

`complete-batch`, `update-batch`, `delete-batch`, `defer`, and `defer-batch` now flow from a single descriptor in the SDK that drives the SDK function, the CLI subcommand, and the MCP tool. This removes duplicate hand-written registrations across the three surfaces.

**New SDK exports**:

- `completeTasksDescriptor`
- `updateTasksDescriptor`
- `deleteTasksDescriptor`
- `deferTaskDescriptor`
- `deferTasksDescriptor`

**CLI behavior change**:

- `ofocus update-batch` now accepts `--title <text>` and `--note <text>`, matching the property set already available through the MCP `tasks_update_batch` tool. Previously these were settable in batch only via MCP.
- The batch commands take their task IDs as a variadic positional (`ofocus complete-batch <task-ids...>`), unchanged in form but now derived from the descriptor's array-typed positional rather than hand-wired.

**Breaking CLI changes** (`update-batch` flags, driven by the descriptor's canonical long-form names):

- Two flags are renamed: `--tag <name...>` → `--tags <name...>`, and `--estimate <minutes>` → `--estimated-minutes <n>`.
- All short aliases are dropped: `-f` (`--flag`), `-d` (`--due`), `-p` (`--project`), `-t` (`--tag`), `-e` (`--estimate`).
- Migration: an invocation like `ofocus update-batch <ids...> -f --tag Work --estimate 30` becomes `ofocus update-batch <ids...> --flag --tags Work --estimated-minutes 30`.

The MCP tool names (`tasks_complete_batch`, `tasks_update_batch`, `tasks_delete_batch`, `task_defer`, `tasks_defer_batch`) are unchanged.

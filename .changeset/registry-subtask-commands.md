---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Drive `subtask`, `subtasks`, and `move-to-parent` from centralized command descriptors

These three subtask commands now flow from a single descriptor in the SDK that drives the SDK function, the CLI subcommand, and the MCP tool. This removes duplicate hand-written registrations across the three surfaces.

**Bug fix (MCP)**: the `subtask_create` tool previously passed arguments to `createSubtask` in the wrong order, using the parent task ID as the new subtask's title and the title as the parent lookup. Subtask creation through MCP was effectively broken; it now works correctly.

**New SDK exports**:

- `createSubtaskDescriptor`
- `querySubtasksDescriptor`
- `moveTaskToParentDescriptor`

**CLI behavior changes**:

- `ofocus subtask`: `--parent <id>` is now `--parent-task-id <id>`; `--tag <name...>` is now `--tags <name...>`; `--estimate <minutes>` is now `--estimated-minutes <minutes>`. The short aliases `-n`, `-d`, `-f`, `-t`, and `-e` are removed — use the long forms `--note`, `--due`, `--flag`, `--tags`, `--estimated-minutes`.
- `ofocus move-to-parent`: `--parent <id>` is now `--parent-task-id <id>`.
- `ofocus subtasks`: the boolean `--completed` and `--flagged` filters now also accept negated `--no-completed` and `--no-flagged` forms.

**MCP behavior change**:

- The `task_move` tool parameter `newParentId` is renamed to `parentTaskId` for consistency with the SDK signature.

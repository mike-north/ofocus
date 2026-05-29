---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Migrate remaining task commands to the descriptor registry, completing 100% descriptor-driven routing.

## New descriptor exports (`@ofocus/sdk`)

- `queryTasksDescriptor` — drives CLI `tasks` and MCP `tasks_list`
- `updateTaskDescriptor` — drives CLI `update` and MCP `task_update`
- `getStatsDescriptor` — drives CLI `stats` and MCP `stats`
- `dropProjectDescriptor` — drives CLI `drop-project` and MCP `project_drop`

## What this enables

The entire command surface is now descriptor-driven (no remaining manual
`server.registerTool` or `.command(...).action(...)` hand-wire registrations
outside of intentional exceptions: `list-commands`, `review-interval`
combining two MCP tools, and `import` whose CLI surface reads a file path
while the MCP surface accepts raw content). This is the prerequisite for
routing `list-commands` output through the descriptor registry.

## Expanded `tasks_list` / `tasks` surface

The `queryTasksDescriptor` exposes the full query vocabulary previously only
available via the `queryTasks` SDK function — 57 fields covering:

- Extended boolean predicates: `notFlagged`, `notCompleted`, `dropped`,
  `notDropped`, `blocked`, `inInbox`, `hasDue`, `noDue`, `hasDefer`,
  `hasNote`, `hasAttachments`, `hasSubtasks`, `hasRepetition`,
  `effectivelyCompleted`, `effectivelyDropped`
- Status convenience: `status` (active/completed/dropped/deferred)
- Membership: `tagMode`, `folder` (transitive)
- Date predicates: `dueOn`, `dueWithin`, `deferBefore`, `deferAfter`,
  `deferOn`, `deferWithin`, `completedBefore`, `completedAfter`
- Numeric: `estimateLt`, `estimateGt`, `estimateEq`
- String matching: `nameContains`, `nameStarts`, `nameEquals`, `nameRegex`,
  `noteContains`, `noteRegex`, `caseSensitive`
- Projection: `fields`, `excludeFields`
- Sort: `sort`, `reverse`, `nullsFirst`
- Shape modifiers: `count`, `first`, `last`, `idsOnly`, `groupBy`, `stats`
- Pagination: `limit`, `offset`, `all`

## `format` parameter now auto-injected for migrated tools

`tasks_list`, `task_update`, `stats`, and `project_drop` now receive the
`format` parameter automatically via `registerMcpTool`. Previously
`tasks_list` and `task_update` were manually registered and missing `format`.

## MCP tool names unchanged

All existing MCP tool names are preserved byte-for-byte:
`tasks_list`, `task_update`, `stats`, `project_drop`.

## CLI flag changes for `update` / `tasks`

The `update` command dropped legacy short aliases and renamed flags to match
the descriptor-derived kebab-case forms:

| Old flag (removed)                                         | New flag                         |
| ---------------------------------------------------------- | -------------------------------- |
| `-n, --note`                                               | `--note`                         |
| `-d, --due`                                                | `--due`                          |
| `-f, --flag`                                               | `--flag`                         |
| `-p, --project`                                            | `--project`                      |
| `-t, --tag <name...>`                                      | `--tags <name...>`               |
| `-e, --estimate`                                           | `--estimated-minutes`            |
| `--repeat <frequency>` + `--every <n>` + `--repeat-method` | `--repeat <RepetitionRule JSON>` |

The `--flag`/`--no-flag` boolean pair is retained. The `--clear-estimate`
and `--clear-repeat` flags are unchanged.

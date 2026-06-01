# @ofocus/mcp

## 0.5.0

### Minor Changes

- 912ef62: Add OmniJS eval escape hatch: `evaluateScript` SDK function, `ofocus eval` CLI command, and `omnifocus_eval` MCP tool.

  This is a last-resort tool for operations that no combination of flags on the deterministic commands (`tasks`, `projects`, `folders`, `tags`, `forecast`, `search`, etc.) can cover. Agents should always try the declarative surface first.

  Key constraints:
  - Scripts must end with a `return <expression>;` statement so the result can be decoded as JSON
  - Script size is capped at 64 KB (both inline and file paths)
  - Arguments are injected via a `const args = JSON.parse(...)` prefix to avoid string-interpolation escaping issues
  - OmniJS error messages are surfaced verbatim for debuggability

- 02c3b27: Add `ofocus changes`, a change-detection command that reports what changed in OmniFocus since the last look — cache-first and instant by default, with `--fresh` for a live scan, `--pending` for accumulated deltas (for a notification hook), field-level diffs, a fingerprint fast path, and an opt-in `--semantic` natural-language summary via a user-configured command (`OFOCUS_SUMMARY_CMD`). Introduces the new `@ofocus/productivity` package (productivity niceties built on `@ofocus/sdk`), surfaced through the CLI and MCP server.

  Known follow-ups (not yet wired): scope filters to narrow a watch (e.g. `--project`/`--tag`), the `--since` stateless cursor, wiring the Full Disk Access mtime accelerator into the command hot path, and by-generation caching of semantic summaries.

- dbf79e5: Add `ofocus resolve <query>` — fuzzy, ranked resolution of OmniFocus entities (project/task/tag/folder) that returns a confident match, a tight candidate set, or none, so an agent can pass a loose reference instead of scanning lists. `--kind temporal-anchor` fuzzy-matches a repeating task and returns its next occurrence. Surfaced through the CLI and MCP server.
- 9e296b1: Add an OmniFocus temporal engine: `ofocus next-occurrences <task>` (the next dates a repeating task is due, accounting for its repeat rule and method), `ofocus occurrences [--days N]` (upcoming repeat instances across all repeating tasks in a window), and `ofocus today` / `ofocus this-week` digests (overdue / due-today / flagged, and a day-by-day week view, with computed "due in / overdue by" durations). Surfaced through the CLI and MCP server.
- 59d2493: Add `--all` pagination flag to every list command

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

- 09baed6: feat(registry): migrate advanced commands (perspectives, review, focus, sync, archive, attachments, taskpaper, templates, url, open) to the centralized registry

  This is W3 batch 6 — the final large migration step. Every command that was previously hand-wired in the CLI and directly registered as an MCP tool now flows through a `defineCommand` descriptor that drives CLI, MCP, and SDK surfaces from a single source of truth.

  ## New descriptor exports from `@ofocus/sdk`

  ### Perspectives
  - `listPerspectivesDescriptor` — CLI: `perspectives`, MCP: `perspectives_list`
  - `queryPerspectiveDescriptor` — CLI: `perspective <name>`, MCP: `perspective_query`

  ### Review
  - `reviewProjectDescriptor` — CLI: `review <project-id>`, MCP: `project_review`
  - `queryProjectsForReviewDescriptor` — CLI: `projects-for-review`, MCP: `projects_for_review`
  - `getReviewIntervalDescriptor` — CLI: `review-interval-get <project-id>`, MCP: `project_review_interval_get`
  - `setReviewIntervalDescriptor` — CLI: `review-interval-set <project-id>`, MCP: `project_review_interval_set`

  ### Focus
  - `focusOnDescriptor` — CLI: `focus <target>`, MCP: `focus_set`
  - `unfocusDescriptor` — CLI: `unfocus`, MCP: `focus_clear`
  - `getFocusedDescriptor` — CLI: `focused`, MCP: `focus_get`

  ### Sync
  - `getSyncStatusDescriptor` — CLI: `sync-status`, MCP: `sync_status`
  - `triggerSyncDescriptor` — CLI: `sync`, MCP: `sync_trigger`

  ### Archive
  - `archiveTasksDescriptor` — CLI: `archive`, MCP: `archive`
  - `compactDatabaseDescriptor` — CLI: `compact`, MCP: `compact_database`

  ### Attachments
  - `addAttachmentDescriptor` — CLI: `attach <task-id> <file-path>`, MCP: `attachment_add`
  - `listAttachmentsDescriptor` — CLI: `attachments <task-id>`, MCP: `attachments_list`
  - `removeAttachmentDescriptor` — CLI: `detach <task-id> <attachment-name>`, MCP: `attachment_remove`

  ### TaskPaper
  - `exportTaskPaperDescriptor` — CLI: `export`, MCP: `export_taskpaper`
  - `importTaskPaperDescriptor` — CLI: `import-taskpaper` (MCP-native), MCP: `import_taskpaper`

  ### Templates
  - `saveTemplateDescriptor` — CLI: `template-save <name> <source-project>`, MCP: `template_save`
  - `listTemplatesDescriptor` — CLI: `template-list`, MCP: `templates_list`
  - `getTemplateDescriptor` — CLI: `template-get <template-name>`, MCP: `template_get`
  - `createFromTemplateDescriptor` — CLI: `template-create <template-name>`, MCP: `template_create_project`
  - `deleteTemplateDescriptor` — CLI: `template-delete <template-name>`, MCP: `template_delete`

  ### URL / Open
  - `generateUrlDescriptor` — CLI: `url <id>`, MCP: `generate_url`
  - `openItemDescriptor` — CLI: `open <id>`, MCP: `open`

  ## MCP tool names (public API — all preserved exactly)

  All existing MCP tool names are unchanged. Every migrated descriptor specifies an explicit `mcpName:` that matches the previously registered tool name byte-for-byte.

  ## CLI flag renames and removed short aliases

  Short aliases are dropped project-wide (0.x; no external users). Every removal is documented below.

  | Command           | Before                      | After                                            | Change                                                           |
  | ----------------- | --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
  | `template-save`   | `-d, --description <text>`  | `--description <value>`                          | `-d` short alias removed                                         |
  | `template-create` | `-p, --project-name <name>` | `--project-name <value>`                         | `-p` short alias removed                                         |
  | `template-create` | `-f, --folder <name>`       | `--folder <value>`                               | `-f` short alias removed                                         |
  | `export`          | `-p, --project <name>`      | `--project <value>`                              | `-p` short alias removed                                         |
  | `export`          | `--include-completed`       | `--include-completed` / `--no-include-completed` | Negation form added                                              |
  | `export`          | `--include-dropped`         | `--include-dropped` / `--no-include-dropped`     | Negation form added                                              |
  | `archive`         | `--dry-run`                 | `--dry-run` / `--no-dry-run`                     | Negation form added                                              |
  | `focus`           | `<name>`                    | `<target>`                                       | Positional renamed from `name` to `target`                       |
  | `focus`           | `--by-id`                   | `--by-id` / `--no-by-id`                         | Negation form added                                              |
  | `attach`          | `<task-id> <file>`          | `<task-id> <file-path>`                          | Second positional renamed from `file` to `file-path`             |
  | `detach`          | `<task-id> <attachment>`    | `<task-id> <attachment-name>`                    | Second positional renamed from `attachment` to `attachment-name` |
  | `template-get`    | `<name>`                    | `<template-name>`                                | Positional renamed from `name` to `template-name`                |
  | `template-delete` | `<name>`                    | `<template-name>`                                | Positional renamed from `name` to `template-name`                |
  | `perspective`     | `--limit <n>`               | `--limit <value>`                                | Display text changed; behavior unchanged                         |

  ## CLI commands that remain hand-wired
  - **`import`** — The CLI `import` command takes a file path argument and reads the content; the MCP/SDK surface (`importTaskPaperDescriptor`) accepts raw TaskPaper content as a string. The CLI wraps the file-reading step and delegates to `importTaskPaper` directly. It is not registered via `registerCliCommand`.
  - **`review-interval`** — Combines two distinct MCP operations (`get` + `set`) into one CLI command controlled by a `--set` flag. The descriptors `getReviewIntervalDescriptor` and `setReviewIntervalDescriptor` cover the MCP surfaces; the CLI delegates to their handlers directly.

- c92d880: Drive the batch-ops and defer commands from centralized command descriptors

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

- 7e02ede: Migrate project, folder, and tag commands to the centralized command registry

  ## New descriptor exports (`@ofocus/sdk`)

  The following `defineCommand` descriptors are now exported from `@ofocus/sdk`. Each descriptor drives the CLI subcommand, MCP tool, and SDK function from a single Zod-backed declaration:
  - `listProjectsDescriptor` — `projects` CLI / `projects_list` MCP
  - `createProjectDescriptor` — `create-project` CLI / `project_create` MCP
  - `updateProjectDescriptor` — `update-project` CLI / `project_update` MCP
  - `deleteProjectDescriptor` — `delete-project` CLI / `project_delete` MCP
  - `listFoldersDescriptor` — `folders` CLI / `folders_list` MCP
  - `createFolderDescriptor` — `create-folder` CLI / `folder_create` MCP
  - `updateFolderDescriptor` — `update-folder` CLI / `folder_update` MCP
  - `deleteFolderDescriptor` — `delete-folder` CLI / `folder_delete` MCP
  - `listTagsDescriptor` — `tags` CLI / `tags_list` MCP
  - `createTagDescriptor` — `create-tag` CLI / `tag_create` MCP
  - `updateTagDescriptor` — `update-tag` CLI / `tag_update` MCP
  - `deleteTagDescriptor` — `delete-tag` CLI / `tag_delete` MCP

  ## MCP tool names — unchanged

  All existing MCP tool names are preserved: `projects_list`, `project_create`, `project_update`, `project_delete`, `folders_list`, `folder_create`, `folder_update`, `folder_delete`, `tags_list`, `tag_create`, `tag_update`, `tag_delete`.

  ## CLI flag renames and removed short aliases

  Short aliases and old flag names have been dropped in favor of canonical kebab-case long forms. Update your invocations as follows:

  ### `create-project`

  | Before            | After                   |
  | ----------------- | ----------------------- |
  | `-n <text>`       | `--note <value>`        |
  | `--folder <name>` | `--folder-name <value>` |
  | `-d <date>`       | `--due-date <value>`    |
  | `--due <date>`    | `--due-date <value>`    |
  | `--defer <date>`  | `--defer-date <value>`  |

  ```diff
  - ofocus create-project "My Project" -n "A note" --folder Work -d 2026-06-01 --defer 2026-05-01
  + ofocus create-project "My Project" --note "A note" --folder-name Work --due-date 2026-06-01 --defer-date 2026-05-01
  ```

  ### `create-folder`

  | Before             | After                          |
  | ------------------ | ------------------------------ |
  | `--parent <name>`  | `--parent-folder-name <value>` |
  | `--parent-id <id>` | `--parent-folder-id <value>`   |

  ```diff
  - ofocus create-folder Sub --parent Root --parent-id abc123
  + ofocus create-folder Sub --parent-folder-name Root --parent-folder-id abc123
  ```

  ### `create-tag`

  | Before             | After                       |
  | ------------------ | --------------------------- |
  | `--parent <name>`  | `--parent-tag-name <value>` |
  | `--parent-id <id>` | `--parent-tag-id <value>`   |

  ```diff
  - ofocus create-tag Work --parent Root --parent-id abc123
  + ofocus create-tag Work --parent-tag-name Root --parent-tag-id abc123
  ```

  ### `update-tag`

  | Before             | After                       |
  | ------------------ | --------------------------- |
  | `--parent <name>`  | `--parent-tag-name <value>` |
  | `--parent-id <id>` | `--parent-tag-id <value>`   |

  ```diff
  - ofocus update-tag <id> --parent Root --parent-id abc123
  + ofocus update-tag <id> --parent-tag-name Root --parent-tag-id abc123
  ```

  ### `update-project`

  | Before            | After                   |
  | ----------------- | ----------------------- |
  | `-n <text>`       | `--note <value>`        |
  | `--folder <name>` | `--folder-name <value>` |
  | `-d <date>`       | `--due-date <value>`    |
  | `--due <date>`    | `--due-date <value>`    |
  | `--defer <date>`  | `--defer-date <value>`  |

  ```diff
  - ofocus update-project <id> -n "New note" --folder Work -d 2026-06-01
  + ofocus update-project <id> --note "New note" --folder-name Work --due-date 2026-06-01
  ```

  ### `update-folder`

  | Before             | After                          |
  | ------------------ | ------------------------------ |
  | `--parent <name>`  | `--parent-folder-name <value>` |
  | `--parent-id <id>` | `--parent-folder-id <value>`   |

  ```diff
  - ofocus update-folder <id> --parent Root --parent-id abc123
  + ofocus update-folder <id> --parent-folder-name Root --parent-folder-id abc123
  ```

  ### List commands (`projects`, `folders`, `tags`)

  The listers now expose explicit `--limit` and `--offset` pagination flags (previously absent from the CLI surface but supported by the underlying query engine).

- 8bbc457: Drive `subtask`, `subtasks`, and `move-to-parent` from centralized command descriptors

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
  - `ofocus list-commands` output is updated so the advertised usage for these three commands matches the new flags.

  **MCP behavior change**:
  - The `task_move` tool parameter `newParentId` is renamed to `parentTaskId` for consistency with the SDK signature.

- 83eae3a: Migrate remaining task commands to the descriptor registry, completing 100% descriptor-driven routing.

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

- b97a283: Full repetition rule support: Nth-weekday, yearly, scheduled anchor, and apply/clear commands

  Expands `RepetitionRule` with new fields and adds dedicated SDK commands plus CLI/MCP surfaces for applying and clearing repetition rules on existing tasks.

  **New `RepetitionRule` fields** (fully additive — existing rules continue to work):
  - `repeatMethod: "scheduled"` — maps to `Task.RepetitionMethod.Fixed` (strict cadence, date-fixed). Previously only `"due-again"` and `"defer-another"` were supported.
  - `daysOfWeekPositions?: number[]` — positional prefix for BYDAY in monthly recurrences (e.g. `[1, -1]` = first and last occurrence). Values must be integers in `[-5, -1] ∪ [1, 5]`. Only valid when `frequency` is `"monthly"`.
  - `monthsOfYear?: number[]` — month-of-year values for `BYMONTH=` in yearly recurrences (1=January, 12=December). Only valid when `frequency` is `"yearly"`.

  **New RRULE variants now emitted by `buildRRule`**:
  - `FREQ=MONTHLY;BYDAY=1MO` — first Monday of every month
  - `FREQ=MONTHLY;BYDAY=1MO,-1MO` — first and last Monday
  - `FREQ=MONTHLY;BYDAY=1MO,1WE,-1MO,-1WE` — cross-product of positions × days
  - `FREQ=YEARLY;BYMONTH=3,6,9,12` — quarterly months
  - `FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25` — Christmas Day

  **New SDK exports**:
  - `repeatMethodToOmniJS(method)` — maps `"due-again" | "defer-another" | "scheduled"` to the OmniJS `Task.RepetitionMethod.*` expression string. All internal callers (`inbox.ts`, `batch.ts`, `subtasks.ts`, `update.ts`) now use this helper instead of hand-rolling the switch.
  - `applyRepetitionRule(taskId, rule)` — apply a rule to an existing task.
  - `clearRepetitionRule(taskId)` — set `task.repetitionRule = null`.
  - `applyRepetitionRuleDescriptor` — descriptor driving CLI + MCP.
  - `clearRepetitionRuleDescriptor` — descriptor driving CLI + MCP.
  - Types: `ApplyRepetitionRuleResult`, `ClearRepetitionRuleResult`.

  **New CLI commands**:
  - `ofocus apply-repetition <task-id> --frequency <...> [--interval <n>] [--repeat-method <...>] [--days-of-week <...>] [--day-of-month <n>] [--days-of-week-positions <...>] [--months-of-year <...>]`
  - `ofocus clear-repetition <task-id>`

  **New MCP tools**:
  - `task_apply_repetition`
  - `task_clear_repetition`

  **Bug fix**: previous callers incorrectly mapped `"defer-another"` to `Task.RepetitionMethod.DeferDate`. The correct OmniJS constant is `Task.RepetitionMethod.Start`. This is now enforced through the shared `repeatMethodToOmniJS` helper.

- 6fb1243: Add TOON output format for token-efficient agent consumption

  ## CLI: `--format <json|toon>` option

  The CLI gains a new top-level `--format <fmt>` option (default `json`):

  ```
  ofocus tasks --format toon        # TOON-encoded output (~40% smaller)
  ofocus tasks --format json        # Pretty-printed JSON (previous default)
  ofocus tasks --human              # Human-readable text (unchanged)
  ```

  `--human` continues to be the way to select human-readable output and takes precedence over `--format` when both are supplied. `--format human` is rejected with a `VALIDATION_ERROR` envelope.

  The `output()` function signature changes from `(result, json: boolean)` to `(result, format: OutputFormat)` where `OutputFormat = 'json' | 'toon' | 'human'`. The `OutputFormat` type is now exported from `@ofocus/cli`.

  ## MCP: `format` parameter on all tools

  Every MCP tool registered through `registerMcpTool` gains an optional `format?: 'json' | 'toon'` parameter (default `'toon'`). The default is TOON because agents — the primary consumers of MCP tools — benefit from the token savings; humans rarely read MCP tool output directly. Note: the `'toon'` default applies only to tools registered via `registerMcpTool` (descriptor-routed tools); tools registered directly with `server.registerTool(...)` that call `formatResult` without a `format` argument continue to receive JSON output until they are migrated to the descriptor path.

  ```
  # In an MCP tool call:
  format: "toon"   # default — TOON-encoded result
  format: "json"   # standard JSON for callers that require it
  ```

  ## Why TOON?

  [TOON](https://toonformat.dev/) (Token-Oriented Object Notation) is a compact, human-readable encoding of the JSON data model designed for LLM consumption. For the uniform array-of-objects shapes that dominate this SDK's output, TOON is approximately **40–62% smaller than JSON**.

  Example — 3 tasks, JSON vs TOON (CliOutput envelope):

  **JSON** (366 bytes):

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "abc123",
        "name": "Buy milk",
        "flagged": false,
        "completed": false
      },
      {
        "id": "def456",
        "name": "Pay bills",
        "flagged": true,
        "completed": false
      },
      {
        "id": "ghi789",
        "name": "Call mom",
        "flagged": false,
        "completed": true
      }
    ],
    "error": null
  }
  ```

  **TOON** (138 bytes):

  ```
  success: true
  data[3]{id,name,flagged,completed}:
    abc123,Buy milk,false,false
    def456,Pay bills,true,false
    ghi789,Call mom,false,true
  error: null
  ```

  62% reduction in this example. Real-world task lists with more fields typically see 40–50% savings.

  ## New dependency

  Both `@ofocus/cli` and `@ofocus/mcp` now depend on `@toon-format/toon@^2.3.0`.

### Patch Changes

- 605b366: Refresh README for OmniJS; add MCP smoke test and CLI UAT subprocess harness
  - README: confirmed OmniJS (OmniAutomation) wording is accurate throughout; no AppleScript references remain.
  - `@ofocus/mcp`: added `packages/mcp/tests/smoke.test.ts` — boots the MCP server in-process via `InMemoryTransport`, asserts the full tool manifest (58 tools across 5 domain categories), and round-trips representative calls per category with the OmniJS bridge mocked. No OmniFocus installation required; CI-safe.
  - `@ofocus/cli`: added `packages/cli/tests/uat/helpers.ts` (reusable `runCli` subprocess harness) and `packages/cli/tests/uat/list-commands.test.ts` (asserts JSON envelope shape, `CommandInfo` fields, core domain names, and human formatter output). The UAT suite is skipped by default and opts in via `OFOCUS_UAT=1` — run with `pnpm -F @ofocus/cli build && OFOCUS_UAT=1 pnpm -F @ofocus/cli test`.

  No public API surface changes.

- 11053c0: fix(sdk): accept comma-separated --fields and --sort matching documented usage

  `--fields`, `--exclude-fields`, and `--sort` on all list commands now accept
  both **comma-separated** (`--fields id,name,dueDate`) and **space-separated**
  (`--fields id name dueDate`) forms. Previously only the space-separated form
  worked; the comma form produced `VALIDATION_ERROR: Unknown field: id,name,dueDate`
  because the whole comma string was treated as one field name.

  Commands updated: `tasks`, `projects`, `folders`, `tags`, `forecast`, `deferred`,
  `search`, `subtasks`. All now expose `--fields`, `--exclude-fields`, `--sort`,
  and `--reverse`.

  Membership filters (`--tag`, `--project`, `--folder`) are deliberately NOT
  normalized — tag/project/folder names can legitimately contain commas, so
  splitting would corrupt them.

  New SDK exports: `splitCommaSeparated`, `commaSeparatedStringArray`,
  `listProjectionSchema`, `listSortSchema`.

  The `tasks` command has been migrated to the centralized registry so it now
  shares the same `fields`/`sort` vocabulary as all other list commands. The
  `tasks` registry MCP tool is now exported as `tasks_query`.

- dfd0290: Fix several OmniFocus operations that failed against a live database.
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

- Updated dependencies [dfdb766]
- Updated dependencies [912ef62]
- Updated dependencies [11053c0]
- Updated dependencies [7a0815d]
- Updated dependencies [dfd0290]
- Updated dependencies [02c3b27]
- Updated dependencies [dbf79e5]
- Updated dependencies [9e296b1]
- Updated dependencies [59d2493]
- Updated dependencies [90d3b85]
- Updated dependencies [09baed6]
- Updated dependencies [c92d880]
- Updated dependencies [7e02ede]
- Updated dependencies [f37560f]
- Updated dependencies [8bbc457]
- Updated dependencies [83eae3a]
- Updated dependencies [b97a283]
- Updated dependencies [9d3577f]
- Updated dependencies [cfc89de]
  - @ofocus/sdk@0.5.0
  - @ofocus/productivity@0.1.0

## 0.4.1

### Patch Changes

- Updated dependencies [cb84bb1]
- Updated dependencies [cb84bb1]
- Updated dependencies [b822dea]
  - @ofocus/sdk@0.4.0

## 0.4.0

### Minor Changes

- 39da3ee: Add MCP (Model Context Protocol) server package that enables AI assistants like Claude to interact with OmniFocus.

  Features:
  - Complete MCP server implementation wrapping @ofocus/sdk
  - 49 tools covering all major OmniFocus operations
  - Task management (create, update, complete, defer, delete, search)
  - Project and folder management
  - Tag management
  - Perspectives and forecast queries
  - Batch operations for efficiency
  - Templates, attachments, and import/export
  - Database maintenance and sync operations
  - Native integration with Claude Desktop via stdio transport

  Usage: Configure in Claude Desktop's `claude_desktop_config.json` to enable natural language task management with OmniFocus.

- 39da3ee: Add CRUD operations for projects and folders, plus utility commands

  **SDK Functions:**
  - `updateProject` - Update project name, note, status, folder, sequential, due/defer dates
  - `deleteProject` - Permanently delete a project
  - `dropProject` - Mark project as dropped (preserves history)
  - `updateFolder` - Rename folder or move to new parent
  - `deleteFolder` - Permanently delete a folder
  - `duplicateTask` - Clone a task with all properties
  - `openItem` - Open any item in OmniFocus UI (auto-detects type)
  - `getReviewInterval` / `setReviewInterval` - Get/set project review interval in days

  **CLI Commands:**
  - `update-project <id>` with options for all project properties
  - `delete-project <id>` - Permanently delete
  - `drop-project <id>` - Mark as dropped
  - `update-folder <id>` with `--name` and `--parent` options
  - `delete-folder <id>` - Permanently delete
  - `duplicate <task-id>` with `--include-subtasks` option
  - `open <id>` - Open item in OmniFocus UI
  - `review-interval <project-id>` with `--set <days>` option

  **MCP Tools:**
  - `project_update`, `project_delete`, `project_drop`
  - `project_review_interval_get`, `project_review_interval_set`
  - `folder_update`, `folder_delete`
  - `task_duplicate`, `open`

  Includes comprehensive unit tests (194 new tests) covering validation, success paths, and error handling.

### Patch Changes

- Updated dependencies [39da3ee]
- Updated dependencies [39da3ee]
  - @ofocus/sdk@0.3.0

## 0.3.0

### Minor Changes

- 9b84d51: Add MCP (Model Context Protocol) server package that enables AI assistants like Claude to interact with OmniFocus.

  Features:
  - Complete MCP server implementation wrapping @ofocus/sdk
  - 49 tools covering all major OmniFocus operations
  - Task management (create, update, complete, defer, delete, search)
  - Project and folder management
  - Tag management
  - Perspectives and forecast queries
  - Batch operations for efficiency
  - Templates, attachments, and import/export
  - Database maintenance and sync operations
  - Native integration with Claude Desktop via stdio transport

  Usage: Configure in Claude Desktop's `claude_desktop_config.json` to enable natural language task management with OmniFocus.

### Patch Changes

- Updated dependencies [9b84d51]
  - @ofocus/sdk@0.2.1

## 0.2.0

### Minor Changes

- 248e5c9: Add MCP (Model Context Protocol) server package that enables AI assistants like Claude to interact with OmniFocus.

  Features:
  - Complete MCP server implementation wrapping @ofocus/sdk
  - 49 tools covering all major OmniFocus operations
  - Task management (create, update, complete, defer, delete, search)
  - Project and folder management
  - Tag management
  - Perspectives and forecast queries
  - Batch operations for efficiency
  - Templates, attachments, and import/export
  - Database maintenance and sync operations
  - Native integration with Claude Desktop via stdio transport

  Usage: Configure in Claude Desktop's `claude_desktop_config.json` to enable natural language task management with OmniFocus.

### Patch Changes

- Updated dependencies [d3fde6b]
  - @ofocus/sdk@0.2.0

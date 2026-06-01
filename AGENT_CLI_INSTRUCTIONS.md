# OmniFocus CLI — Agent Reference

<!-- generated: DO NOT EDIT BY HAND — see scripts/generate-agent-docs.ts -->

This document is the authoritative reference for the `ofocus` CLI.
All commands output JSON by default. Use `--human` for human-readable output.

## Output Format

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

## Tasks

#### `ofocus inbox`

Add a new task to the OmniFocus inbox.

**Usage:**

```bash
ofocus inbox <title> [--note <note>] [--due <due>] [--defer <defer>] [--flag] [--tags <val...>] [--estimated-minutes <estimatedMinutes>] [--repeat-frequency <repeatFrequency>] [--repeat-interval <repeatInterval>] [--repeat-method <repeatMethod>] [--repeat-days-of-week <val...>] [--repeat-day-of-month <repeatDayOfMonth>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--note` | `string` | no | Task note / description |
| `--due` | `string` | no | Due date (ISO 8601 or natural language like 'tomorrow') |
| `--defer` | `string` | no | Defer date (ISO 8601 or natural language) |
| `--flag` / `--no-flag` | `boolean` | no | Mark the task as flagged |
| `--tags` | `string[]` | no | Tag names to apply |
| `--estimated-minutes` | `number` | no | Estimated duration in minutes |
| `--repeat-frequency` | `daily \| weekly \| monthly \| yearly` | no | Repetition frequency |
| `--repeat-interval` | `number` | no | Repeat every N periods (default: 1) |
| `--repeat-method` | `due-again \| defer-another` | no | Anchor for the next occurrence (default: due-again) |
| `--repeat-days-of-week` | `number[]` | no | Days of week for weekly repeats (0=Sunday … 6=Saturday) |
| `--repeat-day-of-month` | `number` | no | Day of month for monthly repeats |

#### `ofocus complete`

Mark a task as complete in OmniFocus.

**Usage:**

```bash
ofocus complete <taskId>
```

#### `ofocus subtask`

Create a subtask under an existing parent task.

**Usage:**

```bash
ofocus subtask <title> --parent-task-id <parentTaskId> [--note <note>] [--due <due>] [--defer <defer>] [--flag] [--tags <val...>] [--estimated-minutes <estimatedMinutes>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--parent-task-id` | `string` | yes | ID of the parent task |
| `--note` | `string` | no | Subtask note |
| `--due` | `string` | no | Due date |
| `--defer` | `string` | no | Defer date |
| `--flag` / `--no-flag` | `boolean` | no | Flag the subtask |
| `--tags` | `string[]` | no | Tags to apply |
| `--estimated-minutes` | `number` | no | Estimated duration in minutes |

#### `ofocus defer`

Defer a task by a number of days or to a specific date.

**Usage:**

```bash
ofocus defer <taskId> [--days <days>] [--to <to>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--days` | `number` | no | Defer by this many days from today |
| `--to` | `string` | no | Defer to a specific date (ISO 8601) |

#### `ofocus delete`

Permanently delete a task from OmniFocus. Cannot be undone.

**Usage:**

```bash
ofocus delete <taskId>
```

#### `ofocus template-delete`

Delete a saved project template

**Usage:**

```bash
ofocus template-delete <templateName>
```

#### `ofocus drop`

Drop a task (marks it as dropped but preserves history).

**Usage:**

```bash
ofocus drop <taskId>
```

#### `ofocus duplicate`

Duplicate an existing task, optionally including its subtasks.

**Usage:**

```bash
ofocus duplicate <taskId> [--include-subtasks]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--include-subtasks` / `--no-include-subtasks` | `boolean` | no | Include subtasks in the duplicate (default: true) |

#### `ofocus attachments`

List attachments on a task

**Usage:**

```bash
ofocus attachments <taskId>
```

#### `ofocus perspectives`

List all perspectives in OmniFocus

**Usage:**

```bash
ofocus perspectives
```

#### `ofocus template-list`

List all saved project templates

**Usage:**

```bash
ofocus template-list
```

#### `ofocus move-to-parent`

Move a task to become a subtask of another task.

**Usage:**

```bash
ofocus move-to-parent <taskId> --parent-task-id <parentTaskId>
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--parent-task-id` | `string` | yes | ID of the new parent task |

#### `ofocus deferred`

List tasks with defer dates.

**Usage:**

```bash
ofocus deferred [--deferred-after <deferredAfter>] [--deferred-before <deferredBefore>] [--blocked-only] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--deferred-after` | `string` | no | Only tasks deferred after this date |
| `--deferred-before` | `string` | no | Only tasks deferred before this date |
| `--blocked-only` / `--no-blocked-only` | `boolean` | no | Only show tasks currently blocked by their defer date |
| `--fields` | `unknown` | yes | Fields to include in each result item (comma- or space-separated, e.g. id,name,dueDate) |
| `--exclude-fields` | `unknown` | yes | Fields to exclude from the result items (comma- or space-separated) |
| `--sort` | `unknown` | yes | Sort keys (comma- or space-separated field names, e.g. dueDate,name) |
| `--reverse` / `--no-reverse` | `boolean` | no | Reverse the sort order (default: false) |
| `--limit` | `number` | no | Maximum number of results to return (default: 100) |
| `--offset` | `number` | no | Number of results to skip for pagination |
| `--all` / `--no-all` | `boolean` | no | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `ofocus perspective`

Query tasks from a specific perspective

**Usage:**

```bash
ofocus perspective <name> [--limit <limit>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--limit` | `number` | no | Maximum number of results to return |

#### `ofocus projects-for-review`

List projects that are due for review

**Usage:**

```bash
ofocus projects-for-review
```

#### `ofocus subtasks`

List subtasks of a parent task.

**Usage:**

```bash
ofocus subtasks <parentTaskId> [--completed] [--flagged] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--completed` / `--no-completed` | `boolean` | no | Filter by completion status (true = only completed, false = only incomplete) |
| `--flagged` / `--no-flagged` | `boolean` | no | Filter by flagged status |
| `--fields` | `unknown` | yes | Fields to include in each result item (comma- or space-separated, e.g. id,name,dueDate) |
| `--exclude-fields` | `unknown` | yes | Fields to exclude from the result items (comma- or space-separated) |
| `--sort` | `unknown` | yes | Sort keys (comma- or space-separated field names, e.g. dueDate,name) |
| `--reverse` / `--no-reverse` | `boolean` | no | Reverse the sort order (default: false) |
| `--limit` | `number` | no | Maximum number of results to return (default: 100) |
| `--offset` | `number` | no | Number of results to skip for pagination |
| `--all` / `--no-all` | `boolean` | no | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `ofocus tasks`

List and filter tasks from OmniFocus.

**Usage:**

```bash
ofocus tasks [--project <project>] [--tag <tag>] [--tag-mode <tagMode>] [--folder <folder>] [--flagged] [--not-flagged] [--completed] [--not-completed] [--dropped] [--not-dropped] [--blocked] [--available] [--in-inbox] [--has-due] [--no-due] [--has-defer] [--has-note] [--has-attachments] [--has-subtasks] [--has-repetition] [--effectively-completed] [--effectively-dropped] [--status <status>] [--due-before <dueBefore>] [--due-after <dueAfter>] [--due-on <dueOn>] [--due-within <dueWithin>] [--defer-before <deferBefore>] [--defer-after <deferAfter>] [--defer-on <deferOn>] [--defer-within <deferWithin>] [--completed-before <completedBefore>] [--completed-after <completedAfter>] [--estimate-lt <estimateLt>] [--estimate-gt <estimateGt>] [--estimate-eq <estimateEq>] [--name-contains <nameContains>] [--name-starts <nameStarts>] [--name-equals <nameEquals>] [--name-regex <nameRegex>] [--note-contains <noteContains>] [--note-regex <noteRegex>] [--case-sensitive] [--fields <val...>] [--exclude-fields <val...>] [--sort <val...>] [--reverse] [--nulls-first] [--count] [--first] [--last] [--ids-only] [--group-by <groupBy>] [--stats] [--limit <limit>] [--offset <offset>] [--all]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--project` | `string \| string[]` | no | Filter by project name (single value or array) |
| `--tag` | `string \| string[]` | no | Filter by tag name (single value or array) |
| `--tag-mode` | `any \| all \| none` | no | Tag-matching mode when multiple tags are given (default: all) |
| `--folder` | `string \| string[]` | no | Filter by folder name (transitive; single value or array) |
| `--flagged` / `--no-flagged` | `boolean` | no | Filter by flagged status |
| `--not-flagged` / `--no-not-flagged` | `boolean` | no | Exclude flagged tasks when true |
| `--completed` / `--no-completed` | `boolean` | no | Include completed tasks when true |
| `--not-completed` / `--no-not-completed` | `boolean` | no | Exclude completed tasks when true |
| `--dropped` / `--no-dropped` | `boolean` | no | Include dropped tasks when true |
| `--not-dropped` / `--no-not-dropped` | `boolean` | no | Exclude dropped tasks when true |
| `--blocked` / `--no-blocked` | `boolean` | no | Include only blocked tasks when true |
| `--available` / `--no-available` | `boolean` | no | Only show available (actionable) tasks |
| `--in-inbox` / `--no-in-inbox` | `boolean` | no | Include only inbox tasks when true |
| `--has-due` / `--no-has-due` | `boolean` | no | Include only tasks that have a due date |
| `--no-due` / `--no-no-due` | `boolean` | no | Include only tasks with no due date |
| `--has-defer` / `--no-has-defer` | `boolean` | no | Include only tasks that have a defer date |
| `--has-note` / `--no-has-note` | `boolean` | no | Include only tasks that have a non-empty note |
| `--has-attachments` / `--no-has-attachments` | `boolean` | no | Include only tasks with attachments |
| `--has-subtasks` / `--no-has-subtasks` | `boolean` | no | Include only tasks that have child subtasks |
| `--has-repetition` / `--no-has-repetition` | `boolean` | no | Include only tasks with a repetition rule |
| `--effectively-completed` / `--no-effectively-completed` | `boolean` | no | Include only effectively-completed tasks |
| `--effectively-dropped` / `--no-effectively-dropped` | `boolean` | no | Include only effectively-dropped tasks |
| `--status` | `active \| completed \| dropped \| deferred` | no | Filter by high-level task status (active, completed, dropped, deferred) |
| `--due-before` | `string` | no | Filter tasks due before this date (ISO 8601 or relative) |
| `--due-after` | `string` | no | Filter tasks due after this date (ISO 8601 or relative) |
| `--due-on` | `string` | no | Match tasks whose due date falls on this calendar day (UTC) |
| `--due-within` | `string` | no | Duration string like '7d'/'1w' — due date must be within now + duration |
| `--defer-before` | `string` | no | Filter tasks with defer date before this date |
| `--defer-after` | `string` | no | Filter tasks with defer date after this date |
| `--defer-on` | `string` | no | Match tasks whose defer date falls on this calendar day (UTC) |
| `--defer-within` | `string` | no | Duration string — defer date must be within now + duration |
| `--completed-before` | `string` | no | Filter tasks completed before this date |
| `--completed-after` | `string` | no | Filter tasks completed after this date |
| `--estimate-lt` | `number` | no | Estimated minutes less than this value |
| `--estimate-gt` | `number` | no | Estimated minutes greater than this value |
| `--estimate-eq` | `number` | no | Estimated minutes equal to this value |
| `--name-contains` | `string` | no | Task name contains this substring |
| `--name-starts` | `string` | no | Task name starts with this string |
| `--name-equals` | `string` | no | Task name equals this string |
| `--name-regex` | `string` | no | Task name matches this regular expression |
| `--note-contains` | `string` | no | Task note contains this substring |
| `--note-regex` | `string` | no | Task note matches this regular expression |
| `--case-sensitive` / `--no-case-sensitive` | `boolean` | no | Case sensitivity for name/note string predicates (default: false) |
| `--fields` | `string[]` | no | Whitelist of fields to include in each result item |
| `--exclude-fields` | `string[]` | no | Fields to exclude from each result item |
| `--sort` | `string[]` | no | Ordered list of sort keys (field names) |
| `--reverse` / `--no-reverse` | `boolean` | no | Reverse the sort order (default: false) |
| `--nulls-first` / `--no-nulls-first` | `boolean` | no | Place null sort values first instead of last (default: false) |
| `--count` / `--no-count` | `boolean` | no | Return only the count of matching tasks as { kind: 'count', count } |
| `--first` / `--no-first` | `boolean` | no | Return only the first matching task as { kind: 'single', item } |
| `--last` / `--no-last` | `boolean` | no | Return only the last matching task as { kind: 'single', item } |
| `--ids-only` / `--no-ids-only` | `boolean` | no | Return only the IDs of matching tasks as { kind: 'ids', ids } |
| `--group-by` | `string` | no | Group matching tasks by this field key |
| `--stats` / `--no-stats` | `boolean` | no | When grouping, include count statistics per group |
| `--limit` | `number` | no | Maximum number of results to return (default: 100) |
| `--offset` | `number` | no | Number of results to skip for pagination |
| `--all` / `--no-all` | `boolean` | no | When true, return every matching task ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `ofocus quick`

Quick-capture a task using natural-language entry syntax.

**Usage:**

```bash
ofocus quick <input> [--note <note>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--note` | `string` | no | Additional note text to add |

#### `ofocus search`

Search tasks by name or note content.

**Usage:**

```bash
ofocus search <query> [--scope <scope>] [--include-completed] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--scope` | `name \| note \| both` | no | Where to search (default: both) |
| `--include-completed` / `--no-include-completed` | `boolean` | no | Include completed tasks in the results |
| `--fields` | `unknown` | yes | Fields to include in each result item (comma- or space-separated, e.g. id,name,dueDate) |
| `--exclude-fields` | `unknown` | yes | Fields to exclude from the result items (comma- or space-separated) |
| `--sort` | `unknown` | yes | Sort keys (comma- or space-separated field names, e.g. dueDate,name) |
| `--reverse` / `--no-reverse` | `boolean` | no | Reverse the sort order (default: false) |
| `--limit` | `number` | no | Maximum results to return (default: 100) |
| `--offset` | `number` | no | Number of results to skip for pagination |
| `--all` / `--no-all` | `boolean` | no | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `ofocus update`

Update properties of an existing task.

**Usage:**

```bash
ofocus update <taskId> [--title <title>] [--note <note>] [--due <due>] [--defer <defer>] [--flag] [--project <project>] [--tags <val...>] [--estimated-minutes <estimatedMinutes>] [--clear-estimate] [--repeat <repeat>] [--clear-repeat]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--title` | `string` | no | New task title |
| `--note` | `string` | no | New task note |
| `--due` | `string` | no | New due date (ISO 8601 or relative; empty string to clear) |
| `--defer` | `string` | no | New defer date (ISO 8601 or relative; empty string to clear) |
| `--flag` / `--no-flag` | `boolean` | no | Flag (true) or unflag (false) the task |
| `--project` | `string` | no | Move to project by name (empty string to move to inbox) |
| `--tags` | `string[]` | no | Replace all tags with this list |
| `--estimated-minutes` | `number` | no | Estimated duration in minutes |
| `--clear-estimate` / `--no-clear-estimate` | `boolean` | no | Clear the estimated duration when true |
| `--repeat` | `unknown` | no | Set a repetition rule on the task. MCP: pass as an object. CLI: pass as a JSON string, e.g. --repeat '{"frequency":"weekly","interval":1,"repeatMethod":"due-again","daysOfWeek":[1,3,5]}' |
| `--clear-repeat` / `--no-clear-repeat` | `boolean` | no | Clear the repetition rule when true |

## Batch

#### `ofocus complete-batch`

Complete multiple tasks in a single operation.

**Usage:**

```bash
ofocus complete-batch <taskIds...>
```

#### `ofocus defer-batch`

Defer multiple tasks by a number of days or to a specific date.

**Usage:**

```bash
ofocus defer-batch <taskIds...> [--days <days>] [--to <to>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--days` | `number` | no | Defer by this many days from today |
| `--to` | `string` | no | Defer to a specific date (ISO 8601) |

#### `ofocus delete-batch`

Permanently delete multiple tasks in a single operation.

**Usage:**

```bash
ofocus delete-batch <taskIds...>
```

#### `ofocus update-batch`

Apply the same property changes to multiple tasks at once.

**Usage:**

```bash
ofocus update-batch <taskIds...> [--title <title>] [--note <note>] [--due <due>] [--defer <defer>] [--flag] [--project <project>] [--tags <val...>] [--estimated-minutes <estimatedMinutes>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--title` | `string` | no | New title for all tasks |
| `--note` | `string` | no | New note for all tasks |
| `--due` | `string` | no | New due date for all tasks |
| `--defer` | `string` | no | New defer date for all tasks |
| `--flag` / `--no-flag` | `boolean` | no | Flag or unflag all tasks |
| `--project` | `string` | no | Move all tasks to this project |
| `--tags` | `string[]` | no | Replace tags on all tasks |
| `--estimated-minutes` | `number` | no | Estimated duration in minutes for all tasks |

## Projects

#### `ofocus create-project`

Create a new project in OmniFocus

**Usage:**

```bash
ofocus create-project <name> [--note <note>] [--folder-id <folderId>] [--folder-name <folderName>] [--sequential] [--status <status>] [--due-date <dueDate>] [--defer-date <deferDate>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--note` | `string` | no | Project note/description |
| `--folder-id` | `string` | no | Parent folder ID |
| `--folder-name` | `string` | no | Parent folder name |
| `--sequential` / `--no-sequential` | `boolean` | no | Whether tasks are sequential (default: false) |
| `--status` | `active \| on-hold` | no | Initial project status (active, on-hold) |
| `--due-date` | `string` | no | Project due date |
| `--defer-date` | `string` | no | Project defer date |

#### `ofocus delete-project`

Permanently delete a project from OmniFocus

**Usage:**

```bash
ofocus delete-project <projectId>
```

#### `ofocus drop-project`

Drop a project in OmniFocus (marks as dropped but preserves history).

**Usage:**

```bash
ofocus drop-project <projectId>
```

#### `ofocus projects`

List and filter projects from OmniFocus

**Usage:**

```bash
ofocus projects [--folder <folder>] [--status <status>] [--sequential] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--folder` | `string` | no | Filter by folder name or ID |
| `--status` | `active \| on-hold \| completed \| dropped` | no | Filter by project status (active, on-hold, completed, dropped) |
| `--sequential` / `--no-sequential` | `boolean` | no | Filter by sequential/parallel type |
| `--fields` | `unknown` | yes | Fields to include in each result item (comma- or space-separated, e.g. id,name,dueDate) |
| `--exclude-fields` | `unknown` | yes | Fields to exclude from the result items (comma- or space-separated) |
| `--sort` | `unknown` | yes | Sort keys (comma- or space-separated field names, e.g. dueDate,name) |
| `--reverse` / `--no-reverse` | `boolean` | no | Reverse the sort order (default: false) |
| `--limit` | `number` | no | Maximum number of results to return |
| `--offset` | `number` | no | Number of results to skip for pagination |
| `--all` / `--no-all` | `boolean` | no | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `ofocus update-project`

Update properties of an existing project

**Usage:**

```bash
ofocus update-project <projectId> [--name <name>] [--note <note>] [--status <status>] [--folder-id <folderId>] [--folder-name <folderName>] [--sequential] [--due-date <dueDate>] [--defer-date <deferDate>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--name` | `string` | no | New project name |
| `--note` | `string` | no | New project note |
| `--status` | `active \| on-hold \| completed \| dropped` | no | New project status (active, on-hold, completed, dropped) |
| `--folder-id` | `string` | no | Move to folder by ID |
| `--folder-name` | `string` | no | Move to folder by name |
| `--sequential` / `--no-sequential` | `boolean` | no | Make project sequential (true) or parallel (false) |
| `--due-date` | `string` | no | New due date (empty string to clear) |
| `--defer-date` | `string` | no | New defer date (empty string to clear) |

## Folders

#### `ofocus create-folder`

Create a new folder in OmniFocus

**Usage:**

```bash
ofocus create-folder <name> [--parent-folder-id <parentFolderId>] [--parent-folder-name <parentFolderName>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--parent-folder-id` | `string` | no | Parent folder ID |
| `--parent-folder-name` | `string` | no | Parent folder name |

#### `ofocus delete-folder`

Permanently delete a folder from OmniFocus

**Usage:**

```bash
ofocus delete-folder <folderId>
```

#### `ofocus folders`

List folders from OmniFocus

**Usage:**

```bash
ofocus folders [--parent <parent>] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--parent` | `string` | no | Filter by parent folder name or ID |
| `--fields` | `unknown` | yes | Fields to include in each result item (comma- or space-separated, e.g. id,name,dueDate) |
| `--exclude-fields` | `unknown` | yes | Fields to exclude from the result items (comma- or space-separated) |
| `--sort` | `unknown` | yes | Sort keys (comma- or space-separated field names, e.g. dueDate,name) |
| `--reverse` / `--no-reverse` | `boolean` | no | Reverse the sort order (default: false) |
| `--limit` | `number` | no | Maximum number of results to return |
| `--offset` | `number` | no | Number of results to skip for pagination |
| `--all` / `--no-all` | `boolean` | no | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `ofocus update-folder`

Update properties of an existing folder

**Usage:**

```bash
ofocus update-folder <folderId> [--name <name>] [--parent-folder-id <parentFolderId>] [--parent-folder-name <parentFolderName>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--name` | `string` | no | New folder name |
| `--parent-folder-id` | `string` | no | Move to parent folder by ID |
| `--parent-folder-name` | `string` | no | Move to parent folder by name |

## Tags

#### `ofocus create-tag`

Create a new tag in OmniFocus

**Usage:**

```bash
ofocus create-tag <name> [--parent-tag-id <parentTagId>] [--parent-tag-name <parentTagName>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--parent-tag-id` | `string` | no | Parent tag ID |
| `--parent-tag-name` | `string` | no | Parent tag name |

#### `ofocus delete-tag`

Delete a tag from OmniFocus

**Usage:**

```bash
ofocus delete-tag <tagId>
```

#### `ofocus tags`

List tags from OmniFocus

**Usage:**

```bash
ofocus tags [--parent <parent>] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--parent` | `string` | no | Filter by parent tag name or ID |
| `--fields` | `unknown` | yes | Fields to include in each result item (comma- or space-separated, e.g. id,name,dueDate) |
| `--exclude-fields` | `unknown` | yes | Fields to exclude from the result items (comma- or space-separated) |
| `--sort` | `unknown` | yes | Sort keys (comma- or space-separated field names, e.g. dueDate,name) |
| `--reverse` / `--no-reverse` | `boolean` | no | Reverse the sort order (default: false) |
| `--limit` | `number` | no | Maximum number of results to return |
| `--offset` | `number` | no | Number of results to skip for pagination |
| `--all` / `--no-all` | `boolean` | no | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `ofocus update-tag`

Update an existing tag in OmniFocus

**Usage:**

```bash
ofocus update-tag <tagId> [--name <name>] [--parent-tag-id <parentTagId>] [--parent-tag-name <parentTagName>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--name` | `string` | no | New tag name |
| `--parent-tag-id` | `string` | no | New parent tag ID |
| `--parent-tag-name` | `string` | no | New parent tag name |

## Forecast

#### `ofocus forecast`

Query tasks due within N days (like the OmniFocus Forecast view).

**Usage:**

```bash
ofocus forecast [--days <days>] [--include-deferred] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--days` | `number` | no | Number of days ahead to include (default: 7) |
| `--include-deferred` / `--no-include-deferred` | `boolean` | no | Include tasks deferred to the same window |
| `--fields` | `unknown` | yes | Fields to include in each result item (comma- or space-separated, e.g. id,name,dueDate) |
| `--exclude-fields` | `unknown` | yes | Fields to exclude from the result items (comma- or space-separated) |
| `--sort` | `unknown` | yes | Sort keys (comma- or space-separated field names, e.g. dueDate,name) |
| `--reverse` / `--no-reverse` | `boolean` | no | Reverse the sort order (default: false) |
| `--limit` | `number` | no | Maximum number of results to return (default: 100) |
| `--offset` | `number` | no | Number of results to skip for pagination |
| `--all` / `--no-all` | `boolean` | no | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

## Focus

#### `ofocus focus`

Focus on a specific project or folder by name or ID

**Usage:**

```bash
ofocus focus <target> [--by-id]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--by-id` / `--no-by-id` | `boolean` | no | If true, interpret target as an ID instead of a name |

#### `ofocus focused`

Get the currently focused project or folder

**Usage:**

```bash
ofocus focused
```

#### `ofocus unfocus`

Clear the current focus in OmniFocus

**Usage:**

```bash
ofocus unfocus
```

## Review

#### `ofocus review`

Mark a project as reviewed in OmniFocus

**Usage:**

```bash
ofocus review <projectId>
```

## Templates

#### `ofocus template-create`

Create a new project from a saved template

**Usage:**

```bash
ofocus template-create <templateName> [--project-name <projectName>] [--folder <folder>] [--base-date <baseDate>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--project-name` | `string` | no | Name for the new project (defaults to template name) |
| `--folder` | `string` | no | Folder to create the project in |
| `--base-date` | `string` | no | Base date for calculating date offsets (defaults to today) |

#### `ofocus template-get`

Get details of a specific project template

**Usage:**

```bash
ofocus template-get <templateName>
```

#### `ofocus template-save`

Save a project as a reusable template

**Usage:**

```bash
ofocus template-save <name> <sourceProject> [--description <description>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--description` | `string` | no | Template description |

## Attachments

#### `ofocus attach`

Add a file attachment to a task

**Usage:**

```bash
ofocus attach <taskId> <filePath>
```

#### `ofocus detach`

Remove an attachment from a task

**Usage:**

```bash
ofocus detach <taskId> <attachmentName>
```

## Sync

#### `ofocus sync-status`

Get the current sync status of OmniFocus

**Usage:**

```bash
ofocus sync-status
```

#### `ofocus sync`

Trigger a sync in OmniFocus

**Usage:**

```bash
ofocus sync
```

## TaskPaper

#### `ofocus export`

Export tasks and projects to TaskPaper format

**Usage:**

```bash
ofocus export [--project <project>] [--include-completed] [--include-dropped]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--project` | `string` | no | Export only a specific project by name |
| `--include-completed` / `--no-include-completed` | `boolean` | no | Include completed tasks in the export |
| `--include-dropped` / `--no-include-dropped` | `boolean` | no | Include dropped tasks in the export |

#### `ofocus import-taskpaper`

Import tasks from TaskPaper formatted content

**Usage:**

```bash
ofocus import-taskpaper --content <content> [--default-project <defaultProject>] [--create-projects]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--content` | `string` | yes | TaskPaper formatted content to import |
| `--default-project` | `string` | no | Target project for tasks without a project |
| `--create-projects` / `--no-create-projects` | `boolean` | no | Create projects that do not exist |

## Utilities

#### `ofocus archive`

Archive completed or dropped tasks and projects

**Usage:**

```bash
ofocus archive [--completed-before <completedBefore>] [--dropped-before <droppedBefore>] [--project <project>] [--dry-run]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--completed-before` | `string` | no | Archive tasks completed before this date (ISO 8601) |
| `--dropped-before` | `string` | no | Archive tasks dropped before this date (ISO 8601) |
| `--project` | `string` | no | Archive only tasks from this project |
| `--dry-run` / `--no-dry-run` | `boolean` | no | Preview what would be archived without archiving |

#### `ofocus compact`

Compact the OmniFocus database

**Usage:**

```bash
ofocus compact
```

#### `ofocus url`

Generate an OmniFocus URL scheme deep link for a task, project, folder, or tag

**Usage:**

```bash
ofocus url <id>
```

#### `ofocus stats`

Get productivity statistics from OmniFocus.

**Usage:**

```bash
ofocus stats [--project <project>] [--period <period>] [--since <since>] [--until <until>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--project` | `string` | no | Filter statistics by project name |
| `--period` | `day \| week \| month \| year` | no | Predefined time period for statistics (day, week, month, year) |
| `--since` | `string` | no | Custom period start date (ISO 8601 format) |
| `--until` | `string` | no | Custom period end date (ISO 8601 format) |

#### `ofocus open`

Open an item in the OmniFocus user interface (task, project, folder, or tag)

**Usage:**

```bash
ofocus open <id>
```

## Productivity

#### `ofocus changes`

Detect what changed in OmniFocus since the last look. Cache-first and instant by default; --fresh forces a live scan; --pending returns accumulated deltas for a notification hook.

**Usage:**

```bash
ofocus changes [--watch <watch>] [--fresh] [--pending] [--generation-since <generationSince>] [--reset] [--refresh-inline] [--semantic]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--watch` | `string` | no | Named watch (default: 'default') |
| `--fresh` / `--no-fresh` | `boolean` | no | Force a synchronous live scan |
| `--pending` / `--no-pending` | `boolean` | no | Return accumulated pending deltas (notification-hook path) |
| `--generation-since` | `number` | no | With --pending: only deltas newer than this generation |
| `--reset` / `--no-reset` | `boolean` | no | Re-baseline the watch to current state |
| `--refresh-inline` / `--no-refresh-inline` | `boolean` | no | Internal: run the background scan + pending accumulation inline |
| `--semantic` / `--no-semantic` | `boolean` | no | Attach a fast-model natural-language summary (opt-in; uses OFOCUS_SUMMARY_CMD) |

## Other

#### `ofocus apply-repetition`

Apply a repetition rule to an existing task. Supports daily, weekly (with BYDAY), monthly (by day-of-month or Nth-weekday), and yearly (with BYMONTH) recurrences.

**Usage:**

```bash
ofocus apply-repetition <taskId> --frequency <frequency> --interval <interval> --repeat-method <repeatMethod> [--days-of-week <val...>] [--day-of-month <dayOfMonth>] [--days-of-week-positions <val...>] [--months-of-year <val...>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--frequency` | `daily \| weekly \| monthly \| yearly` | yes | Repeat frequency |
| `--interval` | `number` | yes | Repeat every N periods (default: 1) |
| `--repeat-method` | `due-again \| defer-another \| scheduled` | yes | How to reschedule: due-again (from completion), defer-another (from defer date), scheduled (fixed cadence) |
| `--days-of-week` | `number[]` | no | Days of week (0=Sunday, 6=Saturday) |
| `--day-of-month` | `number` | no | Day of month (1-31) for monthly recurrences |
| `--days-of-week-positions` | `number[]` | no | Positional prefixes for Nth-weekday monthly rules, e.g. [1,-1] for first and last. Values in [-5,-1]∪[1,5]. |
| `--months-of-year` | `number[]` | no | Months of year (1=January, 12=December) for yearly recurrences |

#### `ofocus clear-repetition`

Clear the repetition rule from an existing task.

**Usage:**

```bash
ofocus clear-repetition <taskId>
```

#### `ofocus eval`

Evaluate arbitrary OmniJS against the user's OmniFocus database. Last-resort tool.

Before using this tool, prefer the declarative commands (tasks, projects, folders, tags, forecast, search, deferred, etc.) with --filter, --sort, --fields, --group-by, --count — they cover the vast majority of queries with no scripting required.

If eval is genuinely necessary, narrate the intent in plain language first, then show the script — the user should be able to read the explanation and verify it matches the code before running it.

The script runs unsandboxed in the user's OmniFocus and can mutate any task, project, folder, tag, or perspective. Treat this like running shell code on the user's machine.

Scripts must end with a return <expression>; statement and are capped at 64 KB. The return value must be JSON-serializable. Errors from OmniJS are surfaced verbatim.

**Usage:**

```bash
ofocus eval [script] [--file <file>] [--args <args>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--file` | `string` | no | Path to a file containing OmniJS source. Read at execution time. Mutually exclusive with --script. CLI: --file <path> |
| `--args` | `unknown` | no | Arguments injected into the script as a global `args` constant (deserialized from JSON). Use this instead of string-interpolating values into the script body — args go through JSON.stringify and avoid escaping issues. |

#### `ofocus review-interval-get`

Get the review interval for a project in days

**Usage:**

```bash
ofocus review-interval-get <projectId>
```

#### `ofocus review-interval-set`

Set the review interval for a project in days

**Usage:**

```bash
ofocus review-interval-set <projectId> --interval-days <intervalDays>
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--interval-days` | `number` | yes | Review interval in days |

#### `ofocus next-occurrences`

Read a task's repetition rule and project its next occurrence dates. Schedule-anchored repeats (Fixed/DueDate) are predictable; completion-anchored repeats (Start) are projected and may shift.

**Usage:**

```bash
ofocus next-occurrences <taskId> [--count <count>] [--from <from>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--count` | `number` | no | How many future occurrences (default 5) |
| `--from` | `string` | no | ISO date; only occurrences after this are returned (default now) |

#### `ofocus occurrences`

Project every incomplete repeating task forward over a window and list the upcoming occurrences, ascending by date.

**Usage:**

```bash
ofocus occurrences [--days <days>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--days` | `number` | no | Window length in days (default 14) |

#### `ofocus resolve`

Resolve a fuzzy reference to an OmniFocus entity. Returns a confidently resolved match, a tight ranked candidate set (ambiguous), or none. --kind temporal-anchor matches a repeating task and returns its next occurrence.

**Usage:**

```bash
ofocus resolve <query> [--kind <kind>] [--limit <limit>]
```

**Flags:**

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--kind` | `project \| task \| tag \| folder \| temporal-anchor \| any` | no | What to resolve (default: project; 'any' = project + task) |
| `--limit` | `number` | no | Max candidates (default 5) |

#### `ofocus this-week`

Digest of tasks due over the next seven days, grouped by calendar day and annotated with how soon each is due.

**Usage:**

```bash
ofocus this-week
```

#### `ofocus today`

Digest of what needs attention today: overdue, due today, and flagged tasks, each annotated with how overdue or how soon it is.

**Usage:**

```bash
ofocus today
```


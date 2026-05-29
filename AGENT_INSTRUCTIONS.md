# OmniFocus MCP Tools — Agent Reference

<!-- generated: DO NOT EDIT BY HAND — see scripts/generate-agent-docs.ts -->

This document is the authoritative reference for all OmniFocus MCP tools available to agents.
All tool names use `snake_case`. Parameters are passed as JSON objects.

## Output Envelope

Every tool returns an MCP `CallToolResult`. The payload is JSON-encoded in `content[0].text`.
On success, `content[0].text` contains the result JSON:

```json
{ "content": [{ "type": "text", "text": "<result-json>" }] }
```

On failure, `isError` is `true` and `content[0].text` contains the error details:

```json
{ "content": [{ "type": "text", "text": "<error-json>" }], "isError": true }
```

The result JSON uses TOON format (token-efficient) by default for descriptor-backed tools. Pass `--format json` on the CLI (or set `format: "json"` as a parameter) to get standard JSON.

## Tasks

#### `inbox_add`

Add a new task to the OmniFocus inbox.

| Parameter        | Type                                   | Required | Description                                             |
| ---------------- | -------------------------------------- | -------- | ------------------------------------------------------- |
| title            | `string`                               | yes      | Task title                                              |
| note             | `string`                               | no       | Task note / description                                 |
| due              | `string`                               | no       | Due date (ISO 8601 or natural language like 'tomorrow') |
| defer            | `string`                               | no       | Defer date (ISO 8601 or natural language)               |
| flag             | `boolean`                              | no       | Mark the task as flagged                                |
| tags             | `string[]`                             | no       | Tag names to apply                                      |
| estimatedMinutes | `number`                               | no       | Estimated duration in minutes                           |
| repeatFrequency  | `daily \| weekly \| monthly \| yearly` | no       | Repetition frequency                                    |
| repeatInterval   | `number`                               | no       | Repeat every N periods (default: 1)                     |
| repeatMethod     | `due-again \| defer-another`           | no       | Anchor for the next occurrence (default: due-again)     |
| repeatDaysOfWeek | `number[]`                             | no       | Days of week for weekly repeats (0=Sunday … 6=Saturday) |
| repeatDayOfMonth | `number`                               | no       | Day of month for monthly repeats                        |

**Example:** `{ "title": "<title>" }`

#### `task_complete`

Mark a task as complete in OmniFocus.

| Parameter | Type     | Required | Description                    |
| --------- | -------- | -------- | ------------------------------ |
| taskId    | `string` | yes      | The ID of the task to complete |

**Example:** `{ "taskId": "<taskId>" }`

#### `subtask_create`

Create a subtask under an existing parent task.

| Parameter        | Type       | Required | Description                   |
| ---------------- | ---------- | -------- | ----------------------------- |
| title            | `string`   | yes      | Subtask title                 |
| parentTaskId     | `string`   | yes      | ID of the parent task         |
| note             | `string`   | no       | Subtask note                  |
| due              | `string`   | no       | Due date                      |
| defer            | `string`   | no       | Defer date                    |
| flag             | `boolean`  | no       | Flag the subtask              |
| tags             | `string[]` | no       | Tags to apply                 |
| estimatedMinutes | `number`   | no       | Estimated duration in minutes |

**Example:** `{ "title": "<title>", "parentTaskId": "<parentTaskId>" }`

#### `task_defer`

Defer a task by a number of days or to a specific date.

| Parameter | Type     | Required | Description                         |
| --------- | -------- | -------- | ----------------------------------- |
| taskId    | `string` | yes      | ID of the task to defer             |
| days      | `number` | no       | Defer by this many days from today  |
| to        | `string` | no       | Defer to a specific date (ISO 8601) |

**Example:** `{ "taskId": "<taskId>" }`

#### `task_delete`

Permanently delete a task from OmniFocus. Cannot be undone.

| Parameter | Type     | Required | Description                  |
| --------- | -------- | -------- | ---------------------------- |
| taskId    | `string` | yes      | The ID of the task to delete |

**Example:** `{ "taskId": "<taskId>" }`

#### `template_delete`

Delete a saved project template

| Parameter    | Type     | Required | Description                    |
| ------------ | -------- | -------- | ------------------------------ |
| templateName | `string` | yes      | Name of the template to delete |

**Example:** `{ "templateName": "<templateName>" }`

#### `task_drop`

Drop a task (marks it as dropped but preserves history).

| Parameter | Type     | Required | Description                |
| --------- | -------- | -------- | -------------------------- |
| taskId    | `string` | yes      | The ID of the task to drop |

**Example:** `{ "taskId": "<taskId>" }`

#### `task_duplicate`

Duplicate an existing task, optionally including its subtasks.

| Parameter       | Type      | Required | Description                                       |
| --------------- | --------- | -------- | ------------------------------------------------- |
| taskId          | `string`  | yes      | The ID of the task to duplicate                   |
| includeSubtasks | `boolean` | no       | Include subtasks in the duplicate (default: true) |

**Example:** `{ "taskId": "<taskId>" }`

#### `attachments_list`

List attachments on a task

| Parameter | Type     | Required | Description                            |
| --------- | -------- | -------- | -------------------------------------- |
| taskId    | `string` | yes      | ID of the task to list attachments for |

**Example:** `{ "taskId": "<taskId>" }`

#### `perspectives_list`

List all perspectives in OmniFocus

_No parameters._

#### `templates_list`

List all saved project templates

_No parameters._

#### `task_move`

Move a task to become a subtask of another task.

| Parameter    | Type     | Required | Description               |
| ------------ | -------- | -------- | ------------------------- |
| taskId       | `string` | yes      | ID of the task to move    |
| parentTaskId | `string` | yes      | ID of the new parent task |

**Example:** `{ "taskId": "<taskId>", "parentTaskId": "<parentTaskId>" }`

#### `deferred_list`

List tasks with defer dates.

| Parameter      | Type      | Required | Description                                                                                                    |
| -------------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| deferredAfter  | `string`  | no       | Only tasks deferred after this date                                                                            |
| deferredBefore | `string`  | no       | Only tasks deferred before this date                                                                           |
| blockedOnly    | `boolean` | no       | Only show tasks currently blocked by their defer date                                                          |
| limit          | `number`  | no       | Maximum number of results to return (default: 100)                                                             |
| offset         | `number`  | no       | Number of results to skip for pagination                                                                       |
| all            | `boolean` | no       | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `perspective_query`

Query tasks from a specific perspective

| Parameter | Type     | Required | Description                         |
| --------- | -------- | -------- | ----------------------------------- |
| name      | `string` | yes      | Perspective name                    |
| limit     | `number` | no       | Maximum number of results to return |

**Example:** `{ "name": "<name>" }`

#### `projects_for_review`

List projects that are due for review

_No parameters._

#### `subtasks_list`

List subtasks of a parent task.

| Parameter    | Type      | Required | Description                                                                                                    |
| ------------ | --------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| parentTaskId | `string`  | yes      | ID of the parent task                                                                                          |
| completed    | `boolean` | no       | Filter by completion status (true = only completed, false = only incomplete)                                   |
| flagged      | `boolean` | no       | Filter by flagged status                                                                                       |
| limit        | `number`  | no       | Maximum number of results to return (default: 100)                                                             |
| offset       | `number`  | no       | Number of results to skip for pagination                                                                       |
| all          | `boolean` | no       | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

**Example:** `{ "parentTaskId": "<parentTaskId>" }`

#### `tasks_list`

List and filter tasks from OmniFocus.

| Parameter            | Type                                         | Required | Description                                                                                                    |
| -------------------- | -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| project              | `string \| string[]`                         | no       | Filter by project name (single value or array)                                                                 |
| tag                  | `string \| string[]`                         | no       | Filter by tag name (single value or array)                                                                     |
| tagMode              | `any \| all \| none`                         | no       | Tag-matching mode when multiple tags are given (default: all)                                                  |
| folder               | `string \| string[]`                         | no       | Filter by folder name (transitive; single value or array)                                                      |
| flagged              | `boolean`                                    | no       | Filter by flagged status                                                                                       |
| notFlagged           | `boolean`                                    | no       | Exclude flagged tasks when true                                                                                |
| completed            | `boolean`                                    | no       | Include completed tasks when true                                                                              |
| notCompleted         | `boolean`                                    | no       | Exclude completed tasks when true                                                                              |
| dropped              | `boolean`                                    | no       | Include dropped tasks when true                                                                                |
| notDropped           | `boolean`                                    | no       | Exclude dropped tasks when true                                                                                |
| blocked              | `boolean`                                    | no       | Include only blocked tasks when true                                                                           |
| available            | `boolean`                                    | no       | Only show available (actionable) tasks                                                                         |
| inInbox              | `boolean`                                    | no       | Include only inbox tasks when true                                                                             |
| hasDue               | `boolean`                                    | no       | Include only tasks that have a due date                                                                        |
| noDue                | `boolean`                                    | no       | Include only tasks with no due date                                                                            |
| hasDefer             | `boolean`                                    | no       | Include only tasks that have a defer date                                                                      |
| hasNote              | `boolean`                                    | no       | Include only tasks that have a non-empty note                                                                  |
| hasAttachments       | `boolean`                                    | no       | Include only tasks with attachments                                                                            |
| hasSubtasks          | `boolean`                                    | no       | Include only tasks that have child subtasks                                                                    |
| hasRepetition        | `boolean`                                    | no       | Include only tasks with a repetition rule                                                                      |
| effectivelyCompleted | `boolean`                                    | no       | Include only effectively-completed tasks                                                                       |
| effectivelyDropped   | `boolean`                                    | no       | Include only effectively-dropped tasks                                                                         |
| status               | `active \| completed \| dropped \| deferred` | no       | Filter by high-level task status (active, completed, dropped, deferred)                                        |
| dueBefore            | `string`                                     | no       | Filter tasks due before this date (ISO 8601 or relative)                                                       |
| dueAfter             | `string`                                     | no       | Filter tasks due after this date (ISO 8601 or relative)                                                        |
| dueOn                | `string`                                     | no       | Match tasks whose due date falls on this calendar day (UTC)                                                    |
| dueWithin            | `string`                                     | no       | Duration string like '7d'/'1w' — due date must be within now + duration                                        |
| deferBefore          | `string`                                     | no       | Filter tasks with defer date before this date                                                                  |
| deferAfter           | `string`                                     | no       | Filter tasks with defer date after this date                                                                   |
| deferOn              | `string`                                     | no       | Match tasks whose defer date falls on this calendar day (UTC)                                                  |
| deferWithin          | `string`                                     | no       | Duration string — defer date must be within now + duration                                                     |
| completedBefore      | `string`                                     | no       | Filter tasks completed before this date                                                                        |
| completedAfter       | `string`                                     | no       | Filter tasks completed after this date                                                                         |
| estimateLt           | `number`                                     | no       | Estimated minutes less than this value                                                                         |
| estimateGt           | `number`                                     | no       | Estimated minutes greater than this value                                                                      |
| estimateEq           | `number`                                     | no       | Estimated minutes equal to this value                                                                          |
| nameContains         | `string`                                     | no       | Task name contains this substring                                                                              |
| nameStarts           | `string`                                     | no       | Task name starts with this string                                                                              |
| nameEquals           | `string`                                     | no       | Task name equals this string                                                                                   |
| nameRegex            | `string`                                     | no       | Task name matches this regular expression                                                                      |
| noteContains         | `string`                                     | no       | Task note contains this substring                                                                              |
| noteRegex            | `string`                                     | no       | Task note matches this regular expression                                                                      |
| caseSensitive        | `boolean`                                    | no       | Case sensitivity for name/note string predicates (default: false)                                              |
| fields               | `string[]`                                   | no       | Whitelist of fields to include in each result item                                                             |
| excludeFields        | `string[]`                                   | no       | Fields to exclude from each result item                                                                        |
| sort                 | `string[]`                                   | no       | Ordered list of sort keys (field names)                                                                        |
| reverse              | `boolean`                                    | no       | Reverse the sort order (default: false)                                                                        |
| nullsFirst           | `boolean`                                    | no       | Place null sort values first instead of last (default: false)                                                  |
| count                | `boolean`                                    | no       | Return only the count of matching tasks as { kind: 'count', count }                                            |
| first                | `boolean`                                    | no       | Return only the first matching task as { kind: 'single', item }                                                |
| last                 | `boolean`                                    | no       | Return only the last matching task as { kind: 'single', item }                                                 |
| idsOnly              | `boolean`                                    | no       | Return only the IDs of matching tasks as { kind: 'ids', ids }                                                  |
| groupBy              | `string`                                     | no       | Group matching tasks by this field key                                                                         |
| stats                | `boolean`                                    | no       | When grouping, include count statistics per group                                                              |
| limit                | `number`                                     | no       | Maximum number of results to return (default: 100)                                                             |
| offset               | `number`                                     | no       | Number of results to skip for pagination                                                                       |
| all                  | `boolean`                                    | no       | When true, return every matching task ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `quick_add`

Quick-capture a task using natural-language entry syntax.

| Parameter | Type     | Required | Description                                                               |
| --------- | -------- | -------- | ------------------------------------------------------------------------- |
| input     | `string` | yes      | Natural language input (e.g., 'Buy milk @errands #shopping due:tomorrow') |
| note      | `string` | no       | Additional note text to add                                               |

**Example:** `{ "input": "<input>" }`

#### `search`

Search tasks by name or note content.

| Parameter        | Type                   | Required | Description                                                                                                    |
| ---------------- | ---------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| query            | `string`               | yes      | Search query text                                                                                              |
| scope            | `name \| note \| both` | no       | Where to search (default: both)                                                                                |
| limit            | `number`               | no       | Maximum results to return (default: 100)                                                                       |
| includeCompleted | `boolean`              | no       | Include completed tasks in the results                                                                         |
| offset           | `number`               | no       | Number of results to skip for pagination                                                                       |
| all              | `boolean`              | no       | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

**Example:** `{ "query": "<query>" }`

#### `task_update`

Update properties of an existing task.

| Parameter        | Type       | Required | Description                                                                                                                                                                                |
| ---------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| taskId           | `string`   | yes      | The ID of the task to update                                                                                                                                                               |
| title            | `string`   | no       | New task title                                                                                                                                                                             |
| note             | `string`   | no       | New task note                                                                                                                                                                              |
| due              | `string`   | no       | New due date (ISO 8601 or relative; empty string to clear)                                                                                                                                 |
| defer            | `string`   | no       | New defer date (ISO 8601 or relative; empty string to clear)                                                                                                                               |
| flag             | `boolean`  | no       | Flag (true) or unflag (false) the task                                                                                                                                                     |
| project          | `string`   | no       | Move to project by name (empty string to move to inbox)                                                                                                                                    |
| tags             | `string[]` | no       | Replace all tags with this list                                                                                                                                                            |
| estimatedMinutes | `number`   | no       | Estimated duration in minutes                                                                                                                                                              |
| clearEstimate    | `boolean`  | no       | Clear the estimated duration when true                                                                                                                                                     |
| repeat           | `unknown`  | no       | Set a repetition rule on the task. MCP: pass as an object. CLI: pass as a JSON string, e.g. --repeat '{"frequency":"weekly","interval":1,"repeatMethod":"due-again","daysOfWeek":[1,3,5]}' |
| clearRepeat      | `boolean`  | no       | Clear the repetition rule when true                                                                                                                                                        |

**Example:** `{ "taskId": "<taskId>" }`

## Batch

#### `tasks_complete_batch`

Complete multiple tasks in a single operation.

| Parameter | Type       | Required | Description            |
| --------- | ---------- | -------- | ---------------------- |
| taskIds   | `string[]` | yes      | Task IDs to operate on |

**Example:** `{ "taskIds": ["<value>"] }`

#### `tasks_defer_batch`

Defer multiple tasks by a number of days or to a specific date.

| Parameter | Type       | Required | Description                         |
| --------- | ---------- | -------- | ----------------------------------- |
| taskIds   | `string[]` | yes      | Task IDs to defer                   |
| days      | `number`   | no       | Defer by this many days from today  |
| to        | `string`   | no       | Defer to a specific date (ISO 8601) |

**Example:** `{ "taskIds": ["<value>"] }`

#### `tasks_delete_batch`

Permanently delete multiple tasks in a single operation.

| Parameter | Type       | Required | Description            |
| --------- | ---------- | -------- | ---------------------- |
| taskIds   | `string[]` | yes      | Task IDs to operate on |

**Example:** `{ "taskIds": ["<value>"] }`

#### `tasks_update_batch`

Apply the same property changes to multiple tasks at once.

| Parameter        | Type       | Required | Description                                 |
| ---------------- | ---------- | -------- | ------------------------------------------- |
| taskIds          | `string[]` | yes      | Task IDs to operate on                      |
| title            | `string`   | no       | New title for all tasks                     |
| note             | `string`   | no       | New note for all tasks                      |
| due              | `string`   | no       | New due date for all tasks                  |
| defer            | `string`   | no       | New defer date for all tasks                |
| flag             | `boolean`  | no       | Flag or unflag all tasks                    |
| project          | `string`   | no       | Move all tasks to this project              |
| tags             | `string[]` | no       | Replace tags on all tasks                   |
| estimatedMinutes | `number`   | no       | Estimated duration in minutes for all tasks |

**Example:** `{ "taskIds": ["<value>"] }`

## Projects

#### `project_create`

Create a new project in OmniFocus

| Parameter  | Type                | Required | Description                                   |
| ---------- | ------------------- | -------- | --------------------------------------------- |
| name       | `string`            | yes      | Project name                                  |
| note       | `string`            | no       | Project note/description                      |
| folderId   | `string`            | no       | Parent folder ID                              |
| folderName | `string`            | no       | Parent folder name                            |
| sequential | `boolean`           | no       | Whether tasks are sequential (default: false) |
| status     | `active \| on-hold` | no       | Initial project status (active, on-hold)      |
| dueDate    | `string`            | no       | Project due date                              |
| deferDate  | `string`            | no       | Project defer date                            |

**Example:** `{ "name": "<name>" }`

#### `project_delete`

Permanently delete a project from OmniFocus

| Parameter | Type     | Required | Description                     |
| --------- | -------- | -------- | ------------------------------- |
| projectId | `string` | yes      | The ID of the project to delete |

**Example:** `{ "projectId": "<projectId>" }`

#### `project_drop`

Drop a project in OmniFocus (marks as dropped but preserves history).

| Parameter | Type     | Required | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| projectId | `string` | yes      | The ID of the project to drop |

**Example:** `{ "projectId": "<projectId>" }`

#### `projects_list`

List and filter projects from OmniFocus

| Parameter  | Type                                        | Required | Description                                                                                                    |
| ---------- | ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| folder     | `string`                                    | no       | Filter by folder name or ID                                                                                    |
| status     | `active \| on-hold \| completed \| dropped` | no       | Filter by project status (active, on-hold, completed, dropped)                                                 |
| sequential | `boolean`                                   | no       | Filter by sequential/parallel type                                                                             |
| limit      | `number`                                    | no       | Maximum number of results to return                                                                            |
| offset     | `number`                                    | no       | Number of results to skip for pagination                                                                       |
| all        | `boolean`                                   | no       | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `project_update`

Update properties of an existing project

| Parameter  | Type                                        | Required | Description                                              |
| ---------- | ------------------------------------------- | -------- | -------------------------------------------------------- |
| projectId  | `string`                                    | yes      | The ID of the project to update                          |
| name       | `string`                                    | no       | New project name                                         |
| note       | `string`                                    | no       | New project note                                         |
| status     | `active \| on-hold \| completed \| dropped` | no       | New project status (active, on-hold, completed, dropped) |
| folderId   | `string`                                    | no       | Move to folder by ID                                     |
| folderName | `string`                                    | no       | Move to folder by name                                   |
| sequential | `boolean`                                   | no       | Make project sequential (true) or parallel (false)       |
| dueDate    | `string`                                    | no       | New due date (empty string to clear)                     |
| deferDate  | `string`                                    | no       | New defer date (empty string to clear)                   |

**Example:** `{ "projectId": "<projectId>" }`

## Folders

#### `folder_create`

Create a new folder in OmniFocus

| Parameter        | Type     | Required | Description        |
| ---------------- | -------- | -------- | ------------------ |
| name             | `string` | yes      | Folder name        |
| parentFolderId   | `string` | no       | Parent folder ID   |
| parentFolderName | `string` | no       | Parent folder name |

**Example:** `{ "name": "<name>" }`

#### `folder_delete`

Permanently delete a folder from OmniFocus

| Parameter | Type     | Required | Description                    |
| --------- | -------- | -------- | ------------------------------ |
| folderId  | `string` | yes      | The ID of the folder to delete |

**Example:** `{ "folderId": "<folderId>" }`

#### `folders_list`

List folders from OmniFocus

| Parameter | Type      | Required | Description                                                                                                    |
| --------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| parent    | `string`  | no       | Filter by parent folder name or ID                                                                             |
| limit     | `number`  | no       | Maximum number of results to return                                                                            |
| offset    | `number`  | no       | Number of results to skip for pagination                                                                       |
| all       | `boolean` | no       | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `folder_update`

Update properties of an existing folder

| Parameter        | Type     | Required | Description                    |
| ---------------- | -------- | -------- | ------------------------------ |
| folderId         | `string` | yes      | The ID of the folder to update |
| name             | `string` | no       | New folder name                |
| parentFolderId   | `string` | no       | Move to parent folder by ID    |
| parentFolderName | `string` | no       | Move to parent folder by name  |

**Example:** `{ "folderId": "<folderId>" }`

## Tags

#### `tag_create`

Create a new tag in OmniFocus

| Parameter     | Type     | Required | Description     |
| ------------- | -------- | -------- | --------------- |
| name          | `string` | yes      | Tag name        |
| parentTagId   | `string` | no       | Parent tag ID   |
| parentTagName | `string` | no       | Parent tag name |

**Example:** `{ "name": "<name>" }`

#### `tag_delete`

Delete a tag from OmniFocus

| Parameter | Type     | Required | Description                 |
| --------- | -------- | -------- | --------------------------- |
| tagId     | `string` | yes      | The ID of the tag to delete |

**Example:** `{ "tagId": "<tagId>" }`

#### `tags_list`

List tags from OmniFocus

| Parameter | Type      | Required | Description                                                                                                    |
| --------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| parent    | `string`  | no       | Filter by parent tag name or ID                                                                                |
| limit     | `number`  | no       | Maximum number of results to return                                                                            |
| offset    | `number`  | no       | Number of results to skip for pagination                                                                       |
| all       | `boolean` | no       | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

#### `tag_update`

Update an existing tag in OmniFocus

| Parameter     | Type     | Required | Description                 |
| ------------- | -------- | -------- | --------------------------- |
| tagId         | `string` | yes      | The ID of the tag to update |
| name          | `string` | no       | New tag name                |
| parentTagId   | `string` | no       | New parent tag ID           |
| parentTagName | `string` | no       | New parent tag name         |

**Example:** `{ "tagId": "<tagId>" }`

## Forecast

#### `forecast`

Query tasks due within N days (like the OmniFocus Forecast view).

| Parameter       | Type      | Required | Description                                                                                                    |
| --------------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| days            | `number`  | no       | Number of days ahead to include (default: 7)                                                                   |
| includeDeferred | `boolean` | no       | Include tasks deferred to the same window                                                                      |
| limit           | `number`  | no       | Maximum number of results to return (default: 100)                                                             |
| offset          | `number`  | no       | Number of results to skip for pagination                                                                       |
| all             | `boolean` | no       | When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset. |

## Focus

#### `focus_set`

Focus on a specific project or folder by name or ID

| Parameter | Type      | Required | Description                                          |
| --------- | --------- | -------- | ---------------------------------------------------- |
| target    | `string`  | yes      | Project or folder name (or ID with --by-id)          |
| byId      | `boolean` | no       | If true, interpret target as an ID instead of a name |

**Example:** `{ "target": "<target>" }`

#### `focus_get`

Get the currently focused project or folder

_No parameters._

#### `focus_clear`

Clear the current focus in OmniFocus

_No parameters._

## Review

#### `project_review`

Mark a project as reviewed in OmniFocus

| Parameter | Type     | Required | Description                    |
| --------- | -------- | -------- | ------------------------------ |
| projectId | `string` | yes      | Project ID to mark as reviewed |

**Example:** `{ "projectId": "<projectId>" }`

## Templates

#### `template_create_project`

Create a new project from a saved template

| Parameter    | Type     | Required | Description                                                |
| ------------ | -------- | -------- | ---------------------------------------------------------- |
| templateName | `string` | yes      | Name of the template to instantiate                        |
| projectName  | `string` | no       | Name for the new project (defaults to template name)       |
| folder       | `string` | no       | Folder to create the project in                            |
| baseDate     | `string` | no       | Base date for calculating date offsets (defaults to today) |

**Example:** `{ "templateName": "<templateName>" }`

#### `template_get`

Get details of a specific project template

| Parameter    | Type     | Required | Description          |
| ------------ | -------- | -------- | -------------------- |
| templateName | `string` | yes      | Name of the template |

**Example:** `{ "templateName": "<templateName>" }`

#### `template_save`

Save a project as a reusable template

| Parameter     | Type     | Required | Description                            |
| ------------- | -------- | -------- | -------------------------------------- |
| name          | `string` | yes      | Name for the template                  |
| sourceProject | `string` | yes      | Project ID or name to save as template |
| description   | `string` | no       | Template description                   |

**Example:** `{ "name": "<name>", "sourceProject": "<sourceProject>" }`

## Attachments

#### `attachment_add`

Add a file attachment to a task

| Parameter | Type     | Required | Description                          |
| --------- | -------- | -------- | ------------------------------------ |
| taskId    | `string` | yes      | ID of the task to attach the file to |
| filePath  | `string` | yes      | Path to the file to attach           |

**Example:** `{ "taskId": "<taskId>", "filePath": "<filePath>" }`

#### `attachment_remove`

Remove an attachment from a task

| Parameter      | Type     | Required | Description                                                   |
| -------------- | -------- | -------- | ------------------------------------------------------------- |
| taskId         | `string` | yes      | ID of the task to remove the attachment from                  |
| attachmentName | `string` | yes      | Name of the attachment to remove (as returned by attachments) |

**Example:** `{ "taskId": "<taskId>", "attachmentName": "<attachmentName>" }`

## Sync

#### `sync_status`

Get the current sync status of OmniFocus

_No parameters._

#### `sync_trigger`

Trigger a sync in OmniFocus

_No parameters._

## TaskPaper

#### `export_taskpaper`

Export tasks and projects to TaskPaper format

| Parameter        | Type      | Required | Description                            |
| ---------------- | --------- | -------- | -------------------------------------- |
| project          | `string`  | no       | Export only a specific project by name |
| includeCompleted | `boolean` | no       | Include completed tasks in the export  |
| includeDropped   | `boolean` | no       | Include dropped tasks in the export    |

#### `import_taskpaper`

Import tasks from TaskPaper formatted content

| Parameter      | Type      | Required | Description                                |
| -------------- | --------- | -------- | ------------------------------------------ |
| content        | `string`  | yes      | TaskPaper formatted content to import      |
| defaultProject | `string`  | no       | Target project for tasks without a project |
| createProjects | `boolean` | no       | Create projects that do not exist          |

**Example:** `{ "content": "<content>" }`

## Utilities

#### `archive`

Archive completed or dropped tasks and projects

| Parameter       | Type      | Required | Description                                         |
| --------------- | --------- | -------- | --------------------------------------------------- |
| completedBefore | `string`  | no       | Archive tasks completed before this date (ISO 8601) |
| droppedBefore   | `string`  | no       | Archive tasks dropped before this date (ISO 8601)   |
| project         | `string`  | no       | Archive only tasks from this project                |
| dryRun          | `boolean` | no       | Preview what would be archived without archiving    |

#### `compact_database`

Compact the OmniFocus database

_No parameters._

#### `generate_url`

Generate an OmniFocus URL scheme deep link for a task, project, folder, or tag

| Parameter | Type     | Required | Description                             |
| --------- | -------- | -------- | --------------------------------------- |
| id        | `string` | yes      | ID of the task, project, folder, or tag |

**Example:** `{ "id": "<id>" }`

#### `stats`

Get productivity statistics from OmniFocus.

| Parameter | Type                           | Required | Description                                                    |
| --------- | ------------------------------ | -------- | -------------------------------------------------------------- |
| project   | `string`                       | no       | Filter statistics by project name                              |
| period    | `day \| week \| month \| year` | no       | Predefined time period for statistics (day, week, month, year) |
| since     | `string`                       | no       | Custom period start date (ISO 8601 format)                     |
| until     | `string`                       | no       | Custom period end date (ISO 8601 format)                       |

#### `open`

Open an item in the OmniFocus user interface (task, project, folder, or tag)

| Parameter | Type     | Required | Description                                                            |
| --------- | -------- | -------- | ---------------------------------------------------------------------- |
| id        | `string` | yes      | ID of the item to open (task, project, folder, or tag — auto-detected) |

**Example:** `{ "id": "<id>" }`

## Other

#### `task_apply_repetition`

Apply a repetition rule to an existing task. Supports daily, weekly (with BYDAY), monthly (by day-of-month or Nth-weekday), and yearly (with BYMONTH) recurrences.

| Parameter           | Type                                      | Required | Description                                                                                                 |
| ------------------- | ----------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| taskId              | `string`                                  | yes      | ID of the task to update                                                                                    |
| frequency           | `daily \| weekly \| monthly \| yearly`    | yes      | Repeat frequency                                                                                            |
| interval            | `number`                                  | yes      | Repeat every N periods (default: 1)                                                                         |
| repeatMethod        | `due-again \| defer-another \| scheduled` | yes      | How to reschedule: due-again (from completion), defer-another (from defer date), scheduled (fixed cadence)  |
| daysOfWeek          | `number[]`                                | no       | Days of week (0=Sunday, 6=Saturday)                                                                         |
| dayOfMonth          | `number`                                  | no       | Day of month (1-31) for monthly recurrences                                                                 |
| daysOfWeekPositions | `number[]`                                | no       | Positional prefixes for Nth-weekday monthly rules, e.g. [1,-1] for first and last. Values in [-5,-1]∪[1,5]. |
| monthsOfYear        | `number[]`                                | no       | Months of year (1=January, 12=December) for yearly recurrences                                              |

**Example:** `{ "taskId": "<taskId>", "frequency": "<frequency>", "interval": "<interval>", "repeatMethod": "<repeatMethod>" }`

#### `task_clear_repetition`

Clear the repetition rule from an existing task.

| Parameter | Type     | Required | Description                                      |
| --------- | -------- | -------- | ------------------------------------------------ |
| taskId    | `string` | yes      | ID of the task to clear the repetition rule from |

**Example:** `{ "taskId": "<taskId>" }`

#### `omnifocus_eval`

Evaluate arbitrary OmniJS against the user's OmniFocus database. Last-resort tool.

Before using this tool, prefer the declarative commands (tasks, projects, folders, tags, forecast, search, deferred, etc.) with --filter, --sort, --fields, --group-by, --count — they cover the vast majority of queries with no scripting required.

If eval is genuinely necessary, narrate the intent in plain language first, then show the script — the user should be able to read the explanation and verify it matches the code before running it.

The script runs unsandboxed in the user's OmniFocus and can mutate any task, project, folder, tag, or perspective. Treat this like running shell code on the user's machine.

Scripts must end with a return <expression>; statement and are capped at 64 KB. The return value must be JSON-serializable. Errors from OmniJS are surfaced verbatim.

| Parameter | Type      | Required | Description                                                                                                                                                                                                               |
| --------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| script    | `unknown` | no       | OmniJS source code to evaluate against the user's OmniFocus database. Must end with a `return <expression>` statement. Mutually exclusive with --file.                                                                    |
| file      | `string`  | no       | Path to a file containing OmniJS source. Read at execution time. Mutually exclusive with --script. CLI: --file <path>                                                                                                     |
| args      | `unknown` | no       | Arguments injected into the script as a global `args` constant (deserialized from JSON). Use this instead of string-interpolating values into the script body — args go through JSON.stringify and avoid escaping issues. |

#### `project_review_interval_get`

Get the review interval for a project in days

| Parameter | Type     | Required | Description                           |
| --------- | -------- | -------- | ------------------------------------- |
| projectId | `string` | yes      | Project ID to get review interval for |

**Example:** `{ "projectId": "<projectId>" }`

#### `project_review_interval_set`

Set the review interval for a project in days

| Parameter    | Type     | Required | Description                           |
| ------------ | -------- | -------- | ------------------------------------- |
| projectId    | `string` | yes      | Project ID to set review interval for |
| intervalDays | `number` | yes      | Review interval in days               |

**Example:** `{ "projectId": "<projectId>", "intervalDays": "<intervalDays>" }`

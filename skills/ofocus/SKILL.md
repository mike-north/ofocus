---
name: ofocus
description: Interact with OmniFocus on macOS via CLI. Manage tasks, projects, folders, tags, and perspectives using the ofocus command-line tool.
---

# OmniFocus CLI Skill

<!-- generated: DO NOT EDIT BY HAND — see scripts/generate-agent-docs.ts -->

Use the `ofocus` CLI to interact with OmniFocus on macOS. All commands return JSON by default.

## Prerequisites

- macOS with OmniFocus installed
- Install: `npm install -g ofocus`

## Output Format

- Default: JSON with `success` and `data` or `error` fields
- Use `--human` flag for human-readable output

## Command Quick Reference

### Tasks

```bash
ofocus inbox <title> [--note <note>] [--due <due>] [--defer <defer>] [--flag] [--tags <val...>] [--estimated-minutes <estimatedMinutes>] [--repeat-frequency <repeatFrequency>] [--repeat-interval <repeatInterval>] [--repeat-method <repeatMethod>] [--repeat-days-of-week <val...>] [--repeat-day-of-month <repeatDayOfMonth>]  # Add a new task to the OmniFocus inbox.
ofocus complete <taskId>  # Mark a task as complete in OmniFocus.
ofocus subtask <title> --parent-task-id <parentTaskId> [--note <note>] [--due <due>] [--defer <defer>] [--flag] [--tags <val...>] [--estimated-minutes <estimatedMinutes>]  # Create a subtask under an existing parent task.
ofocus defer <taskId> [--days <days>] [--to <to>]  # Defer a task by a number of days or to a specific date.
ofocus delete <taskId>  # Permanently delete a task from OmniFocus. Cannot be undone.
ofocus template-delete <templateName>  # Delete a saved project template
ofocus drop <taskId>  # Drop a task (marks it as dropped but preserves history).
ofocus duplicate <taskId> [--include-subtasks]  # Duplicate an existing task, optionally including its subtasks.
ofocus attachments <taskId>  # List attachments on a task
ofocus perspectives  # List all perspectives in OmniFocus
ofocus template-list  # List all saved project templates
ofocus move-to-parent <taskId> --parent-task-id <parentTaskId>  # Move a task to become a subtask of another task.
ofocus deferred [--deferred-after <deferredAfter>] [--deferred-before <deferredBefore>] [--blocked-only] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]  # List tasks with defer dates.
ofocus perspective <name> [--limit <limit>]  # Query tasks from a specific perspective
ofocus projects-for-review  # List projects that are due for review
ofocus subtasks <parentTaskId> [--completed] [--flagged] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]  # List subtasks of a parent task.
ofocus tasks [--project <project>] [--tag <tag>] [--tag-mode <tagMode>] [--folder <folder>] [--flagged] [--not-flagged] [--completed] [--not-completed] [--dropped] [--not-dropped] [--blocked] [--available] [--in-inbox] [--has-due] [--no-due] [--has-defer] [--has-note] [--has-attachments] [--has-subtasks] [--has-repetition] [--effectively-completed] [--effectively-dropped] [--status <status>] [--due-before <dueBefore>] [--due-after <dueAfter>] [--due-on <dueOn>] [--due-within <dueWithin>] [--defer-before <deferBefore>] [--defer-after <deferAfter>] [--defer-on <deferOn>] [--defer-within <deferWithin>] [--completed-before <completedBefore>] [--completed-after <completedAfter>] [--estimate-lt <estimateLt>] [--estimate-gt <estimateGt>] [--estimate-eq <estimateEq>] [--name-contains <nameContains>] [--name-starts <nameStarts>] [--name-equals <nameEquals>] [--name-regex <nameRegex>] [--note-contains <noteContains>] [--note-regex <noteRegex>] [--case-sensitive] [--fields <val...>] [--exclude-fields <val...>] [--sort <val...>] [--reverse] [--nulls-first] [--count] [--first] [--last] [--ids-only] [--group-by <groupBy>] [--stats] [--limit <limit>] [--offset <offset>] [--all]  # List and filter tasks from OmniFocus.
ofocus quick <input> [--note <note>]  # Quick-capture a task using natural-language entry syntax.
ofocus search <query> [--scope <scope>] [--include-completed] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]  # Search tasks by name or note content.
ofocus update <taskId> [--title <title>] [--note <note>] [--due <due>] [--defer <defer>] [--flag] [--project <project>] [--tags <val...>] [--estimated-minutes <estimatedMinutes>] [--clear-estimate] [--repeat <repeat>] [--clear-repeat]  # Update properties of an existing task.
```

### Batch

```bash
ofocus complete-batch <taskIds...>  # Complete multiple tasks in a single operation.
ofocus defer-batch <taskIds...> [--days <days>] [--to <to>]  # Defer multiple tasks by a number of days or to a specific date.
ofocus delete-batch <taskIds...>  # Permanently delete multiple tasks in a single operation.
ofocus update-batch <taskIds...> [--title <title>] [--note <note>] [--due <due>] [--defer <defer>] [--flag] [--project <project>] [--tags <val...>] [--estimated-minutes <estimatedMinutes>]  # Apply the same property changes to multiple tasks at once.
```

### Projects

```bash
ofocus create-project <name> [--note <note>] [--folder-id <folderId>] [--folder-name <folderName>] [--sequential] [--status <status>] [--due-date <dueDate>] [--defer-date <deferDate>]  # Create a new project in OmniFocus
ofocus delete-project <projectId>  # Permanently delete a project from OmniFocus
ofocus drop-project <projectId>  # Drop a project in OmniFocus (marks as dropped but preserves history).
ofocus projects [--folder <folder>] [--status <status>] [--sequential] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]  # List and filter projects from OmniFocus
ofocus update-project <projectId> [--name <name>] [--note <note>] [--status <status>] [--folder-id <folderId>] [--folder-name <folderName>] [--sequential] [--due-date <dueDate>] [--defer-date <deferDate>]  # Update properties of an existing project
```

### Folders

```bash
ofocus create-folder <name> [--parent-folder-id <parentFolderId>] [--parent-folder-name <parentFolderName>]  # Create a new folder in OmniFocus
ofocus delete-folder <folderId>  # Permanently delete a folder from OmniFocus
ofocus folders [--parent <parent>] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]  # List folders from OmniFocus
ofocus update-folder <folderId> [--name <name>] [--parent-folder-id <parentFolderId>] [--parent-folder-name <parentFolderName>]  # Update properties of an existing folder
```

### Tags

```bash
ofocus create-tag <name> [--parent-tag-id <parentTagId>] [--parent-tag-name <parentTagName>]  # Create a new tag in OmniFocus
ofocus delete-tag <tagId>  # Delete a tag from OmniFocus
ofocus tags [--parent <parent>] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]  # List tags from OmniFocus
ofocus update-tag <tagId> [--name <name>] [--parent-tag-id <parentTagId>] [--parent-tag-name <parentTagName>]  # Update an existing tag in OmniFocus
```

### Forecast

```bash
ofocus forecast [--days <days>] [--include-deferred] --fields <fields> --exclude-fields <excludeFields> --sort <sort> [--reverse] [--limit <limit>] [--offset <offset>] [--all]  # Query tasks due within N days (like the OmniFocus Forecast view).
```

### Focus

```bash
ofocus focus <target> [--by-id]  # Focus on a specific project or folder by name or ID
ofocus focused  # Get the currently focused project or folder
ofocus unfocus  # Clear the current focus in OmniFocus
```

### Review

```bash
ofocus review <projectId>  # Mark a project as reviewed in OmniFocus
```

### Templates

```bash
ofocus template-create <templateName> [--project-name <projectName>] [--folder <folder>] [--base-date <baseDate>]  # Create a new project from a saved template
ofocus template-get <templateName>  # Get details of a specific project template
ofocus template-save <name> <sourceProject> [--description <description>]  # Save a project as a reusable template
```

### Attachments

```bash
ofocus attach <taskId> <filePath>  # Add a file attachment to a task
ofocus detach <taskId> <attachmentName>  # Remove an attachment from a task
```

### Sync

```bash
ofocus sync-status  # Get the current sync status of OmniFocus
ofocus sync  # Trigger a sync in OmniFocus
```

### TaskPaper

```bash
ofocus export [--project <project>] [--include-completed] [--include-dropped]  # Export tasks and projects to TaskPaper format
ofocus import-taskpaper --content <content> [--default-project <defaultProject>] [--create-projects]  # Import tasks from TaskPaper formatted content
```

### Utilities

```bash
ofocus archive [--completed-before <completedBefore>] [--dropped-before <droppedBefore>] [--project <project>] [--dry-run]  # Archive completed or dropped tasks and projects
ofocus compact  # Compact the OmniFocus database
ofocus url <id>  # Generate an OmniFocus URL scheme deep link for a task, project, folder, or tag
ofocus stats [--project <project>] [--period <period>] [--since <since>] [--until <until>]  # Get productivity statistics from OmniFocus.
ofocus open <id>  # Open an item in the OmniFocus user interface (task, project, folder, or tag)
```

### Productivity

```bash
ofocus changes [--watch <watch>] [--fresh] [--pending] [--generation-since <generationSince>] [--reset] [--refresh-inline] [--semantic]  # Detect what changed in OmniFocus since the last look. Cache-first and instant by default; --fresh forces a live scan; --pending returns accumulated deltas for a notification hook.
```

### Other

```bash
ofocus apply-repetition <taskId> --frequency <frequency> --interval <interval> --repeat-method <repeatMethod> [--days-of-week <val...>] [--day-of-month <dayOfMonth>] [--days-of-week-positions <val...>] [--months-of-year <val...>]  # Apply a repetition rule to an existing task. Supports daily, weekly (with BYDAY), monthly (by day-of-month or Nth-weekday), and yearly (with BYMONTH) recurrences.
ofocus clear-repetition <taskId>  # Clear the repetition rule from an existing task.
ofocus eval [script] [--file <file>] [--args <args>]  # Evaluate arbitrary OmniJS against the user's OmniFocus database. Last-resort tool.

Before using this tool, prefer the declarative commands (tasks, projects, folders, tags, forecast, search, deferred, etc.) with --filter, --sort, --fields, --group-by, --count — they cover the vast majority of queries with no scripting required.

If eval is genuinely necessary, narrate the intent in plain language first, then show the script — the user should be able to read the explanation and verify it matches the code before running it.

The script runs unsandboxed in the user's OmniFocus and can mutate any task, project, folder, tag, or perspective. Treat this like running shell code on the user's machine.

Scripts must end with a return <expression>; statement and are capped at 64 KB. The return value must be JSON-serializable. Errors from OmniJS are surfaced verbatim.
ofocus review-interval-get <projectId>  # Get the review interval for a project in days
ofocus review-interval-set <projectId> --interval-days <intervalDays>  # Set the review interval for a project in days
ofocus next-occurrences <taskId> [--count <count>] [--from <from>]  # Read a task's repetition rule and project its next occurrence dates. Schedule-anchored repeats (Fixed/DueDate) are predictable; completion-anchored repeats (Start) are projected and may shift.
ofocus occurrences [--days <days>]  # Project every incomplete repeating task forward over a window and list the upcoming occurrences, ascending by date.
ofocus this-week  # Digest of tasks due over the next seven days, grouped by calendar day and annotated with how soon each is due.
ofocus today  # Digest of what needs attention today: overdue, due today, and flagged tasks, each annotated with how overdue or how soon it is.
```


---
name: ofocus
description: Interact with OmniFocus on macOS via CLI. Manage tasks, projects, folders, tags, and perspectives using the ofocus command-line tool.
---

# OmniFocus CLI Skill

Use the `ofocus` CLI to interact with OmniFocus on macOS. All commands return JSON by default.

## Prerequisites

- macOS with OmniFocus installed
- Install: `npm install -g @ofocus/cli`

## Output Format

- Default: JSON with `success` and `data` or `error` fields
- Use `--human` flag for human-readable output

## Command Quick Reference

### Discovery

```bash
ofocus list-commands          # List all available commands
```

### Task Management

```bash
ofocus inbox "Task title"                    # Add task to inbox
ofocus inbox "Task" --due "Friday" --flag    # With due date and flag
ofocus tasks                                 # List all tasks
ofocus tasks --project "Work" --available    # Filter by project, actionable only
ofocus tasks --flagged --due-before "Sunday" # Flagged tasks due this week
ofocus complete <task-id>                    # Mark complete
ofocus update <task-id> --title "New title" --due "tomorrow"
ofocus drop <task-id>                        # Mark dropped (preserves history)
ofocus delete <task-id>                      # Permanently delete
ofocus duplicate <task-id>                   # Clone a task
ofocus search "keyword"                      # Full-text search
ofocus defer <task-id> --days 3              # Defer by days
```

### Quick Capture (Natural Language)

```bash
ofocus quick "Call John @phone #Work due:tomorrow"
ofocus quick "Weekly report ! ~1h repeat:weekly due:friday"
# Syntax: @tag, #project, ! (flag), ~30m (duration), due:, defer:, repeat:
```

### Subtasks

```bash
ofocus subtask "Subtask title" --parent <task-id>
ofocus subtasks <task-id>                    # List subtasks
ofocus move-to-parent <task-id> --parent <parent-id>
```

### Projects

```bash
ofocus projects                              # List all projects
ofocus projects --folder "Work" --status active
ofocus create-project "Project Name"
ofocus create-project "Q2 Goals" --folder "Work" --sequential --due "March 31"
ofocus update-project <proj-id> --name "New Name" --status on-hold
ofocus drop-project <proj-id>                # Mark dropped
ofocus delete-project <proj-id>              # Permanently delete
```

### Project Review

```bash
ofocus projects-for-review                   # Projects due for review
ofocus review <proj-id>                      # Mark as reviewed
ofocus review-interval <proj-id>             # Get review interval
ofocus review-interval <proj-id> --set 14    # Set to 14 days
```

### Folders

```bash
ofocus folders                               # List all folders
ofocus folders --parent "Work"               # List subfolders
ofocus create-folder "Folder Name"
ofocus create-folder "Subfolder" --parent "Parent"
ofocus update-folder <folder-id> --name "New Name"
ofocus delete-folder <folder-id>
```

### Tags

```bash
ofocus tags                                  # List all tags
ofocus create-tag "Tag Name"
ofocus create-tag "Child" --parent "Parent Tag"
ofocus update-tag <tag-id> --name "New Name"
ofocus delete-tag <tag-id>
```

### Batch Operations

```bash
ofocus complete-batch <id1> <id2> <id3>      # Complete multiple
ofocus update-batch <id1> <id2> --flag --due "Friday"
ofocus delete-batch <id1> <id2> <id3>
ofocus defer-batch <id1> <id2> --days 7
```

### Perspectives

```bash
ofocus perspectives                          # List all perspectives
ofocus perspective "Due Soon"                # Query tasks from perspective
```

### Forecast & Planning

```bash
ofocus forecast                              # Next 7 days
ofocus forecast --days 14 --include-deferred
ofocus deferred                              # Tasks with defer dates
ofocus deferred --blocked-only
```

### Focus Mode

```bash
ofocus focus "Project Name"                  # Focus on project/folder
ofocus focus <id> --by-id
ofocus unfocus                               # Clear focus
ofocus focused                               # Show current focus
```

### Templates

```bash
ofocus template-save "Template Name" <proj-id>
ofocus template-list
ofocus template-get "Template Name"
ofocus template-create "Template Name" --project-name "New Project"
ofocus template-delete "Template Name"
```

### Import/Export

```bash
ofocus export                                # Export to TaskPaper
ofocus export --project "Work" --include-completed
ofocus import tasks.taskpaper
```

### Statistics

```bash
ofocus stats                                 # Overall stats
ofocus stats --project "Work" --period week
```

### Attachments

```bash
ofocus attach <task-id> /path/to/file
ofocus attachments <task-id>                 # List attachments
ofocus detach <task-id> <attachment-name>
```

### Database & Sync

```bash
ofocus sync                                  # Trigger sync
ofocus sync-status                           # Check sync status
ofocus compact                               # Optimize database
ofocus archive --dry-run                     # Preview archival
```

### Utilities

```bash
ofocus url <id>                              # Get omnifocus:// URL
ofocus open <id>                             # Open item in OmniFocus UI
```

## Error Handling

Errors return structured JSON:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Task not found",
    "suggestion": "Verify the task ID exists"
  }
}
```

Common codes: `INVALID_ID_FORMAT`, `NOT_FOUND`, `VALIDATION_ERROR`, `APPLESCRIPT_ERROR`, `OMNIFOCUS_NOT_RUNNING`

## Large Response Commands ⚠️

These commands can return large amounts of data. **Always use filters** to narrow results:

| Command       | Risk                        | Mitigation                                                           |
| ------------- | --------------------------- | -------------------------------------------------------------------- |
| `tasks`       | High - can return thousands | Use `--flagged`, `--project`, `--tag`, `--available`, `--due-before` |
| `projects`    | Medium                      | Use `--folder`, `--status`                                           |
| `tags`        | Medium                      | Use `--parent`                                                       |
| `folders`     | Low-Medium                  | Use `--parent`                                                       |
| `subtasks`    | Medium                      | Already scoped to parent task                                        |
| `forecast`    | Medium                      | Use `--days` to limit range                                          |
| `deferred`    | Medium                      | Use `--blocked-only`                                                 |
| `export`      | High                        | Use `--project` to limit scope                                       |
| `perspective` | Varies                      | Depends on perspective definition                                    |

### Pagination

All query commands support `--limit` and `--offset`:

```bash
# Default returns up to 100 items
ofocus tasks --flagged

# Get next page if needed
ofocus tasks --flagged --limit 100 --offset 100
```

The response includes pagination metadata:

- `totalCount`: Total matching items
- `hasMore`: Whether more pages exist
- `returnedCount`: Items in this response

**Best practice**: Start with filters, use default limit (100), paginate only if `hasMore` is true.

## Best Practices

1. **Filter first**: Always use filters (`--flagged`, `--project`, `--tag`, etc.) before fetching
2. **Get IDs from filtered queries**: Use filtered `tasks`, `projects`, etc. to obtain valid IDs
3. **Prefer drop over delete**: Use `drop` to preserve history
4. **Use batch operations**: More efficient for multiple items
5. **Check focus state**: Run `focused` to understand current scope
6. **Sync after changes**: Run `sync` if immediate synchronization needed
7. **Paginate large results**: Check `hasMore` and use `--offset` for additional pages

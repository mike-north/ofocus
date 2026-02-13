# OmniFocus CLI - Agent Instructions

This document provides instructions for AI agents using the OmniFocus CLI.

## Quick Start

```bash
# List available commands
ofocus list-commands

# Add a task
ofocus inbox "Task title" --note "Details" --due "tomorrow" --flag

# Query tasks
ofocus tasks --flagged --available

# Complete a task
ofocus complete <task-id>
```

## Output Format

All commands output JSON by default for easy parsing. Use `--human` for human-readable output.

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

On error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task not found",
    "details": "Optional details"
  }
}
```

## Command Reference

### inbox

Add a task to the OmniFocus inbox.

```bash
ofocus inbox <title> [options]

Options:
  -n, --note <text>       Task note
  -d, --due <date>        Due date
  --defer <date>          Defer date
  -f, --flag              Flag the task
  -t, --tag <name...>     Tags to apply
  -e, --estimate <min>    Estimated duration in minutes
  --repeat <frequency>    daily, weekly, monthly, yearly
  --every <n>             Repeat interval (default: 1)
  --repeat-method <m>     due-again or defer-another
```

### tasks

Query tasks from OmniFocus.

```bash
ofocus tasks [options]

Options:
  -p, --project <name>    Filter by project
  -t, --tag <name>        Filter by tag
  --due-before <date>     Tasks due before date
  --due-after <date>      Tasks due after date
  --flagged               Only flagged tasks
  --completed             Only completed tasks
  --available             Only available (actionable) tasks
```

### complete

Mark a task as complete.

```bash
ofocus complete <task-id>
```

### update

Update task properties.

```bash
ofocus update <task-id> [options]

Options:
  --title <text>          New title
  -n, --note <text>       New note
  -d, --due <date>        New due date (empty to clear)
  --defer <date>          New defer date (empty to clear)
  -f, --flag              Flag the task
  --no-flag               Unflag the task
  -p, --project <name>    Move to project (empty to remove)
  -t, --tag <name...>     Replace tags
  -e, --estimate <min>    Estimated duration
  --clear-estimate        Clear estimate
  --repeat <frequency>    Set repetition
  --clear-repeat          Clear repetition
```

### projects

Query projects from OmniFocus.

```bash
ofocus projects [options]

Options:
  --folder <name>         Filter by folder
  --status <status>       Filter by status (active, on-hold, completed, dropped)
  --sequential            Only sequential projects
```

### tags

Query tags from OmniFocus.

```bash
ofocus tags [--parent <name>]
```

### Batch Operations

```bash
ofocus complete-batch <id>...    # Complete multiple tasks
ofocus update-batch <id>... [options]
ofocus delete-batch <id>...      # Permanently delete
```

### Other Commands

```bash
ofocus drop <task-id>            # Drop task (keeps history)
ofocus delete <task-id>          # Permanently delete
ofocus search <query>            # Search tasks
ofocus perspectives              # List perspectives
ofocus perspective <name>        # Query perspective tasks
```

### Template Management

Save projects as reusable templates and create new projects from them.

```bash
# Save a project as a template
ofocus template-save <name> <source-project> [--description <text>]

# List all templates
ofocus template-list

# Get template details
ofocus template-get <name>

# Create a project from a template
ofocus template-create <template-name> [--project-name <name>] [--folder <name>] [--base-date <date>]

# Delete a template
ofocus template-delete <name>
```

**Examples**:

```bash
# Save a project as a template
ofocus template-save "Sprint Template" "Current Sprint" --description "Two-week sprint structure"

# Inspect a template
ofocus template-get "Sprint Template"

# Create a new project from the template
ofocus template-create "Sprint Template" --project-name "Sprint 42" --base-date "2024-02-01"
```

## Error Codes

| Code                    | Description                       |
| ----------------------- | --------------------------------- |
| `TASK_NOT_FOUND`        | Task with given ID not found      |
| `PROJECT_NOT_FOUND`     | Project with given name not found |
| `TAG_NOT_FOUND`         | Tag with given name not found     |
| `OMNIFOCUS_NOT_RUNNING` | OmniFocus is not running          |
| `INVALID_DATE_FORMAT`   | Date string is invalid            |
| `INVALID_ID_FORMAT`     | ID contains invalid characters    |
| `APPLESCRIPT_ERROR`     | AppleScript execution failed      |
| `VALIDATION_ERROR`      | Input validation failed           |

## Best Practices

1. **Always check `success`** before accessing `data`
2. **Use `--available`** when querying tasks to get actionable items
3. **Use `list-commands`** to discover available operations
4. **Task IDs** are returned from query results - use them for `complete` and `update`
5. **Date formats** - AppleScript accepts various formats like "January 15, 2024" or "1/15/2024 5:00 PM"

## Example Workflow

```bash
# 1. Add a task
ofocus inbox "Review PR #123" --note "Check security implications" --due "today 5pm" --flag --tag "work"

# 2. List flagged tasks
ofocus tasks --flagged --available

# 3. Complete a task (using ID from step 2)
ofocus complete abc123

# 4. Update a task
ofocus update def456 --due "tomorrow" --no-flag
```

## Requirements

- macOS with OmniFocus 3 or 4 installed
- OmniFocus must be running for commands to work

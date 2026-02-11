# AI Agent Instructions for OmniFocus CLI

This document provides guidance for AI agents using the OmniFocus CLI and SDK.

## Monorepo Structure

```
ofocus/
├── packages/
│   ├── sdk/           # @ofocus/sdk - Core SDK (zero runtime dependencies)
│   ├── cli/           # @ofocus/cli - CLI using Commander.js
│   └── ofocus/        # ofocus - Umbrella package re-exporting both
```

- **CLI Usage**: Use the `ofocus` command for shell-based interactions
- **Programmatic Usage**: Import from `@ofocus/sdk` for Node.js scripts

## Quick Start

The `ofocus` CLI provides commands to interact with OmniFocus. All commands output JSON by default for easy parsing.

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

## Command Reference

### list-commands

List all available commands with descriptions and usage.

```bash
ofocus list-commands
```

### inbox

Add a task to the OmniFocus inbox.

```bash
ofocus inbox <title> [options]

Options:
  -n, --note <text>     Task note
  -d, --due <date>      Due date
  --defer <date>        Defer date
  -f, --flag            Flag the task
  -t, --tag <name...>   Tags to apply
```

### tasks

Query tasks from OmniFocus.

```bash
ofocus tasks [options]

Options:
  -p, --project <name>     Filter by project
  -t, --tag <name>         Filter by tag
  --due-before <date>      Tasks due before date
  --due-after <date>       Tasks due after date
  --flagged                Only flagged tasks
  --completed              Only completed tasks
  --available              Only available (actionable) tasks
```

### projects

Query projects from OmniFocus.

```bash
ofocus projects [options]

Options:
  --folder <name>          Filter by folder
  --status <status>        Filter by status (active, on-hold, completed, dropped)
  --sequential             Only sequential projects
```

### tags

Query tags from OmniFocus.

```bash
ofocus tags [options]

Options:
  --parent <name>          Filter by parent tag
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
  --title <text>           New title
  -n, --note <text>        New note
  -d, --due <date>         New due date (empty to clear)
  --defer <date>           New defer date (empty to clear)
  -f, --flag               Flag the task
  --no-flag                Unflag the task
  -p, --project <name>     Move to project (empty to remove)
  -t, --tag <name...>      Replace tags
```

## Output Format

All commands return JSON with this structure:

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

## Error Codes

| Code | Description |
|------|-------------|
| `TASK_NOT_FOUND` | Task with given ID not found |
| `PROJECT_NOT_FOUND` | Project with given name not found |
| `TAG_NOT_FOUND` | Tag with given name not found |
| `OMNIFOCUS_NOT_RUNNING` | OmniFocus is not running |
| `INVALID_DATE_FORMAT` | Date string is invalid |
| `INVALID_ID_FORMAT` | ID contains invalid characters |
| `APPLESCRIPT_ERROR` | AppleScript execution failed |
| `VALIDATION_ERROR` | Input validation failed |
| `UNKNOWN_ERROR` | Unexpected error |

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

## SDK Programmatic Usage

For Node.js scripts, you can use the SDK directly:

```typescript
import {
  addToInbox,
  queryTasks,
  completeTask,
  updateTask,
  queryProjects,
  queryTags,
} from "@ofocus/sdk";

// Add a task to inbox
const result = await addToInbox("Review PR #123", {
  note: "Check security implications",
  due: "today 5pm",
  flag: true,
  tags: ["work"],
});

if (result.success) {
  console.log("Created task:", result.data.taskId);
} else {
  console.error("Error:", result.error.message);
}

// Query flagged, available tasks
const tasks = await queryTasks({ flagged: true, available: true });

// Complete a task
const completed = await completeTask("task-id-here");

// Update a task
const updated = await updateTask("task-id-here", {
  due: "tomorrow",
  flag: false,
});
```

### Result Handling

All SDK functions return a `Promise<AppleScriptResult<T>>`:

```typescript
interface AppleScriptResult<T> {
  success: boolean;
  data: T | null;
  error: CliError | null;
}

// Using type guards
if (result.success) {
  // result.data is T
} else {
  // result.error contains code, message, details
}
```

### Available SDK Functions

| Function | Description |
|----------|-------------|
| `addToInbox(title, options?)` | Add task to inbox |
| `queryTasks(options?)` | Query tasks |
| `queryProjects(options?)` | Query projects |
| `queryTags(options?)` | Query tags |
| `completeTask(taskId)` | Mark task complete |
| `updateTask(taskId, options)` | Update task properties |

## Troubleshooting

### Common Issues

**"OmniFocus is not running"**
- Ensure OmniFocus is launched on macOS
- The CLI communicates via AppleScript which requires OmniFocus to be running

**"Permission denied"**
- Grant terminal/script permission to control OmniFocus in System Preferences > Privacy & Security > Automation

**"Task not found"**
- Task IDs are internal OmniFocus identifiers
- Use `queryTasks` to get valid task IDs before `completeTask` or `updateTask`

**Date format errors**
- AppleScript accepts various formats: "January 15, 2024", "1/15/2024", "today 5pm"
- Avoid ISO 8601 format (e.g., "2024-01-15T17:00:00Z")

### Error Handling Best Practices

1. **Always check `success`** before accessing `data`
2. **Handle specific error codes** for better user feedback
3. **Log error details** for debugging

```typescript
const result = await queryTasks({ project: "Work" });

if (!result.success) {
  switch (result.error.code) {
    case "PROJECT_NOT_FOUND":
      console.error("Project does not exist:", result.error.details);
      break;
    case "OMNIFOCUS_NOT_RUNNING":
      console.error("Please start OmniFocus first");
      break;
    default:
      console.error("Unexpected error:", result.error.message);
  }
  return;
}

// Process result.data
```

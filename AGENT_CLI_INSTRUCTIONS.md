# OmniFocus CLI - Agent Instructions

This document provides comprehensive guidance for AI agents using the `ofocus` CLI to interact with OmniFocus on macOS.

## Output Format

- Default output is JSON (machine-readable)
- Use `--human` flag for human-readable text output
- All commands return structured results with `success` and `data` or `error` fields

## Command Reference

---

### Discovery & Help

#### `list-commands`

List all available CLI commands with descriptions and usage. Use this to discover what operations are possible. Returns structured metadata about each command suitable for semantic activation by AI agents.

```bash
# List all commands as JSON (for programmatic use)
ofocus list-commands

# List commands in human-readable format
ofocus list-commands --human
```

---

### Task Management

#### `inbox`

Add a new task to the OmniFocus inbox. Supports setting title, note, due date, defer date, flags, and tags. Use this when you need to quickly capture a task without assigning it to a specific project. The task can be organized later from within OmniFocus.

```bash
# Simple task
ofocus inbox "Buy groceries"

# Task with options
ofocus inbox "Review quarterly report" --due "Friday" --flag --tag "Work"

# Task with defer date and estimate
ofocus inbox "Call dentist" --defer "Monday" --estimate 15

# Repeating task
ofocus inbox "Weekly review" --repeat weekly --due "Sunday"
```

#### `tasks`

Query and filter tasks from OmniFocus. Supports filtering by project, tag, due date range, flagged status, completion state, and availability. Returns task details including ID, title, dates, project, tags, and hierarchy. Use `--available` to see only actionable tasks.

```bash
# List all tasks
ofocus tasks

# Filter by project
ofocus tasks --project "Home Renovation"

# Show flagged tasks due this week
ofocus tasks --flagged --due-before "Sunday"

# Show available (actionable) tasks
ofocus tasks --available

# Filter by tag
ofocus tasks --tag "Errands"
```

#### `complete`

Mark a task as complete in OmniFocus. Requires the task ID which can be obtained from the tasks command. The task will be marked as completed with the current timestamp. This operation cannot be undone via the CLI.

```bash
ofocus complete abc123
```

#### `update`

Update properties of an existing task in OmniFocus. Requires the task ID. Supports modifying title, note, due date, defer date, flagged status, project assignment, tags, estimated duration, and repetition rules. Only specified properties are updated; others remain unchanged.

```bash
# Change title
ofocus update abc123 --title "New title"

# Add due date and flag
ofocus update abc123 --due "tomorrow" --flag

# Move to project and add tags
ofocus update abc123 --project "Work Projects" --tag "Urgent" --tag "Client"

# Clear due date
ofocus update abc123 --due ""

# Set estimate and repetition
ofocus update abc123 --estimate 30 --repeat weekly
```

#### `drop`

Mark a task as dropped in OmniFocus. Dropped tasks are removed from active lists but preserved in the database for historical reference. This is the recommended way to remove tasks you won't complete, as it maintains task history.

```bash
ofocus drop abc123
```

#### `delete`

Permanently delete a task from OmniFocus. This action cannot be undone. The task is completely removed from the database. Use 'drop' instead if you want to preserve task history.

```bash
ofocus delete abc123
```

#### `duplicate`

Create a copy of an existing task in OmniFocus. The duplicated task inherits all properties: title, note, due/defer dates, flags, tags, and estimated duration. By default includes subtasks; use `--no-include-subtasks` to exclude them.

```bash
# Duplicate with subtasks
ofocus duplicate abc123

# Duplicate without subtasks
ofocus duplicate abc123 --no-include-subtasks
```

#### `search`

Full-text search across tasks in OmniFocus. Searches task names and notes. Supports filtering search scope (name, note, or both), limiting results, and including completed tasks.

```bash
# Basic search
ofocus search "meeting notes"

# Search only task names
ofocus search "budget" --scope name

# Include completed tasks
ofocus search "project" --include-completed --limit 20
```

#### `defer`

Defer a single task by a number of days or to a specific date. Convenience wrapper around update that focuses on defer date changes.

```bash
# Defer by 3 days
ofocus defer abc123 --days 3

# Defer to specific date
ofocus defer abc123 --to "next Monday"
```

---

### Subtasks

#### `subtask`

Create a subtask under an existing task in OmniFocus. Subtasks inherit context from their parent task and create action groups. Supports all standard task options like note, due date, defer date, flags, and tags.

```bash
ofocus subtask "Research options" --parent abc123

ofocus subtask "Draft proposal" --parent abc123 --due "Friday" --flag
```

#### `subtasks`

Query subtasks of a parent task in OmniFocus. Returns immediate children of the specified task. Supports filtering by completion state and flagged status.

```bash
ofocus subtasks abc123

ofocus subtasks abc123 --flagged
```

#### `move-to-parent`

Move an existing task to become a subtask of another task. This restructures task hierarchies by making one task a child of another.

```bash
ofocus move-to-parent task123 --parent parent456
```

---

### Project Management

#### `projects`

List and query projects from OmniFocus. Supports filtering by folder, status (active, on-hold, completed, dropped), and whether the project is sequential.

```bash
# List all projects
ofocus projects

# Filter by folder
ofocus projects --folder "Work"

# Show only active projects
ofocus projects --status active

# Show sequential projects
ofocus projects --sequential
```

#### `create-project`

Create a new project in OmniFocus. Supports setting name, note, folder placement, sequential vs parallel action ordering, status, and due/defer dates.

```bash
# Simple project
ofocus create-project "Website Redesign"

# Project with folder and options
ofocus create-project "Q2 Goals" --folder "Work" --sequential --due "March 31"

# On-hold project
ofocus create-project "Future Ideas" --status on-hold
```

#### `update-project`

Update properties of an existing project. Supports renaming, changing notes, status, folder, sequential/parallel mode, and due/defer dates.

```bash
# Rename project
ofocus update-project proj123 --name "New Project Name"

# Change status
ofocus update-project proj123 --status on-hold

# Move to folder and make sequential
ofocus update-project proj123 --folder "Archive" --sequential
```

#### `delete-project`

Permanently delete a project from OmniFocus. This removes the project and all its tasks. Cannot be undone. Use `drop-project` to preserve history.

```bash
ofocus delete-project proj123
```

#### `drop-project`

Mark a project as dropped in OmniFocus. Dropped projects are removed from active lists but preserved for historical reference.

```bash
ofocus drop-project proj123
```

---

### Review Management

#### `review`

Mark a project as reviewed in OmniFocus. Updates the project's last review date to now and calculates the next review date based on the project's review interval.

```bash
ofocus review proj123
```

#### `projects-for-review`

List projects that are due for review in OmniFocus. Returns projects whose review date has passed or is imminent. Use this for the GTD weekly review process.

```bash
ofocus projects-for-review
```

#### `review-interval`

Get or set the review interval for a project. Review intervals determine how often projects appear in the Review perspective.

```bash
# Get current interval
ofocus review-interval proj123

# Set to 14 days
ofocus review-interval proj123 --set 14
```

---

### Folder Management

#### `folders`

List and query folders from OmniFocus. Supports filtering by parent folder to explore nested hierarchies.

```bash
# List all folders
ofocus folders

# List subfolders
ofocus folders --parent "Work"
```

#### `create-folder`

Create a new folder in OmniFocus. Folders organize projects into hierarchies. Supports optional parent folder for nested structures.

```bash
ofocus create-folder "Personal"

ofocus create-folder "Clients" --parent "Work"
```

#### `update-folder`

Update properties of an existing folder. Supports renaming and moving to different parent folders.

```bash
# Rename folder
ofocus update-folder folder123 --name "New Name"

# Move to different parent
ofocus update-folder folder123 --parent "Archive"
```

#### `delete-folder`

Permanently delete a folder from OmniFocus. Projects inside will become top-level. Cannot be undone.

```bash
ofocus delete-folder folder123
```

---

### Tag Management

#### `tags`

List and query tags from OmniFocus. Supports filtering by parent tag for nested tag hierarchies.

```bash
# List all tags
ofocus tags

# List child tags
ofocus tags --parent "Context"
```

#### `create-tag`

Create a new tag in OmniFocus. Tags can be nested under parent tags for hierarchical organization.

```bash
ofocus create-tag "Urgent"

ofocus create-tag "Phone" --parent "Context"
```

#### `update-tag`

Update properties of an existing tag. Supports renaming and moving to different parent tags.

```bash
ofocus update-tag tag123 --name "High Priority"

ofocus update-tag tag123 --parent "Work Tags"
```

#### `delete-tag`

Permanently delete a tag from OmniFocus. This removes the tag from all tasks that use it. Cannot be undone.

```bash
ofocus delete-tag tag123
```

---

### Batch Operations

#### `complete-batch`

Mark multiple tasks as complete in a single operation. More efficient than completing tasks individually.

```bash
ofocus complete-batch task1 task2 task3
```

#### `update-batch`

Update multiple tasks with the same changes in a single operation. Supports flagging, due dates, defer dates, and project assignment.

```bash
# Flag multiple tasks
ofocus update-batch task1 task2 task3 --flag

# Set due date for multiple tasks
ofocus update-batch task1 task2 --due "Friday"
```

#### `delete-batch`

Permanently delete multiple tasks in a single operation. Cannot be undone.

```bash
ofocus delete-batch task1 task2 task3
```

#### `defer-batch`

Defer multiple tasks by the same amount.

```bash
ofocus defer-batch task1 task2 task3 --days 7
```

---

### Perspectives

#### `perspectives`

List all perspectives available in OmniFocus. Returns both built-in perspectives (like Inbox, Flagged, Due Soon) and custom user-defined perspectives.

```bash
ofocus perspectives
```

#### `perspective`

Query tasks from a specific perspective in OmniFocus. Returns tasks that match the perspective's filter criteria.

```bash
ofocus perspective "Due Soon"

ofocus perspective "Flagged" --limit 10
```

---

### Forecast & Planning

#### `forecast`

Query tasks by date range, similar to OmniFocus Forecast view. Returns tasks due or deferred within a specified date range. Defaults to 7 days from today.

```bash
# Next 7 days
ofocus forecast

# Custom range
ofocus forecast --start "Monday" --end "Friday"

# Next 14 days including deferred
ofocus forecast --days 14 --include-deferred
```

#### `deferred`

List all tasks that have defer dates set. Returns tasks scheduled to become available in the future.

```bash
# All deferred tasks
ofocus deferred

# Only currently blocked tasks
ofocus deferred --blocked-only

# Deferred in date range
ofocus deferred --deferred-after "today" --deferred-before "next month"
```

---

### Focus Mode

#### `focus`

Focus on a specific project or folder in OmniFocus. Limits the view to show only items within the focused target.

```bash
ofocus focus "Work Projects"

ofocus focus proj123 --by-id
```

#### `unfocus`

Clear focus in OmniFocus to show all items.

```bash
ofocus unfocus
```

#### `focused`

Show the current focus state in OmniFocus.

```bash
ofocus focused
```

---

### Templates

#### `template-save`

Save an existing project as a reusable template. Captures the project structure, task titles, notes, flags, tags, estimated durations, and relative date offsets.

```bash
ofocus template-save "Weekly Review" proj123

ofocus template-save "Client Onboarding" proj123 --description "Standard onboarding checklist"
```

#### `template-list`

List all available project templates stored locally.

```bash
ofocus template-list
```

#### `template-get`

Get full details of a specific project template by name.

```bash
ofocus template-get "Weekly Review"
```

#### `template-create`

Create a new project from a saved template. Instantiates the template with all tasks, applying date offsets relative to the base date.

```bash
ofocus template-create "Weekly Review"

ofocus template-create "Client Onboarding" --project-name "Acme Corp Onboarding" --folder "Clients"
```

#### `template-delete`

Delete a project template from local storage. Cannot be undone.

```bash
ofocus template-delete "Old Template"
```

---

### Quick Capture

#### `quick`

Quick capture with natural language parsing. Supports `@tag` for tags, `#project` for project, `!` for flag, `~30m` for duration, `due:tomorrow` for due dates, `defer:monday` for defer dates, `repeat:weekly` for repetition.

```bash
ofocus quick "Call John @phone #Work due:tomorrow"

ofocus quick "Weekly report ! ~1h repeat:weekly due:friday"

ofocus quick "Buy milk @errands #Personal"
```

---

### Import/Export

#### `export`

Export tasks and projects to TaskPaper format. Supports filtering by project and including completed/dropped tasks.

```bash
# Export everything
ofocus export

# Export specific project
ofocus export --project "Work"

# Include completed tasks
ofocus export --include-completed
```

#### `import`

Import tasks from a TaskPaper format file.

```bash
ofocus import tasks.taskpaper

ofocus import tasks.taskpaper --create-projects --default-project "Inbox"
```

---

### Statistics

#### `stats`

Display productivity statistics from OmniFocus. Shows counts of completed tasks, overdue tasks, available tasks, flagged items, and project status.

```bash
# Overall stats
ofocus stats

# Stats for a project
ofocus stats --project "Work"

# Stats for this week
ofocus stats --period week
```

---

### Attachments

#### `attach`

Add a file attachment to a task in OmniFocus.

```bash
ofocus attach task123 /path/to/document.pdf
```

#### `attachments`

List all attachments of a task.

```bash
ofocus attachments task123
```

#### `detach`

Remove an attachment from a task.

```bash
ofocus detach task123 attachment-name
```

---

### Database & Sync

#### `archive`

Archive completed or dropped tasks and projects. Helps maintain database performance.

```bash
# Preview what would be archived
ofocus archive --dry-run

# Archive tasks completed before date
ofocus archive --completed-before "2024-01-01"
```

#### `compact`

Trigger database compaction in OmniFocus. Removes deleted items and optimizes the database.

```bash
ofocus compact
```

#### `sync-status`

Get the current synchronization status in OmniFocus.

```bash
ofocus sync-status
```

#### `sync`

Trigger a synchronization in OmniFocus.

```bash
ofocus sync
```

---

### Utilities

#### `url`

Generate an OmniFocus URL scheme deep link for any item. Useful for creating links in notes, scripts, or other apps.

```bash
ofocus url task123
# Returns: omnifocus:///task/task123
```

#### `open`

Open an item in the OmniFocus user interface. Accepts any ID (task, project, folder, or tag) and automatically detects the item type.

```bash
ofocus open task123
ofocus open proj456
ofocus open folder789
```

---

## Error Handling

All commands return a structured response:

```json
{
  "success": true,
  "data": { ... }
}
```

Or on error:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "suggestion": "Optional suggestion for resolution"
  }
}
```

Common error codes:

- `INVALID_ID_FORMAT` - ID contains invalid characters
- `NOT_FOUND` - Item with given ID doesn't exist
- `VALIDATION_ERROR` - Input validation failed
- `APPLESCRIPT_ERROR` - OmniFocus communication failed
- `OMNIFOCUS_NOT_RUNNING` - OmniFocus application is not running

## Best Practices

1. **Use IDs from queries**: Always obtain IDs from query commands (`tasks`, `projects`, etc.) rather than guessing
2. **Prefer drop over delete**: Use `drop` commands to preserve history; only use `delete` when permanent removal is required
3. **Batch operations**: Use batch commands when operating on multiple items for efficiency
4. **Check focus state**: Before querying, check if focus is active with `focused` to understand the current scope
5. **Sync after changes**: Run `sync` after making changes if immediate synchronization is needed

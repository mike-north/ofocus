import type { CommandInfo } from "@ofocus/sdk";

/**
 * Registry of all available commands with their semantic descriptions.
 * Descriptions are ~100 tokens to enable AI agent semantic activation.
 */
export const commandRegistry: CommandInfo[] = [
  {
    name: "list-commands",
    description:
      "List all available CLI commands with descriptions and usage. Use this to discover what operations are possible. Returns structured metadata about each command suitable for semantic activation by AI agents.",
    usage: "ofocus list-commands [--human]",
  },
  {
    name: "inbox",
    description:
      "Add a new task to the OmniFocus inbox. Supports setting title, note, due date, defer date, flags, and tags. Use this when you need to quickly capture a task without assigning it to a specific project. The task can be organized later from within OmniFocus.",
    usage:
      "ofocus inbox <title> [--note <text>] [--due <date>] [--defer <date>] [--flag] [--tag <name>...]",
  },
  {
    name: "tasks",
    description:
      "Query and filter tasks from OmniFocus. Supports filtering by project, tag, due date range, flagged status, completion state, and availability. Returns task details including ID, title, dates, project, tags, and hierarchy. Use --available to see only actionable tasks.",
    usage:
      "ofocus tasks [--project <name>] [--tag <name>] [--due-before <date>] [--due-after <date>] [--flagged] [--completed] [--available]",
  },
  {
    name: "projects",
    description:
      "List and query projects from OmniFocus. Supports filtering by folder, status (active, on-hold, completed, dropped), and whether the project is sequential. Returns project details including ID, name, task counts, and folder hierarchy.",
    usage:
      "ofocus projects [--folder <name>] [--status <status>] [--sequential]",
  },
  {
    name: "tags",
    description:
      "List and query tags from OmniFocus. Supports filtering by parent tag for nested tag hierarchies. Returns tag details including ID, name, parent relationship, and count of available tasks with that tag.",
    usage: "ofocus tags [--parent <name>]",
  },
  {
    name: "complete",
    description:
      "Mark a task as complete in OmniFocus. Requires the task ID which can be obtained from the tasks command. The task will be marked as completed with the current timestamp. This operation cannot be undone via the CLI.",
    usage: "ofocus complete <task-id>",
  },
  {
    name: "update",
    description:
      "Update properties of an existing task in OmniFocus. Requires the task ID. Supports modifying title, note, due date, defer date, flagged status, project assignment, tags, estimated duration, and repetition rules. Only specified properties are updated; others remain unchanged.",
    usage:
      "ofocus update <task-id> [--title <text>] [--note <text>] [--due <date>] [--defer <date>] [--flag] [--no-flag] [--project <name>] [--tag <name>...] [--estimate <minutes>] [--repeat <frequency>]",
  },
  {
    name: "create-project",
    description:
      "Create a new project in OmniFocus. Supports setting name, note, folder placement, sequential vs parallel action ordering, status (active or on-hold), and due/defer dates. Projects organize related tasks and can be placed in folders for hierarchy.",
    usage:
      "ofocus create-project <name> [--folder <name>] [--sequential] [--status <active|on-hold>] [--note <text>] [--due <date>] [--defer <date>]",
  },
  {
    name: "create-folder",
    description:
      "Create a new folder in OmniFocus. Folders organize projects into hierarchies. Supports optional parent folder for nested structures. Folders cannot contain tasks directly; they contain projects and other folders.",
    usage: "ofocus create-folder <name> [--parent <folder-name>]",
  },
  {
    name: "folders",
    description:
      "List and query folders from OmniFocus. Supports filtering by parent folder to explore nested hierarchies. Returns folder details including ID, name, parent relationship, project count, and subfolder count.",
    usage: "ofocus folders [--parent <folder-name>]",
  },
  {
    name: "drop",
    description:
      "Mark a task as dropped in OmniFocus. Dropped tasks are removed from active lists but preserved in the database for historical reference. This is the recommended way to remove tasks you won't complete, as it maintains task history.",
    usage: "ofocus drop <task-id>",
  },
  {
    name: "delete",
    description:
      "Permanently delete a task from OmniFocus. This action cannot be undone. The task is completely removed from the database. Use 'drop' instead if you want to preserve task history. Requires task ID from tasks command.",
    usage: "ofocus delete <task-id>",
  },
  {
    name: "create-tag",
    description:
      "Create a new tag in OmniFocus. Tags can be nested under parent tags for hierarchical organization. Tags are used to categorize and filter tasks across projects. Returns the created tag with its ID.",
    usage: "ofocus create-tag <name> [--parent <tag-name>]",
  },
  {
    name: "update-tag",
    description:
      "Update properties of an existing tag in OmniFocus. Supports renaming tags and moving them to different parent tags. Requires the tag ID which can be obtained from the tags command.",
    usage:
      "ofocus update-tag <tag-id> [--name <new-name>] [--parent <tag-name>]",
  },
  {
    name: "delete-tag",
    description:
      "Permanently delete a tag from OmniFocus. This removes the tag from all tasks that use it. This action cannot be undone. Child tags under this tag will become top-level tags.",
    usage: "ofocus delete-tag <tag-id>",
  },
  {
    name: "subtask",
    description:
      "Create a subtask under an existing task in OmniFocus. Subtasks inherit context from their parent task and create action groups. Supports all standard task options like note, due date, defer date, flags, and tags.",
    usage:
      "ofocus subtask <title> --parent <task-id> [--note <text>] [--due <date>] [--defer <date>] [--flag] [--tag <name>...]",
  },
  {
    name: "subtasks",
    description:
      "Query subtasks of a parent task in OmniFocus. Returns immediate children of the specified task. Supports filtering by completion state and flagged status. Use this to explore task hierarchies.",
    usage: "ofocus subtasks <parent-task-id> [--completed] [--flagged]",
  },
  {
    name: "move-to-parent",
    description:
      "Move an existing task to become a subtask of another task. This restructures task hierarchies by making one task a child of another. Both task IDs are required. The moved task becomes part of an action group.",
    usage: "ofocus move-to-parent <task-id> --parent <parent-task-id>",
  },
  {
    name: "complete-batch",
    description:
      "Mark multiple tasks as complete in a single operation. Accepts one or more task IDs. Returns a batch result showing which tasks succeeded and which failed. More efficient than completing tasks individually.",
    usage: "ofocus complete-batch <task-id>...",
  },
  {
    name: "update-batch",
    description:
      "Update multiple tasks with the same changes in a single operation. Accepts task IDs and update options. Supports flagging, due dates, defer dates, and project assignment. Returns batch results.",
    usage:
      "ofocus update-batch <task-id>... [--flag] [--no-flag] [--due <date>] [--defer <date>] [--project <name>]",
  },
  {
    name: "delete-batch",
    description:
      "Permanently delete multiple tasks in a single operation. Accepts one or more task IDs. Returns batch results showing successes and failures. This action cannot be undone. Use with caution.",
    usage: "ofocus delete-batch <task-id>...",
  },
  {
    name: "search",
    description:
      "Full-text search across tasks in OmniFocus. Searches task names and notes. Supports filtering search scope (name, note, or both), limiting results, and including completed tasks. Returns matching tasks.",
    usage:
      "ofocus search <query> [--scope <name|note|both>] [--limit <n>] [--include-completed]",
  },
  {
    name: "perspectives",
    description:
      "List all perspectives available in OmniFocus. Returns both built-in perspectives (like Inbox, Flagged, Due Soon) and custom user-defined perspectives. Shows perspective name, ID, and whether it's custom.",
    usage: "ofocus perspectives",
  },
  {
    name: "perspective",
    description:
      "Query tasks from a specific perspective in OmniFocus. Returns tasks that match the perspective's filter criteria. Supports limiting the number of results. Note: Some perspectives may require OmniFocus UI interaction.",
    usage: "ofocus perspective <name> [--limit <n>]",
  },
  {
    name: "review",
    description:
      "Mark a project as reviewed in OmniFocus. Updates the project's last review date to now and calculates the next review date based on the project's review interval. Returns review status information.",
    usage: "ofocus review <project-id>",
  },
  {
    name: "projects-for-review",
    description:
      "List projects that are due for review in OmniFocus. Returns projects whose review date has passed or is imminent. Use this to identify projects needing attention as part of the GTD weekly review process.",
    usage: "ofocus projects-for-review",
  },
  // Phase 5: Forecast, Focus, Deferred
  {
    name: "forecast",
    description:
      "Query tasks by date range, similar to OmniFocus Forecast view. Returns tasks due or deferred within a specified date range. Defaults to 7 days from today. Use for daily and weekly planning to see what's coming up.",
    usage:
      "ofocus forecast [--start <date>] [--end <date>] [--days <n>] [--include-deferred]",
  },
  {
    name: "focus",
    description:
      "Focus on a specific project or folder in OmniFocus. Limits the view to show only items within the focused target. Matches the OmniFocus UI focus feature. Use for scoped work sessions on a particular area.",
    usage: "ofocus focus <name> [--by-id]",
  },
  {
    name: "unfocus",
    description:
      "Clear focus in OmniFocus to show all items. Removes any active focus set by the focus command. Returns to showing the full project/folder hierarchy. Use when done with a focused work session.",
    usage: "ofocus unfocus",
  },
  {
    name: "focused",
    description:
      "Show the current focus state in OmniFocus. Returns information about what project or folder is currently focused, or indicates no active focus. Use to check the current view scope before making queries.",
    usage: "ofocus focused",
  },
  {
    name: "deferred",
    description:
      "List all tasks that have defer dates set. Returns tasks that are scheduled to become available in the future. Use --blocked-only to see only tasks currently hidden by their defer date. Useful for reviewing upcoming work.",
    usage:
      "ofocus deferred [--deferred-after <date>] [--deferred-before <date>] [--blocked-only]",
  },
  // Phase 5b: Utility Commands
  {
    name: "url",
    description:
      "Generate an OmniFocus URL scheme deep link for any item. Accepts a task, project, folder, or tag ID and returns the omnifocus:/// URL that can be used to open that item. Useful for creating links in notes, scripts, or other apps.",
    usage: "ofocus url <id>",
  },
  {
    name: "defer",
    description:
      "Defer a single task by a number of days or to a specific date. Convenience wrapper around update that focuses on defer date changes. Use --days for relative deferral or --to for absolute date.",
    usage: "ofocus defer <task-id> [--days <n>] [--to <date>]",
  },
  {
    name: "defer-batch",
    description:
      "Defer multiple tasks by the same amount. Accepts multiple task IDs and defers them all by the specified days or to the same date. More efficient than deferring tasks individually. Returns batch results.",
    usage: "ofocus defer-batch <task-id>... [--days <n>] [--to <date>]",
  },
  // Phase 6: Quick Capture
  {
    name: "quick",
    description:
      "Quick capture with natural language parsing. Supports @tag for tags, #project for project, ! for flag, ~30m for duration, due:tomorrow for due dates, defer:monday for defer dates, repeat:weekly for repetition. Everything else becomes the title.",
    usage: 'ofocus quick "<input>" [--note <text>]',
  },
  // Phase 6: TaskPaper Import/Export
  {
    name: "export",
    description:
      "Export tasks and projects to TaskPaper format. TaskPaper is a plain text format compatible with OmniFocus and other task managers. Supports filtering by project and including completed/dropped tasks. Output is written to stdout.",
    usage:
      "ofocus export [--project <name>] [--include-completed] [--include-dropped]",
  },
  {
    name: "import",
    description:
      "Import tasks from a TaskPaper format file. Creates tasks in the inbox and optionally creates projects that don't exist. TaskPaper format uses indentation and @tags for metadata like @due(date), @flagged, @done.",
    usage:
      "ofocus import <file> [--create-projects] [--default-project <name>]",
  },
  // Phase 6: Statistics
  {
    name: "stats",
    description:
      "Display productivity statistics from OmniFocus. Shows counts of completed tasks, overdue tasks, available tasks, flagged items, and project status. Supports filtering by project and time period (day, week, month, year).",
    usage:
      "ofocus stats [--project <name>] [--period <day|week|month|year>] [--since <date>] [--until <date>]",
  },
  // Phase 7: Project Templates
  {
    name: "template-save",
    description:
      "Save an existing project as a reusable template. Captures the project structure, task titles, notes, flags, tags, estimated durations, and relative date offsets. Templates are stored locally and can be instantiated to create new projects with the same structure.",
    usage:
      "ofocus template-save <name> <source-project> [--description <text>]",
  },
  {
    name: "template-list",
    description:
      "List all available project templates stored locally. Shows template name, description, task count, creation date, and source project name. Use this to discover available templates before creating projects from them.",
    usage: "ofocus template-list",
  },
  {
    name: "template-get",
    description:
      "Get full details of a specific project template by name. Returns the complete template structure including all tasks with their titles, notes, flags, tags, estimated durations, and relative date offsets. Use this to inspect a template before creating a project from it.",
    usage: "ofocus template-get <name>",
  },
  {
    name: "template-create",
    description:
      "Create a new project from a saved template. Instantiates the template with all tasks, applying date offsets relative to the base date (defaults to today). Supports specifying a custom project name and target folder.",
    usage:
      "ofocus template-create <template-name> [--project-name <name>] [--folder <name>] [--base-date <date>]",
  },
  {
    name: "template-delete",
    description:
      "Delete a project template from local storage. This action cannot be undone. The template file is permanently removed from ~/.config/ofocus/templates/.",
    usage: "ofocus template-delete <name>",
  },
  // Phase 8: Attachments
  {
    name: "attach",
    description:
      "Add a file attachment to a task in OmniFocus. The file is copied into the OmniFocus database. Requires task ID and a valid file path. The original file remains unchanged.",
    usage: "ofocus attach <task-id> <file>",
  },
  {
    name: "attachments",
    description:
      "List all attachments of a task in OmniFocus. Returns attachment IDs, names, and metadata. Use the attachment ID or name with the detach command to remove attachments.",
    usage: "ofocus attachments <task-id>",
  },
  {
    name: "detach",
    description:
      "Remove an attachment from a task in OmniFocus. Accepts either attachment ID or name. This removes the file from the OmniFocus database. This action cannot be undone.",
    usage: "ofocus detach <task-id> <attachment-id-or-name>",
  },
  // Phase 8: Archive & Cleanup
  {
    name: "archive",
    description:
      "Archive completed or dropped tasks and projects in OmniFocus. Supports filtering by completion date, drop date, and project. Use --dry-run to preview what would be archived without making changes. Helps maintain database performance.",
    usage:
      "ofocus archive [--completed-before <date>] [--dropped-before <date>] [--project <name>] [--dry-run]",
  },
  {
    name: "compact",
    description:
      "Trigger database compaction in OmniFocus. Compaction removes deleted items and optimizes the database for better performance. Run periodically to maintain a healthy OmniFocus database.",
    usage: "ofocus compact",
  },
  // Phase 8: Sync
  {
    name: "sync-status",
    description:
      "Get the current synchronization status in OmniFocus. Shows whether sync is in progress, when the last sync occurred, and whether sync is enabled. Useful for automation workflows.",
    usage: "ofocus sync-status",
  },
  {
    name: "sync",
    description:
      "Trigger a synchronization in OmniFocus. Syncs changes with the OmniFocus sync server (Omni Sync Server or custom WebDAV). Use after making changes to ensure they're uploaded.",
    usage: "ofocus sync",
  },
  // Phase 9: Project/Folder CRUD & Utilities
  {
    name: "update-project",
    description:
      "Update properties of an existing project in OmniFocus. Supports renaming, changing notes, status (active, on-hold, completed, dropped), moving to different folder, switching between sequential/parallel, and setting due/defer dates. Only specified properties are updated.",
    usage:
      "ofocus update-project <project-id> [--name <name>] [--note <text>] [--status <status>] [--folder <name>] [--sequential] [--due <date>] [--defer <date>]",
  },
  {
    name: "delete-project",
    description:
      "Permanently delete a project from OmniFocus. This removes the project and all its tasks from the database. This action cannot be undone. Use 'drop-project' instead to preserve history.",
    usage: "ofocus delete-project <project-id>",
  },
  {
    name: "drop-project",
    description:
      "Mark a project as dropped in OmniFocus. Dropped projects are removed from active lists but preserved in the database for historical reference. This is the recommended way to remove projects you won't complete.",
    usage: "ofocus drop-project <project-id>",
  },
  {
    name: "update-folder",
    description:
      "Update properties of an existing folder in OmniFocus. Supports renaming folders and moving them to different parent folders. Folders organize projects into hierarchies. Only specified properties are updated.",
    usage:
      "ofocus update-folder <folder-id> [--name <name>] [--parent <name>] [--parent-id <id>]",
  },
  {
    name: "delete-folder",
    description:
      "Permanently delete a folder from OmniFocus. This removes the folder from the database. Projects inside will become top-level. This action cannot be undone. Consider moving projects first.",
    usage: "ofocus delete-folder <folder-id>",
  },
  {
    name: "duplicate",
    description:
      "Create a copy of an existing task in OmniFocus. The duplicated task inherits all properties: title, note, due/defer dates, flags, tags, and estimated duration. By default includes subtasks; use --no-include-subtasks to exclude them.",
    usage: "ofocus duplicate <task-id> [--no-include-subtasks]",
  },
  {
    name: "open",
    description:
      "Open an item in the OmniFocus user interface. Accepts any ID (task, project, folder, or tag) and automatically detects the item type. Activates OmniFocus and navigates to the item using the URL scheme.",
    usage: "ofocus open <id>",
  },
  {
    name: "review-interval",
    description:
      "Get or set the review interval for a project. Review intervals determine how often projects appear in the Review perspective. Omit --set to get current interval; use --set <days> to change it.",
    usage: "ofocus review-interval <project-id> [--set <days>]",
  },
];

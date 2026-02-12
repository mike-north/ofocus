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
    usage: "ofocus projects [--folder <name>] [--status <status>] [--sequential]",
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
    usage: "ofocus update-tag <tag-id> [--name <new-name>] [--parent <tag-name>]",
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
];

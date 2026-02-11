import type { CommandInfo } from "../lib/types.js";

/**
 * Registry of all available commands with their semantic descriptions.
 * Descriptions are ~100 tokens to enable AI agent semantic activation.
 */
export const commandRegistry: CommandInfo[] = [
  {
    name: "list-commands",
    description:
      "List all available CLI commands with descriptions and usage. Use this to discover what operations are possible. Returns structured metadata about each command suitable for semantic activation by AI agents.",
    usage: "of list-commands [--human]",
  },
  {
    name: "inbox",
    description:
      "Add a new task to the OmniFocus inbox. Supports setting title, note, due date, defer date, flags, and tags. Use this when you need to quickly capture a task without assigning it to a specific project. The task can be organized later from within OmniFocus.",
    usage:
      "of inbox <title> [--note <text>] [--due <date>] [--defer <date>] [--flag] [--tag <name>...]",
  },
  {
    name: "tasks",
    description:
      "Query and filter tasks from OmniFocus. Supports filtering by project, tag, due date range, flagged status, completion state, and availability. Returns task details including ID, title, dates, project, tags, and hierarchy. Use --available to see only actionable tasks.",
    usage:
      "of tasks [--project <name>] [--tag <name>] [--due-before <date>] [--due-after <date>] [--flagged] [--completed] [--available]",
  },
  {
    name: "projects",
    description:
      "List and query projects from OmniFocus. Supports filtering by folder, status (active, on-hold, completed, dropped), and whether the project is sequential. Returns project details including ID, name, task counts, and folder hierarchy.",
    usage: "of projects [--folder <name>] [--status <status>] [--sequential]",
  },
  {
    name: "tags",
    description:
      "List and query tags from OmniFocus. Supports filtering by parent tag for nested tag hierarchies. Returns tag details including ID, name, parent relationship, and count of available tasks with that tag.",
    usage: "of tags [--parent <name>]",
  },
  {
    name: "complete",
    description:
      "Mark a task as complete in OmniFocus. Requires the task ID which can be obtained from the tasks command. The task will be marked as completed with the current timestamp. This operation cannot be undone via the CLI.",
    usage: "of complete <task-id>",
  },
  {
    name: "update",
    description:
      "Update properties of an existing task in OmniFocus. Requires the task ID. Supports modifying title, note, due date, defer date, flagged status, project assignment, and tags. Only specified properties are updated; others remain unchanged.",
    usage:
      "of update <task-id> [--title <text>] [--note <text>] [--due <date>] [--defer <date>] [--flag] [--no-flag] [--project <name>] [--tag <name>...]",
  },
];

import { Command, Option, Help } from "commander";
import { isAgenticTui } from "is-agentic-tui";
import {
  addToInbox,
  queryTasks,
  queryProjects,
  queryTags,
  completeTask,
  updateTask,
  createProject,
  createFolder,
  queryFolders,
  dropTask,
  deleteTask,
  createTag,
  updateTag,
  deleteTag,
  createSubtask,
  querySubtasks,
  moveTaskToParent,
  completeTasks,
  updateTasks,
  deleteTasks,
  searchTasks,
  listPerspectives,
  queryPerspective,
  reviewProject,
  queryProjectsForReview,
  // Phase 5
  queryForecast,
  focus,
  unfocus,
  getFocused,
  queryDeferred,
  generateUrl,
  deferTask,
  deferTasks,
  // Phase 6
  quickCapture,
  exportTaskPaper,
  importTaskPaper,
  getStats,
  // Phase 7
  saveTemplate,
  listTemplates,
  getTemplate,
  createFromTemplate,
  deleteTemplate,
  // Phase 8
  addAttachment,
  listAttachments,
  removeAttachment,
  archiveTasks,
  compactDatabase,
  getSyncStatus,
  triggerSync,
  // Phase 9: Project/Folder CRUD & Utilities
  updateProject,
  deleteProject,
  dropProject,
  updateFolder,
  deleteFolder,
  duplicateTask,
  openItem,
  getReviewInterval,
  setReviewInterval,
} from "@ofocus/sdk";
import type { RepetitionRule } from "@ofocus/sdk";
import { listCommands } from "./commands/list-commands.js";
import { output, outputJson, outputHuman } from "./output.js";

interface GlobalOptions {
  json?: boolean | undefined;
  human?: boolean | undefined;
}

interface InboxCommandOptions {
  note?: string | undefined;
  due?: string | undefined;
  defer?: string | undefined;
  flag?: boolean | undefined;
  tag?: string[] | undefined;
  estimate?: number | undefined;
  repeat?: string | undefined;
  every?: number | undefined;
  repeatMethod?: string | undefined;
}

interface TasksCommandOptions {
  project?: string | undefined;
  tag?: string | undefined;
  dueBefore?: string | undefined;
  dueAfter?: string | undefined;
  flagged?: boolean | undefined;
  completed?: boolean | undefined;
  available?: boolean | undefined;
}

interface ProjectsCommandOptions {
  folder?: string | undefined;
  status?: string | undefined;
  sequential?: boolean | undefined;
}

interface TagsCommandOptions {
  parent?: string | undefined;
}

interface UpdateCommandOptions {
  title?: string | undefined;
  note?: string | undefined;
  due?: string | undefined;
  defer?: string | undefined;
  flag?: boolean | undefined;
  project?: string | undefined;
  tag?: string[] | undefined;
  estimate?: number | undefined;
  clearEstimate?: boolean | undefined;
  repeat?: string | undefined;
  every?: number | undefined;
  repeatMethod?: string | undefined;
  clearRepeat?: boolean | undefined;
}

interface CreateProjectOptions {
  note?: string | undefined;
  folder?: string | undefined;
  folderId?: string | undefined;
  sequential?: boolean | undefined;
  status?: string | undefined;
  due?: string | undefined;
  defer?: string | undefined;
}

interface CreateFolderOptions {
  parent?: string | undefined;
  parentId?: string | undefined;
}

interface FoldersQueryOptions {
  parent?: string | undefined;
}

interface CreateTagOptions {
  parent?: string | undefined;
  parentId?: string | undefined;
}

interface UpdateTagOptions {
  name?: string | undefined;
  parent?: string | undefined;
  parentId?: string | undefined;
}

interface SubtaskOptions {
  parent: string;
  note?: string | undefined;
  due?: string | undefined;
  defer?: string | undefined;
  flag?: boolean | undefined;
  tag?: string[] | undefined;
  estimate?: number | undefined;
}

interface SubtasksQueryOptions {
  completed?: boolean | undefined;
  flagged?: boolean | undefined;
}

interface MoveToParentOptions {
  parent: string;
}

interface BatchUpdateOptions {
  flag?: boolean | undefined;
  due?: string | undefined;
  defer?: string | undefined;
  project?: string | undefined;
  tag?: string[] | undefined;
  estimate?: number | undefined;
}

interface SearchOptions {
  scope?: string | undefined;
  limit?: number | undefined;
  includeCompleted?: boolean | undefined;
}

interface PerspectiveOptions {
  limit?: number | undefined;
}

interface ForecastCommandOptions {
  start?: string | undefined;
  end?: string | undefined;
  days?: number | undefined;
  includeDeferred?: boolean | undefined;
}

interface FocusCommandOptions {
  byId?: boolean | undefined;
}

interface DeferredCommandOptions {
  deferredAfter?: string | undefined;
  deferredBefore?: string | undefined;
  blockedOnly?: boolean | undefined;
}

interface DeferCommandOptions {
  days?: number | undefined;
  to?: string | undefined;
}

interface QuickCommandOptions {
  note?: string | undefined;
}

interface ExportCommandOptions {
  project?: string | undefined;
  includeCompleted?: boolean | undefined;
  includeDropped?: boolean | undefined;
}

interface ImportCommandOptions {
  createProjects?: boolean | undefined;
  defaultProject?: string | undefined;
}

interface StatsCommandOptions {
  project?: string | undefined;
  period?: "day" | "week" | "month" | "year" | undefined;
  since?: string | undefined;
  until?: string | undefined;
}

interface TemplateSaveOptions {
  description?: string | undefined;
}

interface TemplateCreateOptions {
  projectName?: string | undefined;
  folder?: string | undefined;
  baseDate?: string | undefined;
}

interface ArchiveCommandOptions {
  completedBefore?: string | undefined;
  droppedBefore?: string | undefined;
  project?: string | undefined;
  dryRun?: boolean | undefined;
}

const AGENT_INSTRUCTIONS_URL =
  "https://raw.githubusercontent.com/mike-north/ofocus/refs/heads/main/AGENT_INSTRUCTIONS.md";

// Cache the agentic TUI detection result to avoid repeated expensive checks
// (the detection involves process ancestry lookups via execFileSync)
let cachedIsAgenticTui: boolean | undefined;
function getIsAgenticTui(): boolean {
  if (cachedIsAgenticTui === undefined) {
    cachedIsAgenticTui = isAgenticTui();
  }
  return cachedIsAgenticTui;
}

export function createCli(): Command {
  const program = new Command();

  program
    .name("ofocus")
    .description("OmniFocus CLI for AI agents")
    .version("0.0.1");

  // Customize help for AI agents
  // Use the default Help.formatHelp method to avoid recursion when falling through
  const defaultHelp = new Help();
  program.configureHelp({
    formatHelp: (cmd, helper) => {
      if (getIsAgenticTui()) {
        return `OmniFocus CLI - Agent Mode Detected

For comprehensive agent instructions, read:
${AGENT_INSTRUCTIONS_URL}

Quick start:
  ofocus list-commands    List all available commands
  ofocus inbox <title>    Add a task to inbox
  ofocus tasks            Query tasks
  ofocus complete <id>    Complete a task

Use --human flag for human-readable output (default is JSON).
`;
      }
      // Default help for humans - use the base Help class to avoid recursion
      return defaultHelp.formatHelp(cmd, helper);
    },
  });

  // Global options
  program.addOption(
    new Option("--json", "Output as JSON (default)").default(true)
  );
  program.addOption(new Option("--human", "Output as human-readable text"));

  // Helper to get output format
  function getOutputFormat(options: GlobalOptions): boolean {
    // --human overrides --json
    return options.human !== true;
  }

  // Helper to get global options with proper typing
  function getGlobalOpts(cmd: Command): GlobalOptions {
    return cmd.optsWithGlobals();
  }

  // Helper to parse repetition options into RepetitionRule
  function parseRepetitionOptions(
    repeat?: string,
    every?: number,
    repeatMethod?: string
  ): RepetitionRule | undefined {
    if (!repeat) return undefined;

    const frequency = repeat as RepetitionRule["frequency"];
    if (!["daily", "weekly", "monthly", "yearly"].includes(frequency)) {
      return undefined;
    }

    return {
      frequency,
      interval: every ?? 1,
      repeatMethod:
        repeatMethod === "defer-another" ? "defer-another" : "due-again",
    };
  }

  // list-commands
  program
    .command("list-commands")
    .description("List all available commands with descriptions")
    .action((_opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = listCommands();
      output(result, getOutputFormat(globalOpts));
    });

  // inbox
  program
    .command("inbox")
    .description("Add a task to the OmniFocus inbox")
    .argument("<title>", "Task title")
    .option("-n, --note <text>", "Task note")
    .option("-d, --due <date>", "Due date")
    .option("--defer <date>", "Defer date")
    .option("-f, --flag", "Flag the task")
    .option("-t, --tag <name...>", "Tags to apply")
    .option(
      "-e, --estimate <minutes>",
      "Estimated duration in minutes",
      parseInt
    )
    .option(
      "--repeat <frequency>",
      "Repeat frequency (daily, weekly, monthly, yearly)"
    )
    .option("--every <n>", "Repeat every N periods (default: 1)", parseInt)
    .option(
      "--repeat-method <method>",
      "Repeat method (due-again, defer-another)"
    )
    .action(
      async (title: string, options: InboxCommandOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await addToInbox(title, {
          note: options.note,
          due: options.due,
          defer: options.defer,
          flag: options.flag,
          tags: options.tag,
          estimatedMinutes: options.estimate,
          repeat: parseRepetitionOptions(
            options.repeat,
            options.every,
            options.repeatMethod
          ),
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // tasks
  program
    .command("tasks")
    .description("Query tasks from OmniFocus")
    .option("-p, --project <name>", "Filter by project name")
    .option("-t, --tag <name>", "Filter by tag name")
    .option("--due-before <date>", "Filter tasks due before date")
    .option("--due-after <date>", "Filter tasks due after date")
    .option("--flagged", "Show only flagged tasks")
    .option("--completed", "Show only completed tasks")
    .option("--available", "Show only available (actionable) tasks")
    .action(async (options: TasksCommandOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await queryTasks({
        project: options.project,
        tag: options.tag,
        dueBefore: options.dueBefore,
        dueAfter: options.dueAfter,
        flagged: options.flagged,
        completed: options.completed,
        available: options.available,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // projects
  program
    .command("projects")
    .description("Query projects from OmniFocus")
    .option("--folder <name>", "Filter by folder name")
    .option(
      "--status <status>",
      "Filter by status (active, on-hold, completed, dropped)"
    )
    .option("--sequential", "Show only sequential projects")
    .action(async (options: ProjectsCommandOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const status = options.status as
        | "active"
        | "on-hold"
        | "completed"
        | "dropped"
        | undefined;
      const result = await queryProjects({
        folder: options.folder,
        status,
        sequential: options.sequential,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // tags
  program
    .command("tags")
    .description("Query tags from OmniFocus")
    .option("--parent <name>", "Filter by parent tag name")
    .action(async (options: TagsCommandOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await queryTags({
        parent: options.parent,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // complete
  program
    .command("complete")
    .description("Mark a task as complete")
    .argument("<task-id>", "Task ID to complete")
    .action(async (taskId: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await completeTask(taskId);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // update
  program
    .command("update")
    .description("Update task properties")
    .argument("<task-id>", "Task ID to update")
    .option("--title <text>", "New task title")
    .option("-n, --note <text>", "New task note")
    .option("-d, --due <date>", "New due date (empty string to clear)")
    .option("--defer <date>", "New defer date (empty string to clear)")
    .option("-f, --flag", "Flag the task")
    .option("--no-flag", "Unflag the task")
    .option("-p, --project <name>", "Move to project (empty string to remove)")
    .option("-t, --tag <name...>", "Replace tags with these")
    .option(
      "-e, --estimate <minutes>",
      "Estimated duration in minutes",
      parseInt
    )
    .option("--clear-estimate", "Clear estimated duration")
    .option(
      "--repeat <frequency>",
      "Repeat frequency (daily, weekly, monthly, yearly)"
    )
    .option("--every <n>", "Repeat every N periods (default: 1)", parseInt)
    .option(
      "--repeat-method <method>",
      "Repeat method (due-again, defer-another)"
    )
    .option("--clear-repeat", "Clear repetition rule")
    .action(
      async (taskId: string, options: UpdateCommandOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await updateTask(taskId, {
          title: options.title,
          note: options.note,
          due: options.due,
          defer: options.defer,
          flag: options.flag,
          project: options.project,
          tags: options.tag,
          estimatedMinutes: options.estimate,
          clearEstimate: options.clearEstimate,
          repeat: parseRepetitionOptions(
            options.repeat,
            options.every,
            options.repeatMethod
          ),
          clearRepeat: options.clearRepeat,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // ===========================================
  // Phase 1: Create Projects & Folders
  // ===========================================

  // create-project
  program
    .command("create-project")
    .description("Create a new project in OmniFocus")
    .argument("<name>", "Project name")
    .option("-n, --note <text>", "Project note")
    .option("--folder <name>", "Parent folder name")
    .option("--folder-id <id>", "Parent folder ID")
    .option("--sequential", "Make the project sequential")
    .option("--status <status>", "Initial status (active, on-hold)")
    .option("-d, --due <date>", "Due date")
    .option("--defer <date>", "Defer date")
    .action(
      async (name: string, options: CreateProjectOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const status = options.status as "active" | "on-hold" | undefined;
        const result = await createProject(name, {
          note: options.note,
          folderName: options.folder,
          folderId: options.folderId,
          sequential: options.sequential,
          status,
          dueDate: options.due,
          deferDate: options.defer,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // create-folder
  program
    .command("create-folder")
    .description("Create a new folder in OmniFocus")
    .argument("<name>", "Folder name")
    .option("--parent <name>", "Parent folder name")
    .option("--parent-id <id>", "Parent folder ID")
    .action(
      async (name: string, options: CreateFolderOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await createFolder(name, {
          parentFolderName: options.parent,
          parentFolderId: options.parentId,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // folders
  program
    .command("folders")
    .description("Query folders from OmniFocus")
    .option("--parent <name>", "Filter by parent folder name")
    .action(async (options: FoldersQueryOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await queryFolders({
        parent: options.parent,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 1: Drop/Delete Tasks
  // ===========================================

  // drop
  program
    .command("drop")
    .description("Drop a task (marks as dropped but keeps history)")
    .argument("<task-id>", "Task ID to drop")
    .action(async (taskId: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await dropTask(taskId);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // delete
  program
    .command("delete")
    .description("Delete a task permanently (cannot be undone)")
    .argument("<task-id>", "Task ID to delete")
    .action(async (taskId: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await deleteTask(taskId);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 1: Tags CRUD
  // ===========================================

  // create-tag
  program
    .command("create-tag")
    .description("Create a new tag in OmniFocus")
    .argument("<name>", "Tag name")
    .option("--parent <name>", "Parent tag name")
    .option("--parent-id <id>", "Parent tag ID")
    .action(async (name: string, options: CreateTagOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await createTag(name, {
        parentTagName: options.parent,
        parentTagId: options.parentId,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // update-tag
  program
    .command("update-tag")
    .description("Update an existing tag in OmniFocus")
    .argument("<tag-id>", "Tag ID to update")
    .option("--name <name>", "New tag name")
    .option("--parent <name>", "Move to parent tag by name")
    .option("--parent-id <id>", "Move to parent tag by ID")
    .action(async (tagId: string, options: UpdateTagOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await updateTag(tagId, {
        name: options.name,
        parentTagName: options.parent,
        parentTagId: options.parentId,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // delete-tag
  program
    .command("delete-tag")
    .description("Delete a tag permanently (cannot be undone)")
    .argument("<tag-id>", "Tag ID to delete")
    .action(async (tagId: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await deleteTag(tagId);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 2: Subtasks
  // ===========================================

  // subtask
  program
    .command("subtask")
    .description("Create a subtask under a parent task")
    .argument("<title>", "Subtask title")
    .requiredOption("--parent <task-id>", "Parent task ID")
    .option("-n, --note <text>", "Task note")
    .option("-d, --due <date>", "Due date")
    .option("--defer <date>", "Defer date")
    .option("-f, --flag", "Flag the task")
    .option("-t, --tag <name...>", "Tags to apply")
    .option(
      "-e, --estimate <minutes>",
      "Estimated duration in minutes",
      parseInt
    )
    .action(async (title: string, options: SubtaskOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await createSubtask(title, options.parent, {
        note: options.note,
        due: options.due,
        defer: options.defer,
        flag: options.flag,
        tags: options.tag,
        estimatedMinutes: options.estimate,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // subtasks
  program
    .command("subtasks")
    .description("Query subtasks of a parent task")
    .argument("<parent-task-id>", "Parent task ID")
    .option("--completed", "Show only completed subtasks")
    .option("--flagged", "Show only flagged subtasks")
    .action(
      async (
        parentTaskId: string,
        options: SubtasksQueryOptions,
        cmd: Command
      ) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await querySubtasks(parentTaskId, {
          completed: options.completed,
          flagged: options.flagged,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // move-to-parent
  program
    .command("move-to-parent")
    .description("Move a task to become a subtask of another task")
    .argument("<task-id>", "Task ID to move")
    .requiredOption("--parent <parent-task-id>", "New parent task ID")
    .action(
      async (taskId: string, options: MoveToParentOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await moveTaskToParent(taskId, options.parent);
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // ===========================================
  // Phase 3: Batch Operations
  // ===========================================

  // complete-batch
  program
    .command("complete-batch")
    .description("Complete multiple tasks at once")
    .argument("<task-ids...>", "Task IDs to complete")
    .action(async (taskIds: string[], _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await completeTasks(taskIds);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // update-batch
  program
    .command("update-batch")
    .description("Update multiple tasks with the same properties")
    .argument("<task-ids...>", "Task IDs to update")
    .option("-f, --flag", "Flag all tasks")
    .option("--no-flag", "Unflag all tasks")
    .option("-d, --due <date>", "Set due date")
    .option("--defer <date>", "Set defer date")
    .option("-p, --project <name>", "Move to project")
    .option("-t, --tag <name...>", "Replace tags")
    .option("-e, --estimate <minutes>", "Set estimated duration", parseInt)
    .action(
      async (taskIds: string[], options: BatchUpdateOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await updateTasks(taskIds, {
          flag: options.flag,
          due: options.due,
          defer: options.defer,
          project: options.project,
          tags: options.tag,
          estimatedMinutes: options.estimate,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // delete-batch
  program
    .command("delete-batch")
    .description("Delete multiple tasks permanently (cannot be undone)")
    .argument("<task-ids...>", "Task IDs to delete")
    .action(async (taskIds: string[], _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await deleteTasks(taskIds);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 4: Search
  // ===========================================

  // search
  program
    .command("search")
    .description("Search tasks by name or note content")
    .argument("<query>", "Search query")
    .option("--scope <scope>", "Search scope (name, note, both)", "both")
    .option("--limit <n>", "Maximum results to return", parseInt, 100)
    .option("--include-completed", "Include completed tasks in results")
    .action(async (query: string, options: SearchOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const scope = options.scope as "name" | "note" | "both" | undefined;
      const result = await searchTasks(query, {
        scope,
        limit: options.limit,
        includeCompleted: options.includeCompleted,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 4: Perspectives
  // ===========================================

  // perspectives
  program
    .command("perspectives")
    .description("List all perspectives in OmniFocus")
    .action(async (_opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await listPerspectives();
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // perspective
  program
    .command("perspective")
    .description("Query tasks from a perspective")
    .argument("<name>", "Perspective name")
    .option("--limit <n>", "Maximum results to return", parseInt, 100)
    .action(async (name: string, options: PerspectiveOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await queryPerspective(name, {
        limit: options.limit,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 4: Review
  // ===========================================

  // review
  program
    .command("review")
    .description("Mark a project as reviewed")
    .argument("<project-id>", "Project ID to mark as reviewed")
    .action(async (projectId: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await reviewProject(projectId);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // projects-for-review
  program
    .command("projects-for-review")
    .description("List projects that are due for review")
    .action(async (_opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await queryProjectsForReview();
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 5: Forecast, Focus, Deferred
  // ===========================================

  // forecast
  program
    .command("forecast")
    .description("Query tasks by date range (like OmniFocus Forecast view)")
    .option("--start <date>", "Start date for forecast range (default: today)")
    .option("--end <date>", "End date for forecast range")
    .option("--days <n>", "Number of days from start (default: 7)", parseInt)
    .option("--include-deferred", "Include tasks deferred to the date range")
    .action(async (options: ForecastCommandOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await queryForecast({
        start: options.start,
        end: options.end,
        days: options.days,
        includeDeferred: options.includeDeferred,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // focus
  program
    .command("focus")
    .description("Focus on a specific project or folder")
    .argument("<target>", "Project or folder name (or ID with --by-id)")
    .option("--by-id", "Interpret target as an ID instead of name")
    .action(
      async (target: string, options: FocusCommandOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await focus(target, { byId: options.byId });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // unfocus
  program
    .command("unfocus")
    .description("Clear focus (show all items)")
    .action(async (_opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await unfocus();
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // focused
  program
    .command("focused")
    .description("Show current focus state")
    .action(async (_opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await getFocused();
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // deferred
  program
    .command("deferred")
    .description("List tasks with defer dates")
    .option("--deferred-after <date>", "Only tasks deferred after this date")
    .option("--deferred-before <date>", "Only tasks deferred before this date")
    .option("--blocked-only", "Only show tasks currently blocked by defer date")
    .action(async (options: DeferredCommandOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await queryDeferred({
        deferredAfter: options.deferredAfter,
        deferredBefore: options.deferredBefore,
        blockedOnly: options.blockedOnly,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 5b: Utility Commands
  // ===========================================

  // url
  program
    .command("url")
    .description("Generate OmniFocus URL scheme deep link for an item")
    .argument("<id>", "Task, project, folder, or tag ID")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await generateUrl(id);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // defer
  program
    .command("defer")
    .description("Defer a task by days or to a specific date")
    .argument("<task-id>", "Task ID to defer")
    .option("--days <n>", "Defer by N days from today", parseInt)
    .option("--to <date>", "Defer to a specific date")
    .action(
      async (taskId: string, options: DeferCommandOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await deferTask(taskId, {
          days: options.days,
          to: options.to,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // defer-batch
  program
    .command("defer-batch")
    .description("Defer multiple tasks by days or to a specific date")
    .argument("<task-ids...>", "Task IDs to defer")
    .option("--days <n>", "Defer by N days from today", parseInt)
    .option("--to <date>", "Defer to a specific date")
    .action(
      async (taskIds: string[], options: DeferCommandOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await deferTasks(taskIds, {
          days: options.days,
          to: options.to,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // ===========================================
  // Phase 6: Quick Capture
  // ===========================================

  // quick
  program
    .command("quick")
    .description("Quick capture with natural language parsing")
    .argument("<input>", "Natural language task input (use quotes)")
    .option("-n, --note <text>", "Additional note text")
    .action(
      async (input: string, options: QuickCommandOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await quickCapture(input, {
          note: options.note,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // ===========================================
  // Phase 6: TaskPaper Import/Export
  // ===========================================

  // export
  program
    .command("export")
    .description("Export tasks and projects to TaskPaper format")
    .option("-p, --project <name>", "Export only a specific project")
    .option("--include-completed", "Include completed tasks")
    .option("--include-dropped", "Include dropped tasks")
    .action(async (options: ExportCommandOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await exportTaskPaper({
        project: options.project,
        includeCompleted: options.includeCompleted,
        includeDropped: options.includeDropped,
      });
      // For export, output raw TaskPaper content unless JSON is requested
      if (getOutputFormat(globalOpts)) {
        output(result, true);
      } else if (result.success && result.data) {
        console.log(result.data.content);
        console.error(
          `\nExported ${String(result.data.taskCount)} tasks from ${String(result.data.projectCount)} projects`
        );
      } else {
        output(result, false);
        process.exitCode = 1;
      }
    });

  // import
  program
    .command("import")
    .description("Import tasks from a TaskPaper format file")
    .argument("<file>", "Path to TaskPaper file")
    .option("--create-projects", "Create projects that don't exist")
    .option("--default-project <name>", "Default project for tasks without one")
    .action(
      async (file: string, options: ImportCommandOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        // Read file content
        const fs = await import("node:fs/promises");
        let content: string;
        try {
          content = await fs.readFile(file, "utf-8");
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          console.error(`Error reading file: ${errorMessage}`);
          process.exitCode = 1;
          return;
        }
        const result = await importTaskPaper(content, {
          createProjects: options.createProjects,
          defaultProject: options.defaultProject,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // ===========================================
  // Phase 6: Statistics
  // ===========================================

  // stats
  program
    .command("stats")
    .description("Display productivity statistics")
    .option("-p, --project <name>", "Filter by project name")
    .option("--period <period>", "Time period: day, week, month, year")
    .option("--since <date>", "Start date (ISO format)")
    .option("--until <date>", "End date (ISO format)")
    .action(async (options: StatsCommandOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await getStats({
        project: options.project,
        period: options.period,
        since: options.since,
        until: options.until,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 7: Project Templates
  // ===========================================

  // template save
  program
    .command("template-save")
    .description("Save a project as a reusable template")
    .argument("<name>", "Template name")
    .argument("<source-project>", "Source project ID or name")
    .option("-d, --description <text>", "Template description")
    .action(
      async (
        name: string,
        sourceProject: string,
        options: TemplateSaveOptions,
        cmd: Command
      ) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await saveTemplate({
          name,
          sourceProject,
          description: options.description,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // template list
  program
    .command("template-list")
    .description("List all available project templates")
    .action((_opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = listTemplates();
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // template get
  program
    .command("template-get")
    .description("Get details of a specific template")
    .argument("<name>", "Template name")
    .action((name: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = getTemplate(name);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // template create
  program
    .command("template-create")
    .description("Create a new project from a template")
    .argument("<template-name>", "Template name to instantiate")
    .option(
      "-p, --project-name <name>",
      "New project name (defaults to template name)"
    )
    .option("-f, --folder <name>", "Folder to create the project in")
    .option(
      "--base-date <date>",
      "Base date for calculating date offsets (defaults to today)"
    )
    .action(
      async (
        templateName: string,
        options: TemplateCreateOptions,
        cmd: Command
      ) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await createFromTemplate({
          templateName,
          projectName: options.projectName,
          folder: options.folder,
          baseDate: options.baseDate,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // template delete
  program
    .command("template-delete")
    .description("Delete a project template")
    .argument("<name>", "Template name to delete")
    .action((name: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = deleteTemplate(name);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 8: Attachments
  // ===========================================

  // attach
  program
    .command("attach")
    .description("Add a file attachment to a task")
    .argument("<task-id>", "Task ID to attach file to")
    .argument("<file>", "Path to the file to attach")
    .action(
      async (taskId: string, file: string, _opts: unknown, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await addAttachment(taskId, file);
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // attachments
  program
    .command("attachments")
    .description("List attachments of a task")
    .argument("<task-id>", "Task ID to list attachments for")
    .action(async (taskId: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await listAttachments(taskId);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // detach
  program
    .command("detach")
    .description("Remove an attachment from a task")
    .argument("<task-id>", "Task ID to remove attachment from")
    .argument("<attachment>", "Attachment ID or name to remove")
    .action(
      async (
        taskId: string,
        attachment: string,
        _opts: unknown,
        cmd: Command
      ) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await removeAttachment(taskId, attachment);
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // archive
  program
    .command("archive")
    .description("Archive completed/dropped tasks and projects")
    .option(
      "--completed-before <date>",
      "Archive tasks completed before this date"
    )
    .option("--dropped-before <date>", "Archive tasks dropped before this date")
    .option("--project <name>", "Only archive tasks from this project")
    .option("--dry-run", "Preview what would be archived without archiving")
    .action(async (opts: ArchiveCommandOptions, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await archiveTasks({
        completedBefore: opts.completedBefore,
        droppedBefore: opts.droppedBefore,
        project: opts.project,
        dryRun: opts.dryRun,
      });
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // compact
  program
    .command("compact")
    .description("Trigger database compaction to optimize storage")
    .action(async (_opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await compactDatabase();
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // sync-status
  program
    .command("sync-status")
    .description("Get the current sync status")
    .action(async (_opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await getSyncStatus();
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // sync
  program
    .command("sync")
    .description("Trigger a sync operation")
    .action(async (_opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await triggerSync();
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // ===========================================
  // Phase 9: Project/Folder CRUD & Utilities
  // ===========================================

  // update-project
  program
    .command("update-project")
    .description("Update project properties")
    .argument("<project-id>", "Project ID to update")
    .option("--name <name>", "New project name")
    .option("-n, --note <text>", "New project note")
    .option(
      "--status <status>",
      "New status (active, on-hold, completed, dropped)"
    )
    .option("--folder <name>", "Move to folder by name")
    .option("--folder-id <id>", "Move to folder by ID")
    .option("--sequential", "Make the project sequential")
    .option("--no-sequential", "Make the project parallel")
    .option("-d, --due <date>", "New due date (empty string to clear)")
    .option("--defer <date>", "New defer date (empty string to clear)")
    .action(
      async (
        projectId: string,
        options: {
          name?: string;
          note?: string;
          status?: string;
          folder?: string;
          folderId?: string;
          sequential?: boolean;
          due?: string;
          defer?: string;
        },
        cmd: Command
      ) => {
        const globalOpts = getGlobalOpts(cmd);
        const status = options.status as
          | "active"
          | "on-hold"
          | "completed"
          | "dropped"
          | undefined;
        const result = await updateProject(projectId, {
          name: options.name,
          note: options.note,
          status,
          folderName: options.folder,
          folderId: options.folderId,
          sequential: options.sequential,
          dueDate: options.due,
          deferDate: options.defer,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // delete-project
  program
    .command("delete-project")
    .description("Delete a project permanently (cannot be undone)")
    .argument("<project-id>", "Project ID to delete")
    .action(async (projectId: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await deleteProject(projectId);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // drop-project
  program
    .command("drop-project")
    .description("Drop a project (marks as dropped but keeps history)")
    .argument("<project-id>", "Project ID to drop")
    .action(async (projectId: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await dropProject(projectId);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // update-folder
  program
    .command("update-folder")
    .description("Update folder properties")
    .argument("<folder-id>", "Folder ID to update")
    .option("--name <name>", "New folder name")
    .option("--parent <name>", "Move to parent folder by name")
    .option("--parent-id <id>", "Move to parent folder by ID")
    .action(
      async (
        folderId: string,
        options: {
          name?: string;
          parent?: string;
          parentId?: string;
        },
        cmd: Command
      ) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await updateFolder(folderId, {
          name: options.name,
          parentFolderName: options.parent,
          parentFolderId: options.parentId,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // delete-folder
  program
    .command("delete-folder")
    .description("Delete a folder permanently (cannot be undone)")
    .argument("<folder-id>", "Folder ID to delete")
    .action(async (folderId: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await deleteFolder(folderId);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // duplicate
  program
    .command("duplicate")
    .description("Duplicate a task with all its properties")
    .argument("<task-id>", "Task ID to duplicate")
    .option("--include-subtasks", "Include subtasks in duplicate (default)")
    .option("--no-include-subtasks", "Exclude subtasks from duplicate")
    .action(
      async (
        taskId: string,
        options: { includeSubtasks?: boolean },
        cmd: Command
      ) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await duplicateTask(taskId, {
          includeSubtasks: options.includeSubtasks,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // open
  program
    .command("open")
    .description("Open an item in the OmniFocus UI")
    .argument("<id>", "Task, project, folder, or tag ID to open")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const globalOpts = getGlobalOpts(cmd);
      const result = await openItem(id);
      output(result, getOutputFormat(globalOpts));
      if (!result.success) process.exitCode = 1;
    });

  // review-interval
  program
    .command("review-interval")
    .description("Get or set the review interval for a project")
    .argument("<project-id>", "Project ID")
    .option("--set <days>", "Set review interval in days", parseInt)
    .action(
      async (projectId: string, options: { set?: number }, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        if (options.set !== undefined) {
          const result = await setReviewInterval(projectId, options.set);
          output(result, getOutputFormat(globalOpts));
          if (!result.success) process.exitCode = 1;
        } else {
          const result = await getReviewInterval(projectId);
          output(result, getOutputFormat(globalOpts));
          if (!result.success) process.exitCode = 1;
        }
      }
    );

  return program;
}

// Export output functions for potential external use
export { outputJson, outputHuman };

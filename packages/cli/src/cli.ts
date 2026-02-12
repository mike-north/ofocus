import { Command, Option } from "commander";
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

export function createCli(): Command {
  const program = new Command();

  program
    .name("ofocus")
    .description("OmniFocus CLI for AI agents")
    .version("0.0.1");

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
      repeatMethod: repeatMethod === "defer-another" ? "defer-another" : "due-again",
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
    .option("-e, --estimate <minutes>", "Estimated duration in minutes", parseInt)
    .option("--repeat <frequency>", "Repeat frequency (daily, weekly, monthly, yearly)")
    .option("--every <n>", "Repeat every N periods (default: 1)", parseInt)
    .option("--repeat-method <method>", "Repeat method (due-again, defer-another)")
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
          repeat: parseRepetitionOptions(options.repeat, options.every, options.repeatMethod),
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
    .option("-e, --estimate <minutes>", "Estimated duration in minutes", parseInt)
    .option("--clear-estimate", "Clear estimated duration")
    .option("--repeat <frequency>", "Repeat frequency (daily, weekly, monthly, yearly)")
    .option("--every <n>", "Repeat every N periods (default: 1)", parseInt)
    .option("--repeat-method <method>", "Repeat method (due-again, defer-another)")
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
          repeat: parseRepetitionOptions(options.repeat, options.every, options.repeatMethod),
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
    .action(
      async (name: string, options: CreateTagOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await createTag(name, {
          parentTagName: options.parent,
          parentTagId: options.parentId,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  // update-tag
  program
    .command("update-tag")
    .description("Update an existing tag in OmniFocus")
    .argument("<tag-id>", "Tag ID to update")
    .option("--name <name>", "New tag name")
    .option("--parent <name>", "Move to parent tag by name")
    .option("--parent-id <id>", "Move to parent tag by ID")
    .action(
      async (tagId: string, options: UpdateTagOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await updateTag(tagId, {
          name: options.name,
          parentTagName: options.parent,
          parentTagId: options.parentId,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

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
    .option("-e, --estimate <minutes>", "Estimated duration in minutes", parseInt)
    .action(
      async (title: string, options: SubtaskOptions, cmd: Command) => {
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
      }
    );

  // subtasks
  program
    .command("subtasks")
    .description("Query subtasks of a parent task")
    .argument("<parent-task-id>", "Parent task ID")
    .option("--completed", "Show only completed subtasks")
    .option("--flagged", "Show only flagged subtasks")
    .action(
      async (parentTaskId: string, options: SubtasksQueryOptions, cmd: Command) => {
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
    .action(
      async (query: string, options: SearchOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const scope = options.scope as "name" | "note" | "both" | undefined;
        const result = await searchTasks(query, {
          scope,
          limit: options.limit,
          includeCompleted: options.includeCompleted,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

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
    .action(
      async (name: string, options: PerspectiveOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await queryPerspective(name, {
          limit: options.limit,
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

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

  return program;
}

// Export output functions for potential external use
export { outputJson, outputHuman };

import { Command, Option } from "commander";
import {
  addToInbox,
  queryTasks,
  queryProjects,
  queryTags,
  completeTask,
  updateTask,
} from "@ofocus/sdk";
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
    .action(
      async (title: string, options: InboxCommandOptions, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        const result = await addToInbox(title, {
          note: options.note,
          due: options.due,
          defer: options.defer,
          flag: options.flag,
          tags: options.tag,
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
        });
        output(result, getOutputFormat(globalOpts));
        if (!result.success) process.exitCode = 1;
      }
    );

  return program;
}

// Export output functions for potential external use
export { outputJson, outputHuman };

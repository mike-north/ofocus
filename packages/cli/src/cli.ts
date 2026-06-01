import { Command, Option, Help } from "commander";
import { isAgenticTui } from "is-agentic-tui";
import {
  addToInboxDescriptor,
  completeTaskDescriptor,
  dropTaskDescriptor,
  deleteTaskDescriptor,
  duplicateTaskDescriptor,
  searchTasksDescriptor,
  queryForecastDescriptor,
  queryDeferredDescriptor,
  quickCaptureDescriptor,
  createSubtaskDescriptor,
  querySubtasksDescriptor,
  moveTaskToParentDescriptor,
  completeTasksDescriptor,
  updateTasksDescriptor,
  deleteTasksDescriptor,
  deferTaskDescriptor,
  deferTasksDescriptor,
  listProjectsDescriptor,
  createProjectDescriptor,
  updateProjectDescriptor,
  deleteProjectDescriptor,
  dropProjectDescriptor,
  listFoldersDescriptor,
  createFolderDescriptor,
  updateFolderDescriptor,
  deleteFolderDescriptor,
  listTagsDescriptor,
  createTagDescriptor,
  updateTagDescriptor,
  deleteTagDescriptor,
  applyRepetitionRuleDescriptor,
  clearRepetitionRuleDescriptor,
  evaluateScriptDescriptor,
  // Batch 6: Advanced command descriptors
  listPerspectivesDescriptor,
  queryPerspectiveDescriptor,
  reviewProjectDescriptor,
  queryProjectsForReviewDescriptor,
  focusOnDescriptor,
  unfocusDescriptor,
  getFocusedDescriptor,
  generateUrlDescriptor,
  exportTaskPaperDescriptor,
  getSyncStatusDescriptor,
  triggerSyncDescriptor,
  saveTemplateDescriptor,
  listTemplatesDescriptor,
  getTemplateDescriptor,
  createFromTemplateDescriptor,
  deleteTemplateDescriptor,
  addAttachmentDescriptor,
  listAttachmentsDescriptor,
  removeAttachmentDescriptor,
  archiveTasksDescriptor,
  compactDatabaseDescriptor,
  openItemDescriptor,
  getReviewIntervalDescriptor,
  setReviewIntervalDescriptor,
  // Batch 7: Task stragglers
  queryTasksDescriptor,
  updateTaskDescriptor,
  getStatsDescriptor,
  // Phase 6
  importTaskPaper,
} from "@ofocus/sdk";
import {
  changesDescriptor,
  nextOccurrencesDescriptor,
  occurrencesDescriptor,
  todayDescriptor,
  thisWeekDescriptor,
  resolveDescriptor,
} from "@ofocus/productivity";
import { listCommands } from "./commands/list-commands.js";
import {
  output,
  outputJson,
  outputHuman,
  type OutputFormat,
} from "./output.js";
import { registerCliCommand } from "./registry-adapter.js";

interface GlobalOptions {
  json?: boolean | undefined;
  human?: boolean | undefined;
  format?: string | undefined;
}

const AGENT_INSTRUCTIONS_URL =
  "https://raw.githubusercontent.com/mike-north/ofocus/refs/heads/main/AGENT_INSTRUCTIONS.md";

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
      // is-agentic-tui@0.2.0+ has built-in caching, so repeated calls are fast
      if (isAgenticTui()) {
        return `OmniFocus CLI - Agent Mode Detected

For comprehensive agent instructions, read:
${AGENT_INSTRUCTIONS_URL}

Quick start:
  ofocus list-commands    List all available commands
  ofocus inbox <title>    Add a task to inbox
  ofocus tasks            Query tasks
  ofocus complete <id>    Complete a task

Use --format json|toon for machine output (default: json). Use --human for human-readable output.
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
  program.addOption(
    new Option(
      "--format <fmt>",
      "Machine output format: json or toon (default: json). Use --human for human-readable output."
    ).default("json")
  );

  /**
   * Derive the effective output format from the resolved global options.
   *
   * Order of precedence (highest to lowest):
   * 1. `--human`   → always selects the human-readable formatter
   * 2. `--format`  → selects between `json` and `toon` (default: `json`)
   *
   * An unrecognised `--format` value is rejected with a structured error
   * written to stdout so callers receive a machine-parseable envelope.
   */
  function getOutputFormat(options: GlobalOptions): OutputFormat {
    if (options.human === true) {
      return "human";
    }
    const fmt = options.format ?? "json";
    if (fmt === "json" || fmt === "toon") {
      return fmt;
    }
    // Unknown --format value: write structured error to stdout then exit 1.
    // We fall back to JSON for the error itself because we can't trust the
    // caller's requested format when the value is unrecognised. We call
    // process.exit() immediately so the command action does not continue
    // executing (which would produce a spurious second output block).
    const errorEnvelope = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `Unknown --format value: "${fmt}". Valid values are: json, toon. Use --human for human-readable output.`,
      },
    };
    console.log(JSON.stringify(errorEnvelope, null, 2));
    process.exit(1);
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

  // inbox — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, addToInboxDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // tasks — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, queryTasksDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // projects — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, listProjectsDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // tags — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, listTagsDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // complete — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, completeTaskDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // update — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, updateTaskDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // changes — registered from the centralized descriptor in @ofocus/productivity
  registerCliCommand(program, changesDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // Temporal engine (A2) — registered from @ofocus/productivity descriptors
  registerCliCommand(program, nextOccurrencesDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, occurrencesDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, todayDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, thisWeekDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, resolveDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 1: Create Projects & Folders
  // ===========================================

  // create-project — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, createProjectDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // create-folder — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, createFolderDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // folders — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, listFoldersDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 1: Drop/Delete Tasks
  // ===========================================

  // drop / delete — registered from centralized descriptors in @ofocus/sdk
  registerCliCommand(program, dropTaskDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, deleteTaskDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 1: Tags CRUD
  // ===========================================

  // create-tag / update-tag / delete-tag — registered from the centralized
  // descriptors in @ofocus/sdk.
  registerCliCommand(program, createTagDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, updateTagDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, deleteTagDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 2: Subtasks
  // ===========================================

  // subtask — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, createSubtaskDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // subtasks — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, querySubtasksDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // move-to-parent — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, moveTaskToParentDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 3: Batch Operations
  // ===========================================

  // complete-batch / update-batch / delete-batch — registered from the
  // centralized descriptors in @ofocus/sdk.
  registerCliCommand(program, completeTasksDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, updateTasksDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, deleteTasksDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 4: Search
  // ===========================================

  registerCliCommand(program, searchTasksDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 4: Perspectives
  // ===========================================

  // perspectives — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, listPerspectivesDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // perspective — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, queryPerspectiveDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 4: Review
  // ===========================================

  // review — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, reviewProjectDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // projects-for-review — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(
    program,
    queryProjectsForReviewDescriptor,
    (result, cmd) => {
      output(result, getOutputFormat(getGlobalOpts(cmd)));
    }
  );

  // ===========================================
  // Phase 5: Forecast, Focus, Deferred
  // ===========================================

  registerCliCommand(program, queryForecastDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // focus — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, focusOnDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // unfocus — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, unfocusDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // focused — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, getFocusedDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  registerCliCommand(program, queryDeferredDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 5b: Utility Commands
  // ===========================================

  // url — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, generateUrlDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // defer / defer-batch — registered from the centralized descriptors in
  // @ofocus/sdk.
  registerCliCommand(program, deferTaskDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, deferTasksDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // apply-repetition / clear-repetition — registered from the centralized
  // descriptors in @ofocus/sdk.
  registerCliCommand(program, applyRepetitionRuleDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, clearRepetitionRuleDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 6: Quick Capture
  // ===========================================

  registerCliCommand(program, quickCaptureDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 6: TaskPaper Import/Export
  // ===========================================

  // export — registered from the centralized descriptor in @ofocus/sdk.
  // Uses a custom output handler to emit raw TaskPaper text in --human mode.
  registerCliCommand(program, exportTaskPaperDescriptor, (result, cmd) => {
    const globalOpts = getGlobalOpts(cmd);
    const fmt = getOutputFormat(globalOpts);
    if (fmt === "human") {
      if (result.success && result.data) {
        const data = result.data as import("@ofocus/sdk").TaskPaperExportResult;
        console.log(data.content);
        console.error(
          `\nExported ${String(data.taskCount)} tasks from ${String(data.projectCount)} projects`
        );
      } else {
        output(result, "human");
        process.exitCode = 1;
      }
    } else {
      output(result, fmt);
    }
  });

  // import — CLI reads a file path and passes its contents to importTaskPaperDescriptor.
  // This hand-wired registration is needed because the MCP descriptor accepts
  // raw content, while the CLI surface takes a file-path argument.
  program
    .command("import")
    .description("Import tasks from a TaskPaper format file")
    .argument("<file>", "Path to TaskPaper file")
    .option("--create-projects", "Create projects that don't exist")
    .option("--default-project <name>", "Default project for tasks without one")
    .action(
      async (
        file: string,
        options: { createProjects?: boolean; defaultProject?: string },
        cmd: Command
      ) => {
        const globalOpts = getGlobalOpts(cmd);
        const fsPromises = await import("node:fs/promises");
        let content: string;
        try {
          content = await fsPromises.readFile(file, "utf-8");
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

  // stats — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, getStatsDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 7: Project Templates
  // ===========================================

  // template-save — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, saveTemplateDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // template-list — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, listTemplatesDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // template-get — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, getTemplateDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // template-create — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, createFromTemplateDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // template-delete — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, deleteTemplateDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 8: Attachments
  // ===========================================

  // attach — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, addAttachmentDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // attachments — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, listAttachmentsDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // detach — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, removeAttachmentDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // archive — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, archiveTasksDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // compact — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, compactDatabaseDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // sync-status — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, getSyncStatusDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // sync — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, triggerSyncDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Phase 9: Project/Folder CRUD & Utilities
  // ===========================================

  // update-project / delete-project — registered from the centralized
  // descriptors in @ofocus/sdk.
  registerCliCommand(program, updateProjectDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, deleteProjectDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // drop-project — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, dropProjectDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // update-folder / delete-folder — registered from the centralized
  // descriptors in @ofocus/sdk.
  registerCliCommand(program, updateFolderDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, deleteFolderDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // duplicate — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, duplicateTaskDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // ===========================================
  // Eval escape hatch
  // ===========================================

  // eval — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, evaluateScriptDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // open — registered from the centralized descriptor in @ofocus/sdk
  registerCliCommand(program, openItemDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });

  // review-interval — kept hand-wired: it combines two MCP tools (get + set)
  // into a single CLI command controlled by the --set flag. The descriptors
  // getReviewIntervalDescriptor and setReviewIntervalDescriptor each handle
  // the underlying MCP surfaces.
  program
    .command("review-interval")
    .description("Get or set the review interval for a project")
    .argument("<project-id>", "Project ID")
    .option("--set <days>", "Set review interval in days", parseInt)
    .action(
      async (projectId: string, options: { set?: number }, cmd: Command) => {
        const globalOpts = getGlobalOpts(cmd);
        if (options.set !== undefined) {
          const result = await setReviewIntervalDescriptor.handler({
            projectId,
            intervalDays: options.set,
          });
          output(result, getOutputFormat(globalOpts));
          if (!result.success) process.exitCode = 1;
        } else {
          const result = await getReviewIntervalDescriptor.handler({
            projectId,
          });
          output(result, getOutputFormat(globalOpts));
          if (!result.success) process.exitCode = 1;
        }
      }
    );

  return program;
}

// Export output functions for potential external use
export { outputJson, outputHuman };

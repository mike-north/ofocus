import type { CliOutput, OFTask, OFProject } from "../types.js";
import { success, failureMessage } from "../result.js";
import { queryTasks } from "./tasks.js";
import { queryProjects } from "./projects.js";
import { addToInbox } from "./inbox.js";
import { createProject } from "./create-project.js";

/**
 * Options for exporting to TaskPaper format.
 */
export interface TaskPaperExportOptions {
  /** Export only a specific project by name */
  project?: string | undefined;
  /** Include completed tasks */
  includeCompleted?: boolean | undefined;
  /** Include dropped tasks */
  includeDropped?: boolean | undefined;
}

/**
 * Result of a TaskPaper export.
 */
export interface TaskPaperExportResult {
  content: string;
  taskCount: number;
  projectCount: number;
}

/**
 * Options for importing from TaskPaper format.
 */
export interface TaskPaperImportOptions {
  /** Target project for tasks without a project */
  defaultProject?: string | undefined;
  /** Whether to create projects that don't exist */
  createProjects?: boolean | undefined;
}

/**
 * Result of a TaskPaper import.
 */
export interface TaskPaperImportResult {
  tasksCreated: number;
  projectsCreated: number;
  errors: string[];
}

/**
 * Parsed TaskPaper item.
 */
interface ParsedTaskPaperItem {
  type: "project" | "task" | "note";
  name: string;
  indent: number;
  tags: string[];
  due: string | null;
  defer: string | null;
  flagged: boolean;
  completed: boolean;
  dropped: boolean;
  estimate: number | null;
  note: string | null;
}

/**
 * Format a date for TaskPaper (YYYY-MM-DD).
 */
function formatTaskPaperDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  // Try to parse various date formats and output YYYY-MM-DD
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr; // Return as-is if can't parse
  return date.toISOString().split("T")[0] ?? null;
}

/**
 * Escape a string for TaskPaper format.
 */
function escapeTaskPaper(str: string | null | undefined): string {
  // TaskPaper doesn't have much escaping, but we should handle newlines
  if (str == null) return "";
  return str.replace(/\n/g, " ").replace(/\t/g, " ");
}

/**
 * Format a task as TaskPaper.
 */
function formatTaskAsTaskPaper(task: OFTask, indent: number): string {
  const prefix = "\t".repeat(indent) + "- ";
  let line = prefix + escapeTaskPaper(task.name);

  // Add tags
  for (const tag of task.tags) {
    line += ` @${escapeTaskPaper(tag)}`;
  }

  // Add special tags
  if (task.flagged) {
    line += " @flagged";
  }
  if (task.completed) {
    line += " @done";
  }

  // Add dates
  const dueDate = formatTaskPaperDate(task.dueDate);
  if (dueDate) {
    line += ` @due(${dueDate})`;
  }
  const deferDate = formatTaskPaperDate(task.deferDate);
  if (deferDate) {
    line += ` @defer(${deferDate})`;
  }

  // Add estimate
  if (task.estimatedMinutes != null && task.estimatedMinutes > 0) {
    line += ` @estimate(${String(task.estimatedMinutes)}m)`;
  }

  return line;
}

/**
 * Format a project as TaskPaper.
 */
function formatProjectAsTaskPaper(project: OFProject): string {
  let line = escapeTaskPaper(project.name) + ":";

  // Add project-level tags
  if (project.status === "on-hold") {
    line += " @on-hold";
  } else if (project.status === "completed") {
    line += " @done";
  } else if (project.status === "dropped") {
    line += " @dropped";
  }

  if (project.sequential) {
    line += " @sequential";
  } else {
    line += " @parallel";
  }

  return line;
}

/**
 * Export tasks and projects to TaskPaper format.
 */
export async function exportTaskPaper(
  options: TaskPaperExportOptions = {}
): Promise<CliOutput<TaskPaperExportResult>> {
  const lines: string[] = [];
  let taskCount = 0;
  let projectCount = 0;

  // Get projects
  const projectsResult = await queryProjects({
    status: options.includeCompleted ? undefined : "active",
  });

  if (!projectsResult.success) {
    return failureMessage(
      projectsResult.error?.message ?? "Failed to query projects"
    );
  }

  const projects = projectsResult.data?.items ?? [];

  // Filter to specific project if requested
  const filteredProjects = options.project
    ? projects.filter(
        (p) => p.name.toLowerCase() === options.project?.toLowerCase()
      )
    : projects;

  // Get tasks for each project
  for (const project of filteredProjects) {
    // Add project line
    lines.push(formatProjectAsTaskPaper(project));
    projectCount++;

    // Add project note if present
    if (project.note) {
      lines.push("\t" + escapeTaskPaper(project.note));
    }

    // Get tasks for this project
    const tasksResult = await queryTasks({
      project: project.name,
      completed: options.includeCompleted ? true : undefined,
    });

    if (tasksResult.success && tasksResult.data) {
      // Filter out the project's root task (queryTasks returns it with same ID as projectId)
      const projectTasks = tasksResult.data.items.filter(
        (t) => t.id !== project.id
      );

      for (const task of projectTasks) {
        // TODO: Dropped task filtering is not yet implemented at the query layer.
        // The OFTask type doesn't expose the `dropped` property, and queryTasks
        // doesn't support filtering by dropped status. When includeDropped=false,
        // dropped tasks may still appear in the export. To properly implement this,
        // we would need to:
        // 1. Add `dropped: boolean` to OFTask
        // 2. Add `dropped?: boolean` to TaskQueryOptions
        // 3. Filter by `effectively dropped` in the AppleScript query
        void options.includeDropped; // Acknowledged but not yet functional

        lines.push(formatTaskAsTaskPaper(task, 1));
        taskCount++;

        // Add task note if present
        if (task.note) {
          lines.push("\t\t" + escapeTaskPaper(task.note));
        }
      }
    }

    lines.push(""); // Blank line between projects
  }

  // Get inbox tasks (tasks without a project) - skip if filtering by specific project
  if (!options.project) {
    // Note: This query can be slow with many tasks. We filter by projectName after
    // to get only inbox tasks, but the initial query still retrieves all tasks.
    // For large databases, consider using a dedicated inbox query if available.
    const inboxResult = await queryTasks({
      completed: options.includeCompleted ? true : undefined,
    });

    if (inboxResult.success && inboxResult.data) {
      const inboxTasks = inboxResult.data.items.filter((t) => !t.projectName);
      if (inboxTasks.length > 0) {
        lines.push("Inbox:");
        for (const task of inboxTasks) {
          lines.push(formatTaskAsTaskPaper(task, 1));
          taskCount++;
          if (task.note) {
            lines.push("\t\t" + escapeTaskPaper(task.note));
          }
        }
      }
    }
  }

  return success({
    content: lines.join("\n"),
    taskCount,
    projectCount,
  });
}

/**
 * Parse a single line of TaskPaper format.
 */
function parseTaskPaperLine(line: string): ParsedTaskPaperItem | null {
  // Count leading tabs for indent
  let indent = 0;
  let content = line;
  while (content.startsWith("\t")) {
    indent++;
    content = content.slice(1);
  }
  // Also handle spaces (4 spaces = 1 indent level)
  const spaceMatch = /^( +)/.exec(content);
  if (spaceMatch?.[1]) {
    indent += Math.floor(spaceMatch[1].length / 4);
    content = content.slice(spaceMatch[1].length);
  }

  content = content.trim();
  if (!content) return null;

  // Check if it's a project. We support:
  // - "ProjectName:" (original behavior), and
  // - "ProjectName: @tag ..." (exported project lines with trailing tags).
  const colonIndex = content.indexOf(":");
  if (colonIndex > 0) {
    const namePart = content.slice(0, colonIndex).trim();
    const trailing = content.slice(colonIndex + 1);
    const trailingTrimmed = trailing.trim();

    const looksLikeProject =
      // Original behavior: just "ProjectName:" with no tags anywhere.
      (!trailingTrimmed && !content.includes("@")) ||
      // New behavior: "ProjectName: @tag ..." where the first non-space
      // character after the colon starts a tag.
      trailingTrimmed.startsWith("@");

    if (namePart && looksLikeProject) {
      return {
        type: "project",
        name: namePart,
        indent,
        tags: [],
        due: null,
        defer: null,
        flagged: false,
        completed: false,
        dropped: false,
        estimate: null,
        note: null,
      };
    }
  }

  // Check if it's a task (starts with - or *)
  if (content.startsWith("- ") || content.startsWith("* ")) {
    content = content.slice(2);

    // Parse tags and special attributes
    const tags: string[] = [];
    let due: string | null = null;
    let defer: string | null = null;
    let flagged = false;
    let completed = false;
    let dropped = false;
    let estimate: number | null = null;

    // Extract tags with values like @due(2024-01-15)
    const tagWithValueRegex = /@(\w+)\(([^)]+)\)/g;
    let match;
    while ((match = tagWithValueRegex.exec(content)) !== null) {
      const tagName = match[1]?.toLowerCase();
      const tagValue = match[2];
      if (tagName === "due" && tagValue) {
        due = tagValue;
      } else if (tagName === "defer" && tagValue) {
        defer = tagValue;
      } else if (tagName === "estimate" && tagValue) {
        // Parse estimate like "30m" or "1h"
        const estMatch = /^(\d+)(m|h)$/i.exec(tagValue);
        if (estMatch?.[1] && estMatch[2]) {
          const value = parseInt(estMatch[1], 10);
          estimate = estMatch[2].toLowerCase() === "h" ? value * 60 : value;
        }
      }
    }
    content = content.replace(tagWithValueRegex, "");

    // Extract simple tags like @flagged, @done, @on-hold (allow hyphens in tag names)
    const simpleTagRegex = /@([\w-]+)/g;
    while ((match = simpleTagRegex.exec(content)) !== null) {
      const tagName = match[1]?.toLowerCase();
      if (tagName === "flagged") {
        flagged = true;
      } else if (tagName === "done") {
        completed = true;
      } else if (tagName === "dropped") {
        dropped = true;
      } else if (match[1]) {
        // Regular tag
        tags.push(match[1]);
      }
    }
    content = content.replace(simpleTagRegex, "");

    const name = content.trim();

    return {
      type: "task",
      name,
      indent,
      tags,
      due,
      defer,
      flagged,
      completed,
      dropped,
      estimate,
      note: null,
    };
  }

  // Otherwise it's a note/description
  return {
    type: "note",
    name: content,
    indent,
    tags: [],
    due: null,
    defer: null,
    flagged: false,
    completed: false,
    dropped: false,
    estimate: null,
    note: null,
  };
}

/**
 * Import tasks from TaskPaper format.
 */
export async function importTaskPaper(
  content: string,
  options: TaskPaperImportOptions = {}
): Promise<CliOutput<TaskPaperImportResult>> {
  const lines = content.split("\n");
  const result: TaskPaperImportResult = {
    tasksCreated: 0,
    projectsCreated: 0,
    errors: [],
  };

  // Track current project for task assignment (TODO: implement project assignment)
  let _currentProject: string | null = options.defaultProject ?? null;
  let lastItem: ParsedTaskPaperItem | null = null;

  for (const line of lines) {
    const parsed = parseTaskPaperLine(line);
    if (!parsed) continue;

    if (parsed.type === "project") {
      // Skip "Inbox" pseudo-project
      if (parsed.name.toLowerCase() === "inbox") {
        _currentProject = null;
        continue;
      }

      // Create project if it doesn't exist and option is set
      if (options.createProjects) {
        const createResult = await createProject(parsed.name, {});
        if (createResult.success) {
          result.projectsCreated++;
        }
        // Don't treat "already exists" as an error
      }
      _currentProject = parsed.name;
      lastItem = parsed;
    } else if (parsed.type === "task") {
      // Skip completed/dropped tasks during import
      if (parsed.completed || parsed.dropped) {
        lastItem = parsed;
        continue;
      }

      // Create the task
      const taskResult = await addToInbox(parsed.name, {
        due: parsed.due ?? undefined,
        defer: parsed.defer ?? undefined,
        flag: parsed.flagged,
        tags: parsed.tags.length > 0 ? parsed.tags : undefined,
        estimatedMinutes: parsed.estimate ?? undefined,
      });

      if (taskResult.success) {
        result.tasksCreated++;
      } else {
        result.errors.push(
          `Failed to create task "${parsed.name}": ${taskResult.error?.message ?? "Unknown error"}`
        );
      }
      lastItem = parsed;
    } else {
      // parsed.type === "note"
      // Notes are informational only during import - we could potentially
      // update the previous task/project with this note, but for simplicity
      // we'll skip it in this version
      if (lastItem) {
        // Reserved for future note handling
      }
    }
  }

  // Project tracking is reserved for future use when we implement direct project assignment
  void _currentProject;

  return success(result);
}

import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runOmniJSWrapped, escapeJSString, toOmniJSDate } from "../omnijs.js";

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
 * Intermediate representation of a task for import.
 */
interface ParsedTask {
  name: string;
  tags: string[];
  due: string | null;
  defer: string | null;
  flagged: boolean;
  estimate: number | null;
}

/**
 * Export result shape returned from OmniJS.
 */
interface ExportResult {
  content: string;
  taskCount: number;
  projectCount: number;
}

/**
 * Import result shape returned from OmniJS.
 */
interface ImportResult {
  tasksCreated: number;
  projectsCreated: number;
  errors: string[];
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
 * Export tasks and projects to TaskPaper format via OmniJS.
 *
 * OmniJS builds the entire TaskPaper document in a single script execution,
 * iterating flattenedProjects and their tasks directly. This replaces the
 * previous approach of multiple queryProjects/queryTasks round-trips.
 */
export async function exportTaskPaper(
  options: TaskPaperExportOptions = {}
): Promise<CliOutput<TaskPaperExportResult>> {
  const includeCompleted = options.includeCompleted === true;
  const includeDropped = options.includeDropped === true;
  const projectFilter = options.project ?? null;

  const body = `
var lines = [];
var taskCount = 0;
var projectCount = 0;

var projects = flattenedProjects;

for (var pi = 0; pi < projects.length; pi++) {
  var proj = projects[pi];

  // Filter to a specific project if requested
  ${projectFilter !== null ? `if (proj.name.toLowerCase() !== "${escapeJSString(projectFilter.toLowerCase())}") { continue; }` : ""}

  // Skip completed projects unless requested
  if (!${String(includeCompleted)} && proj.status === Project.Status.Done) { continue; }

  // Skip dropped projects unless requested
  if (!${String(includeDropped)} && proj.status === Project.Status.Dropped) { continue; }

  // Build project line
  var projLine = proj.name + ":";

  if (proj.status === Project.Status.OnHold) {
    projLine += " @on-hold";
  } else if (proj.status === Project.Status.Done) {
    projLine += " @done";
  } else if (proj.status === Project.Status.Dropped) {
    projLine += " @dropped";
  }

  if (proj.sequential) {
    projLine += " @sequential";
  } else {
    projLine += " @parallel";
  }

  lines.push(projLine);
  projectCount++;

  // Add project note if present
  if (proj.note) {
    lines.push("\\t" + proj.note.replace(/\\n/g, " ").replace(/\\t/g, " "));
  }

  // Add project tasks
  var tasks = proj.flattenedTasks;
  for (var ti = 0; ti < tasks.length; ti++) {
    var t = tasks[ti];

    // Skip the project's root task (has no name or same id as project)
    if (!t.name) { continue; }

    // Skip completed tasks unless requested
    if (!${String(includeCompleted)} && t.completed) { continue; }

    // Skip dropped tasks unless requested
    if (!${String(includeDropped)} && t.effectivelyDropped) { continue; }

    var taskLine = "\\t- " + t.name.replace(/\\n/g, " ").replace(/\\t/g, " ");

    // Add tags
    var tagNames = t.tags.map(function(tg) { return tg.name; });
    for (var tgi = 0; tgi < tagNames.length; tgi++) {
      taskLine += " @" + tagNames[tgi].replace(/\\n/g, " ").replace(/\\t/g, " ");
    }

    // Add special tags
    if (t.flagged) { taskLine += " @flagged"; }
    if (t.completed) { taskLine += " @done"; }

    // Add dates
    if (t.dueDate) {
      var due = t.dueDate.toISOString().split("T")[0];
      taskLine += " @due(" + due + ")";
    }
    if (t.deferDate) {
      var defer = t.deferDate.toISOString().split("T")[0];
      taskLine += " @defer(" + defer + ")";
    }

    // Add estimate
    if (t.estimatedMinutes != null && t.estimatedMinutes > 0) {
      taskLine += " @estimate(" + t.estimatedMinutes + "m)";
    }

    lines.push(taskLine);
    taskCount++;

    // Add task note
    if (t.note) {
      lines.push("\\t\\t" + t.note.replace(/\\n/g, " ").replace(/\\t/g, " "));
    }
  }

  lines.push("");
}

// Add inbox tasks (tasks without a project) — only when not filtering by project
${
  projectFilter === null
    ? `var inboxTasks = inbox;
var inboxItems = [];
for (var ii = 0; ii < inboxTasks.length; ii++) {
  var it = inboxTasks[ii];
  if (it.completed && !${String(includeCompleted)}) { continue; }
  if (it.effectivelyDropped && !${String(includeDropped)}) { continue; }
  inboxItems.push(it);
}
if (inboxItems.length > 0) {
  lines.push("Inbox:");
  for (var ii2 = 0; ii2 < inboxItems.length; ii2++) {
    var it2 = inboxItems[ii2];
    var inboxLine = "\\t- " + it2.name.replace(/\\n/g, " ").replace(/\\t/g, " ");
    var itTags = it2.tags.map(function(tg) { return tg.name; });
    for (var itgi = 0; itgi < itTags.length; itgi++) {
      inboxLine += " @" + itTags[itgi];
    }
    if (it2.flagged) { inboxLine += " @flagged"; }
    if (it2.completed) { inboxLine += " @done"; }
    if (it2.dueDate) {
      var itDue = it2.dueDate.toISOString().split("T")[0];
      inboxLine += " @due(" + itDue + ")";
    }
    if (it2.deferDate) {
      var itDefer = it2.deferDate.toISOString().split("T")[0];
      inboxLine += " @defer(" + itDefer + ")";
    }
    if (it2.estimatedMinutes != null && it2.estimatedMinutes > 0) {
      inboxLine += " @estimate(" + it2.estimatedMinutes + "m)";
    }
    lines.push(inboxLine);
    taskCount++;
    if (it2.note) {
      lines.push("\\t\\t" + it2.note.replace(/\\n/g, " ").replace(/\\t/g, " "));
    }
  }
}`
    : "// Project filter active — inbox skipped"
}

return JSON.stringify({
  content: lines.join("\\n"),
  taskCount: taskCount,
  projectCount: projectCount
});`;

  const result = await runOmniJSWrapped<ExportResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to export TaskPaper")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No export data returned")
    );
  }

  return success(result.data);
}

/**
 * Build the OmniJS statements that set properties on a newly created task
 * and increment the tasksCreated counter.
 *
 * @param task - The parsed task data
 * @param taskConstructorExpr - OmniJS expression creating the task (e.g. `new Task("name", inbox.ending)`)
 * @param varName - Deterministic variable name to use in OmniJS (caller supplies to avoid collisions)
 */
function buildTaskPropertyScript(
  task: ParsedTask,
  taskConstructorExpr: string,
  varName: string
): string {
  const parts: string[] = [];

  parts.push(`var ${varName} = ${taskConstructorExpr};`);

  if (task.flagged) {
    parts.push(`  ${varName}.flagged = true;`);
  }

  if (task.due !== null) {
    parts.push(`  ${varName}.dueDate = ${toOmniJSDate(task.due)};`);
  }

  if (task.defer !== null) {
    parts.push(`  ${varName}.deferDate = ${toOmniJSDate(task.defer)};`);
  }

  if (task.estimate !== null) {
    parts.push(`  ${varName}.estimatedMinutes = ${String(task.estimate)};`);
  }

  for (const tagName of task.tags) {
    // Variable name for this tag: sanitize the task var + tag name to avoid OmniJS identifier issues
    const tagVar = `${varName}_tg_${tagName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    parts.push(
      `  var ${tagVar} = flattenedTags.byName("${escapeJSString(tagName)}"); if (${tagVar}) { ${varName}.addTag(${tagVar}); }`
    );
  }

  parts.push(`  tasksCreated++;`);

  return parts.join("\n");
}

/**
 * Import tasks from TaskPaper format.
 *
 * The TypeScript-side TaskPaper parser (parseTaskPaperLine) is preserved
 * exactly. After parsing, a single OmniJS script creates all projects and
 * tasks in one execution rather than one round-trip per item.
 */
export async function importTaskPaper(
  content: string,
  options: TaskPaperImportOptions = {}
): Promise<CliOutput<TaskPaperImportResult>> {
  const lines = content.split("\n");

  // Track current project for task assignment
  let currentProjectName: string | null = options.defaultProject ?? null;

  // Collect projects to (optionally) create — deduplicated, insertion-ordered
  const projectsToCreate: string[] = [];

  // Map project name → tasks under it, insertion-ordered
  const projectTaskMap = new Map<string, ParsedTask[]>();

  // Tasks with no project go to inbox
  const inboxTasks: ParsedTask[] = [];

  for (const line of lines) {
    const parsed = parseTaskPaperLine(line);
    if (!parsed) continue;

    if (parsed.type === "project") {
      // Skip "Inbox" pseudo-project
      if (parsed.name.toLowerCase() === "inbox") {
        currentProjectName = null;
        continue;
      }

      if (options.createProjects && !projectsToCreate.includes(parsed.name)) {
        projectsToCreate.push(parsed.name);
      }
      currentProjectName = parsed.name;
      if (!projectTaskMap.has(parsed.name)) {
        projectTaskMap.set(parsed.name, []);
      }
    } else if (parsed.type === "task") {
      // Skip completed/dropped tasks during import
      if (parsed.completed || parsed.dropped) {
        continue;
      }

      const task: ParsedTask = {
        name: parsed.name,
        tags: parsed.tags,
        due: parsed.due,
        defer: parsed.defer,
        flagged: parsed.flagged,
        estimate: parsed.estimate,
      };

      if (currentProjectName !== null) {
        const bucket = projectTaskMap.get(currentProjectName);
        if (bucket !== undefined) {
          bucket.push(task);
        } else {
          // Project came from defaultProject — create bucket on first encounter
          projectTaskMap.set(currentProjectName, [task]);
        }
      } else {
        inboxTasks.push(task);
      }
    }
    // Notes are informational only during import — reserved for future use
  }

  // Build a single OmniJS script that creates everything in one execution.
  // Use deterministic counter-based variable names throughout.
  const scriptParts: string[] = [
    `var tasksCreated = 0;`,
    `var projectsCreated = 0;`,
    `var errors = [];`,
  ];

  // Optionally create projects (skip existing ones gracefully)
  for (const projName of projectsToCreate) {
    scriptParts.push(`
try {
  var existingProj = flattenedProjects.byName("${escapeJSString(projName)}");
  if (!existingProj) {
    new Project("${escapeJSString(projName)}");
    projectsCreated++;
  }
} catch (e) {
  errors.push("Failed to create project \\"${escapeJSString(projName)}\\": " + String(e));
}`);
  }

  // Create tasks under each project using monotonic counters for variable names
  let projIdx = 0;
  for (const [projName, tasks] of projectTaskMap.entries()) {
    if (tasks.length === 0) continue;

    const projVar = `proj${String(projIdx)}`;
    projIdx++;

    scriptParts.push(`
try {
  var ${projVar} = flattenedProjects.byName("${escapeJSString(projName)}");
  if (!${projVar}) {
    throw new Error("Project not found: ${escapeJSString(projName)}");
  }`);

    let taskIdx = 0;
    for (const task of tasks) {
      const taskVar = `${projVar}_t${String(taskIdx)}`;
      taskIdx++;
      const constructorExpr = `new Task("${escapeJSString(task.name)}", ${projVar}.task.ending)`;
      scriptParts.push(buildTaskPropertyScript(task, constructorExpr, taskVar));
    }

    scriptParts.push(`} catch (e) {
  errors.push("Failed to create tasks in project \\"${escapeJSString(projName)}\\": " + String(e));
}`);
  }

  // Create inbox tasks
  let inboxIdx = 0;
  for (const task of inboxTasks) {
    const taskVar = `inbox_t${String(inboxIdx)}`;
    inboxIdx++;
    const constructorExpr = `new Task("${escapeJSString(task.name)}", inbox.ending)`;
    scriptParts.push(`
try {
  ${buildTaskPropertyScript(task, constructorExpr, taskVar)}
} catch (e) {
  errors.push("Failed to create inbox task \\"${escapeJSString(task.name)}\\": " + String(e));
}`);
  }

  scriptParts.push(`
return JSON.stringify({
  tasksCreated: tasksCreated,
  projectsCreated: projectsCreated,
  errors: errors
});`);

  const body = scriptParts.join("\n");
  const omniResult = await runOmniJSWrapped<ImportResult>(body);

  if (!omniResult.success) {
    return failure(
      omniResult.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to import TaskPaper")
    );
  }

  if (omniResult.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No import result returned")
    );
  }

  return success({
    tasksCreated: omniResult.data.tasksCreated,
    projectsCreated: omniResult.data.projectsCreated,
    errors: omniResult.data.errors,
  });
}

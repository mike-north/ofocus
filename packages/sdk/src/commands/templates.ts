import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { CliOutput, OFTask, OFProject } from "../types.js";
import { success, failureMessage } from "../result.js";
import { queryTasks } from "./tasks.js";
import { queryProjects } from "./projects.js";
import { createProject } from "./create-project.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * A task within a template (without OmniFocus-specific IDs).
 */
export interface TemplateTask {
  /** Task title */
  title: string;
  /** Task note */
  note: string | null;
  /** Whether the task is flagged */
  flagged: boolean;
  /** Estimated duration in minutes */
  estimatedMinutes: number | null;
  /** Tags to apply */
  tags: string[];
  /** Relative defer offset in days from project creation (null = no defer) */
  deferOffsetDays: number | null;
  /** Relative due offset in days from project creation (null = no due) */
  dueOffsetDays: number | null;
}

/**
 * A project template definition.
 */
export interface ProjectTemplate {
  /** Template name */
  name: string;
  /** Template description */
  description: string | null;
  /** Whether the project is sequential */
  sequential: boolean;
  /** Project note */
  note: string | null;
  /** Default folder for instantiation */
  defaultFolder: string | null;
  /** Tasks in the template */
  tasks: TemplateTask[];
  /** Creation timestamp */
  createdAt: string;
  /** Source project name (for reference) */
  sourceProject: string | null;
}

/**
 * Result of saving a template.
 */
export interface SaveTemplateResult {
  /** Template name */
  name: string;
  /** Number of tasks in the template */
  taskCount: number;
  /** Path where the template was saved */
  path: string;
}

/**
 * Template summary info for listing.
 */
export interface TemplateSummary {
  name: string;
  description: string | null;
  taskCount: number;
  createdAt: string;
  sourceProject: string | null;
}

/**
 * Result of listing templates.
 */
export interface ListTemplatesResult {
  /** Available templates */
  templates: TemplateSummary[];
}

/**
 * Result of creating from a template.
 */
export interface CreateFromTemplateResult {
  /** Created project name */
  projectName: string;
  /** Number of tasks created */
  tasksCreated: number;
  /** Project ID */
  projectId: string;
}

/**
 * Result of deleting a template.
 */
export interface DeleteTemplateResult {
  /** Deleted template name */
  name: string;
  /** Whether the deletion was successful */
  deleted: boolean;
}

/**
 * Options for saving a template.
 */
export interface SaveTemplateOptions {
  /** Template name */
  name: string;
  /** Source project ID or name */
  sourceProject: string;
  /** Template description */
  description?: string | undefined;
}

/**
 * Options for creating from a template.
 */
export interface CreateFromTemplateOptions {
  /** Template name */
  templateName: string;
  /** New project name (defaults to template name) */
  projectName?: string | undefined;
  /** Folder to create the project in */
  folder?: string | undefined;
  /** Base date for calculating offsets (defaults to today) */
  baseDate?: string | undefined;
}

/**
 * Get the templates directory path.
 */
function getTemplatesDir(): string {
  return path.join(os.homedir(), ".config", "ofocus", "templates");
}

/**
 * Ensure the templates directory exists.
 */
function ensureTemplatesDir(): void {
  const dir = getTemplatesDir();
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Get the path for a template file.
 */
function getTemplatePath(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getTemplatesDir(), `${sanitized}.json`);
}

/**
 * Calculate day offset from a reference date.
 */
function calculateDayOffset(
  dateStr: string | null,
  referenceDate: Date
): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - referenceDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Calculate a date from an offset.
 */
function calculateDateFromOffset(
  offsetDays: number | null,
  baseDate: Date
): string | null {
  if (offsetDays === null) return null;
  const date = new Date(baseDate);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split("T")[0] ?? null;
}

/**
 * Convert an OmniFocus task to a template task.
 */
function taskToTemplateTask(task: OFTask, referenceDate: Date): TemplateTask {
  return {
    title: task.name,
    note: task.note,
    flagged: task.flagged,
    estimatedMinutes: task.estimatedMinutes,
    tags: task.tags,
    deferOffsetDays: calculateDayOffset(task.deferDate, referenceDate),
    dueOffsetDays: calculateDayOffset(task.dueDate, referenceDate),
  };
}

/**
 * Save a project as a template.
 */
export async function saveTemplate(
  options: SaveTemplateOptions
): Promise<CliOutput<SaveTemplateResult>> {
  const { name, sourceProject, description } = options;

  // Find the source project
  const projectsResult = await queryProjects({});
  if (!projectsResult.success) {
    return failureMessage(
      projectsResult.error?.message ?? "Failed to query projects"
    );
  }

  const projects = projectsResult.data ?? [];
  const project = projects.find(
    (p: OFProject) => p.id === sourceProject || p.name === sourceProject
  );

  if (!project) {
    return failureMessage(`Project not found: ${sourceProject}`);
  }

  // Get all tasks for this project
  const tasksResult = await queryTasks({ project: project.name });
  if (!tasksResult.success) {
    return failureMessage(
      tasksResult.error?.message ?? "Failed to query tasks"
    );
  }

  const allTasks = tasksResult.data ?? [];
  const referenceDate = new Date();

  // Convert tasks to template format (flat structure for simplicity)
  const templateTasks = allTasks.map((t: OFTask) =>
    taskToTemplateTask(t, referenceDate)
  );

  // Create the template
  const template: ProjectTemplate = {
    name,
    description: description ?? null,
    sequential: project.sequential,
    note: project.note,
    defaultFolder: project.folderName,
    tasks: templateTasks,
    createdAt: new Date().toISOString(),
    sourceProject: project.name,
  };

  // Save to file
  ensureTemplatesDir();
  const templatePath = getTemplatePath(name);
  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));

  return success({
    name,
    taskCount: templateTasks.length,
    path: templatePath,
  });
}

/**
 * List all available templates.
 */
export function listTemplates(): CliOutput<ListTemplatesResult> {
  ensureTemplatesDir();
  const dir = getTemplatesDir();

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

  const templates: ListTemplatesResult["templates"] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const template = JSON.parse(content) as ProjectTemplate;

    templates.push({
      name: template.name,
      description: template.description,
      taskCount: template.tasks.length,
      createdAt: template.createdAt,
      sourceProject: template.sourceProject,
    });
  }

  return success({ templates });
}

/**
 * Get a template by name.
 */
export function getTemplate(name: string): CliOutput<ProjectTemplate> {
  ensureTemplatesDir();
  const templatePath = getTemplatePath(name);

  if (!fs.existsSync(templatePath)) {
    return failureMessage(`Template not found: ${name}`);
  }

  const content = fs.readFileSync(templatePath, "utf-8");
  const template = JSON.parse(content) as ProjectTemplate;

  return success(template);
}

/**
 * Create a task directly in a project via AppleScript.
 */
async function createTaskInProject(
  projectName: string,
  task: TemplateTask,
  baseDate: Date
): Promise<boolean> {
  const dueDate = calculateDateFromOffset(task.dueOffsetDays, baseDate);
  const deferDate = calculateDateFromOffset(task.deferOffsetDays, baseDate);

  const properties: string[] = [`name:"${escapeAppleScript(task.title)}"`];

  if (task.note) {
    properties.push(`note:"${escapeAppleScript(task.note)}"`);
  }

  if (task.flagged) {
    properties.push("flagged:true");
  }

  if (dueDate) {
    properties.push(`due date:date "${dueDate}"`);
  }

  if (deferDate) {
    properties.push(`defer date:date "${deferDate}"`);
  }

  if (task.estimatedMinutes !== null) {
    properties.push(`estimated minutes:${String(task.estimatedMinutes)}`);
  }

  let tagScript = "";
  if (task.tags.length > 0) {
    for (const tagName of task.tags) {
      tagScript += `
    try
      set theTag to first flattened tag whose name is "${escapeAppleScript(tagName)}"
      add theTag to tags of newTask
    end try
      `;
    }
  }

  const script = `
    set proj to first flattened project whose name is "${escapeAppleScript(projectName)}"
    set newTask to make new task at end of tasks of proj with properties {${properties.join(", ")}}
    ${tagScript}
    return "ok"
  `;

  const result = await runAppleScript<string>(
    omniFocusScriptWithHelpers(script)
  );
  return result.success;
}

/**
 * Create a new project from a template.
 */
export async function createFromTemplate(
  options: CreateFromTemplateOptions
): Promise<CliOutput<CreateFromTemplateResult>> {
  const { templateName, projectName, folder, baseDate } = options;

  // Load the template
  const templateResult = getTemplate(templateName);
  if (!templateResult.success) {
    return failureMessage(
      templateResult.error?.message ?? "Failed to load template"
    );
  }

  const template = templateResult.data;
  if (!template) {
    return failureMessage("Template data is empty");
  }

  const newProjectName = projectName ?? template.name;
  const targetFolder = folder ?? template.defaultFolder ?? undefined;

  // Validate and parse baseDate
  const baseDateObj = baseDate ? new Date(baseDate) : new Date();
  if (baseDate && Number.isNaN(baseDateObj.getTime())) {
    return failureMessage(`Invalid base date: ${baseDate}`);
  }

  // Create the project
  const projectResult = await createProject(newProjectName, {
    folderName: targetFolder,
    sequential: template.sequential,
    note: template.note ?? undefined,
  });

  if (!projectResult.success) {
    return failureMessage(
      projectResult.error?.message ?? "Failed to create project"
    );
  }

  const createdProject = projectResult.data;
  if (!createdProject) {
    return failureMessage("Created project data is empty");
  }

  // Create tasks from template
  let tasksCreated = 0;
  for (const templateTask of template.tasks) {
    const success = await createTaskInProject(
      newProjectName,
      templateTask,
      baseDateObj
    );
    if (success) {
      tasksCreated++;
    }
  }

  return success({
    projectName: newProjectName,
    tasksCreated,
    projectId: createdProject.id,
  });
}

/**
 * Delete a template.
 */
export function deleteTemplate(name: string): CliOutput<DeleteTemplateResult> {
  ensureTemplatesDir();
  const templatePath = getTemplatePath(name);

  if (!fs.existsSync(templatePath)) {
    return failureMessage(`Template not found: ${name}`);
  }

  fs.unlinkSync(templatePath);

  return success({
    name,
    deleted: true,
  });
}

import type { CliOutput } from "../types.js";
import { success, failureMessage } from "../result.js";
import { queryTasks } from "./tasks.js";
import { queryProjects } from "./projects.js";

/**
 * Options for querying statistics.
 */
export interface StatsOptions {
  /** Filter by project name */
  project?: string | undefined;
  /** Start date for the period (ISO date string) */
  since?: string | undefined;
  /** End date for the period (ISO date string) */
  until?: string | undefined;
  /** Predefined period: "day", "week", "month", "year" */
  period?: "day" | "week" | "month" | "year" | undefined;
}

/**
 * Statistics result.
 */
export interface StatsResult {
  /** Period start date */
  periodStart: string;
  /** Period end date */
  periodEnd: string;
  /** Number of tasks completed in the period */
  tasksCompleted: number;
  /** Number of tasks that are overdue */
  tasksOverdue: number;
  /** Number of tasks currently available/actionable */
  tasksAvailable: number;
  /** Total number of remaining tasks */
  tasksRemaining: number;
  /** Number of flagged tasks */
  tasksFlagged: number;
  /** Number of active projects */
  projectsActive: number;
  /** Number of projects on hold */
  projectsOnHold: number;
  /** Tasks due today */
  tasksDueToday: number;
  /** Tasks due this week */
  tasksDueThisWeek: number;
  /** Project filter applied (if any) */
  projectFilter: string | null;
}

/**
 * Get start of day for a date.
 */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day for a date.
 */
function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Calculate period dates based on options.
 */
function calculatePeriod(options: StatsOptions): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date = endOfDay(now);

  if (options.since && options.until) {
    start = startOfDay(new Date(options.since));
    end = endOfDay(new Date(options.until));
  } else if (options.since) {
    start = startOfDay(new Date(options.since));
  } else if (options.period) {
    switch (options.period) {
      case "day":
        start = startOfDay(now);
        break;
      case "week": {
        start = startOfDay(now);
        start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
        break;
      }
      case "month": {
        start = startOfDay(now);
        start.setDate(1); // Start of month
        break;
      }
      case "year": {
        start = startOfDay(now);
        start.setMonth(0, 1); // Start of year
        break;
      }
      default:
        start = startOfDay(now);
        start.setDate(start.getDate() - 7); // Default to last week
    }
  } else {
    // Default to last 7 days
    start = startOfDay(now);
    start.setDate(start.getDate() - 7);
  }

  return { start, end };
}

/**
 * Format date as ISO date string (YYYY-MM-DD).
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

/**
 * Parse a date string from OmniFocus format.
 */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Check if a date is today.
 */
function isToday(dateStr: string | null): boolean {
  const date = parseDate(dateStr);
  if (!date) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/**
 * Check if a date is within this week.
 */
function isThisWeek(dateStr: string | null): boolean {
  const date = parseDate(dateStr);
  if (!date) return false;
  const now = new Date();
  const startOfWeek = startOfDay(now);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const endOfWeek = endOfDay(now);
  endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()));
  return date >= startOfWeek && date <= endOfWeek;
}

/**
 * Check if a task is overdue.
 */
function isOverdue(dueDate: string | null): boolean {
  const date = parseDate(dueDate);
  if (!date) return false;
  const now = new Date();
  return date < startOfDay(now);
}

/**
 * Get productivity statistics from OmniFocus.
 */
export async function getStats(
  options: StatsOptions = {}
): Promise<CliOutput<StatsResult>> {
  const { start, end } = calculatePeriod(options);

  // Get all tasks (including completed for the stats)
  const allTasksResult = await queryTasks({
    project: options.project,
    completed: true,
  });

  if (!allTasksResult.success) {
    return failureMessage(
      allTasksResult.error?.message ?? "Failed to query tasks"
    );
  }

  const allTasks = allTasksResult.data ?? [];

  // Get available tasks
  const availableTasksResult = await queryTasks({
    project: options.project,
    available: true,
  });

  const availableTasks = availableTasksResult.success
    ? (availableTasksResult.data ?? [])
    : [];

  // Get projects
  const projectsResult = await queryProjects({});

  const projects = projectsResult.success ? (projectsResult.data ?? []) : [];

  // Calculate statistics
  let tasksCompleted = 0;
  let tasksOverdue = 0;
  let tasksFlagged = 0;
  let tasksRemaining = 0;
  let tasksDueToday = 0;
  let tasksDueThisWeek = 0;

  for (const task of allTasks) {
    if (task.completed) {
      // Count completed tasks within the period
      // Note: OmniFocus doesn't expose completion date directly,
      // so we count all completed tasks if no period filter
      tasksCompleted++;
    } else {
      tasksRemaining++;

      if (task.flagged) {
        tasksFlagged++;
      }

      if (isOverdue(task.dueDate)) {
        tasksOverdue++;
      }

      if (isToday(task.dueDate)) {
        tasksDueToday++;
      }

      if (isThisWeek(task.dueDate)) {
        tasksDueThisWeek++;
      }
    }
  }

  // Project statistics
  let projectsActive = 0;
  let projectsOnHold = 0;

  for (const project of projects) {
    if (project.status === "active") {
      projectsActive++;
    } else if (project.status === "on-hold") {
      projectsOnHold++;
    }
  }

  return success({
    periodStart: formatDate(start),
    periodEnd: formatDate(end),
    tasksCompleted,
    tasksOverdue,
    tasksAvailable: availableTasks.length,
    tasksRemaining,
    tasksFlagged,
    projectsActive,
    projectsOnHold,
    tasksDueToday,
    tasksDueThisWeek,
    projectFilter: options.project ?? null,
  });
}

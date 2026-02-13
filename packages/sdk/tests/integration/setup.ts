/**
 * Integration test utilities for OmniFocus SDK
 *
 * Provides a test context that:
 * - Generates unique test names with the __OFOCUS_TEST__ prefix
 * - Tracks all created items for cleanup
 * - Cleans up in the correct dependency order
 */

import {
  deleteTask,
  deleteProject,
  deleteFolder,
  deleteTag,
  queryTasks,
  queryProjects,
  queryFolders,
  queryTags,
} from "../../src/index.js";

/**
 * Test naming convention prefix
 * All test items are named: __OFOCUS_TEST__{timestamp}__{description}
 */
export const TEST_PREFIX = "__OFOCUS_TEST__";

/**
 * Generates an ISO timestamp suitable for test names (no colons)
 */
function generateTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
}

/**
 * Integration test context that tracks created items and handles cleanup
 */
export class IntegrationTestContext {
  private readonly createdTasks: string[] = [];
  private readonly createdProjects: string[] = [];
  private readonly createdFolders: string[] = [];
  private readonly createdTags: string[] = [];
  private readonly testTimestamp: string;

  constructor() {
    this.testTimestamp = generateTimestamp();
  }

  /**
   * Generate a unique test name following the naming convention
   */
  generateName(description: string): string {
    const sanitized = description.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
    return `${TEST_PREFIX}${this.testTimestamp}__${sanitized}`;
  }

  /**
   * Track a created task for later cleanup
   */
  trackTask(id: string): void {
    this.createdTasks.push(id);
  }

  /**
   * Track a created project for later cleanup
   */
  trackProject(id: string): void {
    this.createdProjects.push(id);
  }

  /**
   * Track a created folder for later cleanup
   */
  trackFolder(id: string): void {
    this.createdFolders.push(id);
  }

  /**
   * Track a created tag for later cleanup
   */
  trackTag(id: string): void {
    this.createdTags.push(id);
  }

  /**
   * Get the list of tracked tasks (for debugging)
   */
  getTrackedTasks(): readonly string[] {
    return this.createdTasks;
  }

  /**
   * Get the list of tracked projects (for debugging)
   */
  getTrackedProjects(): readonly string[] {
    return this.createdProjects;
  }

  /**
   * Get the list of tracked folders (for debugging)
   */
  getTrackedFolders(): readonly string[] {
    return this.createdFolders;
  }

  /**
   * Get the list of tracked tags (for debugging)
   */
  getTrackedTags(): readonly string[] {
    return this.createdTags;
  }

  /**
   * Clean up all tracked items in the correct order:
   * 1. Tasks (no dependencies)
   * 2. Projects (may have contained tasks)
   * 3. Folders (may have contained projects)
   * 4. Tags (independent)
   *
   * Deletion is attempted for all items, collecting errors rather than failing fast
   */
  async cleanup(): Promise<CleanupResult> {
    const errors: CleanupError[] = [];

    // 1. Delete tasks first (reverse order to handle any subtask relationships)
    for (const taskId of [...this.createdTasks].reverse()) {
      try {
        const result = await deleteTask(taskId);
        if (!result.success) {
          // Task may already be deleted or not exist - that's okay
          if (!result.error?.message?.includes("not found")) {
            errors.push({
              type: "task",
              id: taskId,
              error: result.error?.message ?? "Unknown error",
            });
          }
        }
      } catch (e) {
        errors.push({
          type: "task",
          id: taskId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    this.createdTasks.length = 0;

    // 2. Delete projects (reverse order)
    for (const projectId of [...this.createdProjects].reverse()) {
      try {
        const result = await deleteProject(projectId);
        if (!result.success) {
          if (!result.error?.message?.includes("not found")) {
            errors.push({
              type: "project",
              id: projectId,
              error: result.error?.message ?? "Unknown error",
            });
          }
        }
      } catch (e) {
        errors.push({
          type: "project",
          id: projectId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    this.createdProjects.length = 0;

    // 3. Delete folders (reverse order to handle nested folders)
    for (const folderId of [...this.createdFolders].reverse()) {
      try {
        const result = await deleteFolder(folderId);
        if (!result.success) {
          if (!result.error?.message?.includes("not found")) {
            errors.push({
              type: "folder",
              id: folderId,
              error: result.error?.message ?? "Unknown error",
            });
          }
        }
      } catch (e) {
        errors.push({
          type: "folder",
          id: folderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    this.createdFolders.length = 0;

    // 4. Delete tags (reverse order to handle nested tags)
    for (const tagId of [...this.createdTags].reverse()) {
      try {
        const result = await deleteTag(tagId);
        if (!result.success) {
          if (!result.error?.message?.includes("not found")) {
            errors.push({
              type: "tag",
              id: tagId,
              error: result.error?.message ?? "Unknown error",
            });
          }
        }
      } catch (e) {
        errors.push({
          type: "tag",
          id: tagId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    this.createdTags.length = 0;

    return {
      success: errors.length === 0,
      errors,
    };
  }
}

export interface CleanupError {
  type: "task" | "project" | "folder" | "tag";
  id: string;
  error: string;
}

export interface CleanupResult {
  success: boolean;
  errors: CleanupError[];
}

/**
 * Find all test items in OmniFocus matching the test prefix
 */
export async function findTestItems(): Promise<FoundTestItems> {
  const tasks: FoundItem[] = [];
  const projects: FoundItem[] = [];
  const folders: FoundItem[] = [];
  const tags: FoundItem[] = [];

  // Query all items and filter by test prefix
  // Use high limits to ensure we find all test items
  const [tasksResult, projectsResult, foldersResult, tagsResult] =
    await Promise.all([
      queryTasks({ limit: 10000 }),
      queryProjects({ limit: 10000 }),
      queryFolders({ limit: 10000 }),
      queryTags({ limit: 10000 }),
    ]);

  if (tasksResult.success && tasksResult.data) {
    for (const task of tasksResult.data.items) {
      if (task.name.startsWith(TEST_PREFIX)) {
        tasks.push({ id: task.id, name: task.name });
      }
    }
  }

  if (projectsResult.success && projectsResult.data) {
    for (const project of projectsResult.data.items) {
      if (project.name.startsWith(TEST_PREFIX)) {
        projects.push({ id: project.id, name: project.name });
      }
    }
  }

  if (foldersResult.success && foldersResult.data) {
    for (const folder of foldersResult.data.items) {
      if (folder.name.startsWith(TEST_PREFIX)) {
        folders.push({ id: folder.id, name: folder.name });
      }
    }
  }

  if (tagsResult.success && tagsResult.data) {
    for (const tag of tagsResult.data.items) {
      if (tag.name.startsWith(TEST_PREFIX)) {
        tags.push({ id: tag.id, name: tag.name });
      }
    }
  }

  return { tasks, projects, folders, tags };
}

export interface FoundItem {
  id: string;
  name: string;
}

export interface FoundTestItems {
  tasks: FoundItem[];
  projects: FoundItem[];
  folders: FoundItem[];
  tags: FoundItem[];
}

/**
 * Delete all found test items
 */
export async function deleteTestItems(
  items: FoundTestItems
): Promise<CleanupResult> {
  const ctx = new IntegrationTestContext();

  // Track items in correct order
  for (const tag of items.tags) {
    ctx.trackTag(tag.id);
  }
  for (const folder of items.folders) {
    ctx.trackFolder(folder.id);
  }
  for (const project of items.projects) {
    ctx.trackProject(project.id);
  }
  for (const task of items.tasks) {
    ctx.trackTask(task.id);
  }

  return ctx.cleanup();
}

/**
 * Wait for a specified duration (useful for rate limiting)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelay?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 100 } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts) {
        await sleep(baseDelay * Math.pow(2, attempt - 1));
      }
    }
  }

  throw lastError;
}

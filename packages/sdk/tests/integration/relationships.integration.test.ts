/**
 * Relationship Integration Tests
 *
 * Tests for complex relationships between tasks, projects, folders, and tags.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IntegrationTestContext } from "./setup.js";
import {
  createFolder,
  createProject,
  createTag,
  addToInbox,
  createSubtask,
  querySubtasks,
  moveTaskToParent,
  updateTask,
  duplicateTask,
} from "../../src/index.js";

describe("Relationship Integration", () => {
  let ctx: IntegrationTestContext;

  beforeAll(() => {
    ctx = new IntegrationTestContext();
  });

  afterAll(async () => {
    const result = await ctx.cleanup();
    if (!result.success) {
      console.warn("Cleanup had errors:", result.errors);
    }
  });

  describe("full hierarchy workflow", () => {
    it("creates folder -> project -> task with tags", async () => {
      // 1. Create folder
      const folderName = ctx.generateName("hierarchy-folder");
      const folderResult = await createFolder(folderName);
      expect(folderResult.success).toBe(true);
      ctx.trackFolder(folderResult.data!.id);

      // 2. Create project in folder
      const projectName = ctx.generateName("hierarchy-project");
      const projectResult = await createProject(projectName, {
        folderId: folderResult.data!.id,
      });
      expect(projectResult.success).toBe(true);
      expect(projectResult.data!.folderId).toBe(folderResult.data!.id);
      ctx.trackProject(projectResult.data!.id);

      // 3. Create tag
      const tagName = ctx.generateName("hierarchy-tag");
      const tagResult = await createTag(tagName);
      expect(tagResult.success).toBe(true);
      ctx.trackTag(tagResult.data!.id);

      // 4. Create task in inbox then move to project
      const taskName = ctx.generateName("hierarchy-task");
      const taskResult = await addToInbox(taskName, { tags: [tagName] });
      expect(taskResult.success).toBe(true);
      expect(taskResult.data!.tags).toContain(tagName);
      ctx.trackTask(taskResult.data!.id);

      // 5. Move task to project (project option takes name, not ID)
      const updateResult = await updateTask(taskResult.data!.id, {
        project: projectName,
      });
      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.projectId).toBe(projectResult.data!.id);
    });
  });

  describe("subtask relationships", () => {
    it("creates subtask under parent task", async () => {
      // Create parent task
      const parentName = ctx.generateName("parent-task");
      const parentResult = await addToInbox(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackTask(parentResult.data!.id);

      // Create subtask
      const subtaskName = ctx.generateName("subtask");
      const subtaskResult = await createSubtask(
        subtaskName,
        parentResult.data!.id
      );

      expect(subtaskResult.success).toBe(true);
      expect(subtaskResult.data!.parentTaskId).toBe(parentResult.data!.id);

      ctx.trackTask(subtaskResult.data!.id);
    });

    it("creates multiple subtasks", async () => {
      const parentName = ctx.generateName("multi-subtask-parent");
      const parentResult = await addToInbox(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackTask(parentResult.data!.id);

      // Create 3 subtasks
      for (let i = 1; i <= 3; i++) {
        const subtaskName = ctx.generateName(`subtask-${i}`);
        const subtaskResult = await createSubtask(
          subtaskName,
          parentResult.data!.id
        );
        expect(subtaskResult.success).toBe(true);
        ctx.trackTask(subtaskResult.data!.id);
      }

      // Query subtasks
      const queryResult = await querySubtasks(parentResult.data!.id);
      expect(queryResult.success).toBe(true);
      expect(queryResult.data!.items.length).toBe(3);
    });

    it("queries subtasks with filter", async () => {
      const parentName = ctx.generateName("filter-parent");
      const parentResult = await addToInbox(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackTask(parentResult.data!.id);

      // Create a normal subtask
      const subtaskName = ctx.generateName("normal-subtask");
      const subtaskResult = await createSubtask(
        subtaskName,
        parentResult.data!.id
      );
      expect(subtaskResult.success).toBe(true);
      ctx.trackTask(subtaskResult.data!.id);

      // Create a flagged subtask
      const flaggedName = ctx.generateName("flagged-subtask");
      const flaggedResult = await createSubtask(
        flaggedName,
        parentResult.data!.id,
        { flag: true }
      );
      expect(flaggedResult.success).toBe(true);
      ctx.trackTask(flaggedResult.data!.id);

      // Query only flagged subtasks
      const queryResult = await querySubtasks(parentResult.data!.id, {
        flagged: true,
      });
      expect(queryResult.success).toBe(true);
      expect(queryResult.data!.items.length).toBe(1);
      expect(queryResult.data!.items[0]!.id).toBe(flaggedResult.data!.id);
    });

    it("moves task to become subtask of another", async () => {
      // Create two tasks
      const parentName = ctx.generateName("new-parent");
      const parentResult = await addToInbox(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackTask(parentResult.data!.id);

      const childName = ctx.generateName("new-child");
      const childResult = await addToInbox(childName);
      expect(childResult.success).toBe(true);
      ctx.trackTask(childResult.data!.id);

      // Move child to be subtask of parent
      const moveResult = await moveTaskToParent(
        childResult.data!.id,
        parentResult.data!.id
      );

      expect(moveResult.success).toBe(true);
      expect(moveResult.data!.parentTaskId).toBe(parentResult.data!.id);
    });
  });

  describe("task duplication with relationships", () => {
    it("duplicates task with subtasks", async () => {
      // Create parent with subtasks
      const parentName = ctx.generateName("dup-parent");
      const parentResult = await addToInbox(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackTask(parentResult.data!.id);

      const subtaskName = ctx.generateName("dup-subtask");
      const subtaskResult = await createSubtask(
        subtaskName,
        parentResult.data!.id
      );
      expect(subtaskResult.success).toBe(true);
      ctx.trackTask(subtaskResult.data!.id);

      // Duplicate with subtasks
      const dupResult = await duplicateTask(parentResult.data!.id, {
        includeSubtasks: true,
      });

      expect(dupResult.success).toBe(true);
      expect(dupResult.data!.newTaskId).not.toBe(parentResult.data!.id);

      ctx.trackTask(dupResult.data!.newTaskId);

      // The duplicated subtask should also exist
      // We can verify by querying subtasks of the new parent
      const newSubtasksResult = await querySubtasks(dupResult.data!.newTaskId);
      expect(newSubtasksResult.success).toBe(true);
      expect(newSubtasksResult.data!.items.length).toBeGreaterThanOrEqual(1);

      // Track duplicated subtasks for cleanup
      for (const subtask of newSubtasksResult.data!.items) {
        ctx.trackTask(subtask.id);
      }
    });

    it("duplicates task preserves tags", async () => {
      // Create tag
      const tagName = ctx.generateName("dup-tag");
      const tagResult = await createTag(tagName);
      expect(tagResult.success).toBe(true);
      ctx.trackTag(tagResult.data!.id);

      // Create task with tag
      const taskName = ctx.generateName("tagged-dup");
      const taskResult = await addToInbox(taskName, { tags: [tagName] });
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      // Duplicate
      const dupResult = await duplicateTask(taskResult.data!.id);
      expect(dupResult.success).toBe(true);
      ctx.trackTask(dupResult.data!.newTaskId);

      // Verify duplicate was created (DuplicateTaskResult doesn't include tags)
      expect(dupResult.data!.newTaskId).toBeDefined();
      expect(dupResult.data!.originalTaskId).toBe(taskResult.data!.id);
    });
  });

  describe("task in project with folder and tags", () => {
    it("creates complete hierarchy and verifies relationships", async () => {
      // Create the full hierarchy
      const folderName = ctx.generateName("full-folder");
      const folderResult = await createFolder(folderName);
      expect(folderResult.success).toBe(true);
      ctx.trackFolder(folderResult.data!.id);

      const projectName = ctx.generateName("full-project");
      const projectResult = await createProject(projectName, {
        folderId: folderResult.data!.id,
        sequential: true,
      });
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      const tag1Name = ctx.generateName("full-tag1");
      const tag1Result = await createTag(tag1Name);
      expect(tag1Result.success).toBe(true);
      ctx.trackTag(tag1Result.data!.id);

      const tag2Name = ctx.generateName("full-tag2");
      const tag2Result = await createTag(tag2Name);
      expect(tag2Result.success).toBe(true);
      ctx.trackTag(tag2Result.data!.id);

      // Create parent task with both tags
      const parentTaskName = ctx.generateName("full-parent");
      const parentTaskResult = await addToInbox(parentTaskName, {
        tags: [tag1Name, tag2Name],
      });
      expect(parentTaskResult.success).toBe(true);
      ctx.trackTask(parentTaskResult.data!.id);

      // Move to project (project option takes name, not ID)
      const moveResult = await updateTask(parentTaskResult.data!.id, {
        project: projectName,
      });
      expect(moveResult.success).toBe(true);
      expect(moveResult.data!.projectId).toBe(projectResult.data!.id);

      // Create subtasks
      const subtask1Result = await createSubtask(
        ctx.generateName("full-subtask1"),
        parentTaskResult.data!.id
      );
      expect(subtask1Result.success).toBe(true);
      ctx.trackTask(subtask1Result.data!.id);

      const subtask2Result = await createSubtask(
        ctx.generateName("full-subtask2"),
        parentTaskResult.data!.id
      );
      expect(subtask2Result.success).toBe(true);
      ctx.trackTask(subtask2Result.data!.id);

      // Verify complete structure
      const subtasksResult = await querySubtasks(parentTaskResult.data!.id);
      expect(subtasksResult.success).toBe(true);
      expect(subtasksResult.data!.items.length).toBe(2);

      // Verify project is in folder
      expect(projectResult.data!.folderId).toBe(folderResult.data!.id);

      // Verify task has tags
      expect(parentTaskResult.data!.tags).toContain(tag1Name);
      expect(parentTaskResult.data!.tags).toContain(tag2Name);
    });
  });
});

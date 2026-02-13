/**
 * Task Integration Tests
 *
 * Tests for inbox tasks, task CRUD, queries, and task operations against live OmniFocus.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { IntegrationTestContext, sleep } from "./setup.js";
import {
  addToInbox,
  queryTasks,
  updateTask,
  completeTask,
  deleteTask,
  deferTask,
  duplicateTask,
  searchTasks,
  dropTask,
} from "../../src/index.js";

describe("Task Integration", () => {
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

  describe("inbox operations", () => {
    it("creates a basic inbox task", async () => {
      const name = ctx.generateName("basic-inbox");
      const result = await addToInbox(name);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBeDefined();
      expect(result.data!.name).toBe(name);
      expect(result.data!.completed).toBe(false);

      ctx.trackTask(result.data!.id);
    });

    it("creates inbox task with note", async () => {
      const name = ctx.generateName("task-with-note");
      const note = "This is a test note with special chars: é, ñ, 中文";

      const result = await addToInbox(name, { note });

      expect(result.success).toBe(true);
      expect(result.data!.note).toBe(note);

      ctx.trackTask(result.data!.id);
    });

    it("creates inbox task with flag", async () => {
      const name = ctx.generateName("flagged-task");

      const result = await addToInbox(name, { flag: true });

      expect(result.success).toBe(true);
      expect(result.data!.flagged).toBe(true);

      ctx.trackTask(result.data!.id);
    });

    it("creates inbox task with due date", async () => {
      const name = ctx.generateName("task-due-date");
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueDate = tomorrow.toISOString().split("T")[0]!;

      const result = await addToInbox(name, { due: dueDate });

      expect(result.success).toBe(true);
      expect(result.data!.dueDate).toBeDefined();

      ctx.trackTask(result.data!.id);
    });

    it("creates inbox task with defer date", async () => {
      const name = ctx.generateName("task-defer-date");
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const deferDate = nextWeek.toISOString().split("T")[0]!;

      const result = await addToInbox(name, { defer: deferDate });

      expect(result.success).toBe(true);
      expect(result.data!.deferDate).toBeDefined();

      ctx.trackTask(result.data!.id);
    });

    it("creates inbox task with estimated minutes", async () => {
      const name = ctx.generateName("task-estimate");

      const result = await addToInbox(name, { estimatedMinutes: 30 });

      expect(result.success).toBe(true);
      expect(result.data!.estimatedMinutes).toBe(30);

      ctx.trackTask(result.data!.id);
    });

    it("creates inbox task with all options", async () => {
      const name = ctx.generateName("task-all-options");
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = await addToInbox(name, {
        note: "Full featured task",
        flag: true,
        due: tomorrow.toISOString().split("T")[0],
        estimatedMinutes: 45,
      });

      expect(result.success).toBe(true);
      expect(result.data!.note).toBe("Full featured task");
      expect(result.data!.flagged).toBe(true);
      expect(result.data!.dueDate).toBeDefined();
      expect(result.data!.estimatedMinutes).toBe(45);

      ctx.trackTask(result.data!.id);
    });
  });

  describe("task queries", () => {
    let testTaskId: string;

    beforeEach(async () => {
      const name = ctx.generateName("query-test");
      const result = await addToInbox(name, { flag: true });
      expect(result.success).toBe(true);
      testTaskId = result.data!.id;
      ctx.trackTask(testTaskId);
    });

    it("queries flagged tasks and finds test task", async () => {
      // Query flagged tasks (faster than querying all tasks in large databases)
      const result = await queryTasks({ flagged: true });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.items).toBeDefined();

      const found = result.data!.items.find((t) => t.id === testTaskId);
      expect(found).toBeDefined();
    });

    it("queries flagged tasks", async () => {
      const result = await queryTasks({ flagged: true });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.items).toBeDefined();

      const found = result.data!.items.find((t) => t.id === testTaskId);
      expect(found).toBeDefined();
    });
  });

  describe("task updates", () => {
    it("updates task title", async () => {
      const name = ctx.generateName("update-title");
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      const newName = ctx.generateName("updated-title");
      const updateResult = await updateTask(createResult.data!.id, {
        title: newName,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.name).toBe(newName);
    });

    it("updates task note", async () => {
      const name = ctx.generateName("update-note");
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      const updateResult = await updateTask(createResult.data!.id, {
        note: "Updated note content",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.note).toBe("Updated note content");
    });

    it("updates task flag", async () => {
      const name = ctx.generateName("update-flag");
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      // Flag it
      const flagResult = await updateTask(createResult.data!.id, {
        flag: true,
      });
      expect(flagResult.success).toBe(true);
      expect(flagResult.data!.flagged).toBe(true);

      // Unflag it
      const unflagResult = await updateTask(createResult.data!.id, {
        flag: false,
      });
      expect(unflagResult.success).toBe(true);
      expect(unflagResult.data!.flagged).toBe(false);
    });

    it("updates task due date", async () => {
      const name = ctx.generateName("update-due");
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const dueDate = nextMonth.toISOString().split("T")[0]!;

      const updateResult = await updateTask(createResult.data!.id, {
        due: dueDate,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.dueDate).toBeDefined();
    });

    it("updates task estimated minutes", async () => {
      const name = ctx.generateName("update-estimate");
      const createResult = await addToInbox(name, { estimatedMinutes: 15 });
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      const updateResult = await updateTask(createResult.data!.id, {
        estimatedMinutes: 60,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.estimatedMinutes).toBe(60);
    });
  });

  describe("task completion", () => {
    it("completes a task", async () => {
      const name = ctx.generateName("complete-task");
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      const completeResult = await completeTask(createResult.data!.id);

      expect(completeResult.success).toBe(true);
      expect(completeResult.data!.completed).toBe(true);
    });

    it("drops a task", async () => {
      const name = ctx.generateName("drop-task");
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      const dropResult = await dropTask(createResult.data!.id);

      expect(dropResult.success).toBe(true);
      expect(dropResult.data!.dropped).toBe(true);
    });
  });

  describe("task deferral", () => {
    it("defers task by days", async () => {
      const name = ctx.generateName("defer-days");
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      const deferResult = await deferTask(createResult.data!.id, { days: 3 });

      expect(deferResult.success).toBe(true);
      expect(deferResult.data!.newDeferDate).toBeDefined();
    });

    it("defers task to specific date", async () => {
      const name = ctx.generateName("defer-date");
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);
      const targetDate = futureDate.toISOString().split("T")[0]!;

      const deferResult = await deferTask(createResult.data!.id, {
        to: targetDate,
      });

      expect(deferResult.success).toBe(true);
      expect(deferResult.data!.newDeferDate).toBeDefined();
    });
  });

  describe("task duplication", () => {
    it("duplicates a task", async () => {
      const name = ctx.generateName("duplicate-original");
      const createResult = await addToInbox(name, {
        note: "Original note",
        flag: true,
        estimatedMinutes: 25,
      });
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      const duplicateResult = await duplicateTask(createResult.data!.id);

      expect(duplicateResult.success).toBe(true);
      expect(duplicateResult.data!.newTaskId).not.toBe(createResult.data!.id);
      expect(duplicateResult.data!.originalTaskId).toBe(createResult.data!.id);
      expect(duplicateResult.data!.newTaskName).toContain(name);

      ctx.trackTask(duplicateResult.data!.newTaskId);
    });
  });

  describe("task search", () => {
    it("searches for tasks by name", async () => {
      const uniqueToken = `search${Date.now()}`;
      const name = ctx.generateName(`searchable-${uniqueToken}`);
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      ctx.trackTask(createResult.data!.id);

      // Give OmniFocus a moment to index
      await sleep(500);

      const searchResult = await searchTasks(uniqueToken);

      expect(searchResult.success).toBe(true);
      expect(searchResult.data).toBeDefined();

      const found = searchResult.data!.find(
        (t) => t.id === createResult.data!.id
      );
      expect(found).toBeDefined();
    });
  });

  describe("task deletion", () => {
    it("deletes a task", async () => {
      const name = ctx.generateName("delete-task");
      const createResult = await addToInbox(name);
      expect(createResult.success).toBe(true);
      const taskId = createResult.data!.id;

      const deleteResult = await deleteTask(taskId);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data!.deleted).toBe(true);

      // Verify task is gone
      const queryResult = await queryTasks({});
      const found = queryResult.data?.items.find((t) => t.id === taskId);
      expect(found).toBeUndefined();

      // Don't track - it's already deleted
    });
  });
});

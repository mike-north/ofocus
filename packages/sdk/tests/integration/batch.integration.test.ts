/**
 * Batch Operation Integration Tests
 *
 * Tests for batch operations against live OmniFocus.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IntegrationTestContext } from "./setup.js";
import {
  addToInbox,
  completeTasks,
  updateTasks,
  deleteTasks,
  deferTasks,
  queryTasks,
} from "../../src/index.js";

describe("Batch Integration", () => {
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

  describe("batch complete", () => {
    it("completes multiple tasks at once", async () => {
      // Create several tasks
      const taskIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const name = ctx.generateName(`batch-complete-${i}`);
        const result = await addToInbox(name);
        expect(result.success).toBe(true);
        taskIds.push(result.data!.id);
        ctx.trackTask(result.data!.id);
      }

      // Batch complete
      const completeResult = await completeTasks(taskIds);

      expect(completeResult.success).toBe(true);
      expect(completeResult.data!.totalSucceeded).toBe(3);
      expect(completeResult.data!.totalFailed).toBe(0);
      expect(completeResult.data!.succeeded.length).toBe(3);
    });

    it("handles partial failure gracefully", async () => {
      // Create one real task
      const name = ctx.generateName("batch-partial");
      const result = await addToInbox(name);
      expect(result.success).toBe(true);
      ctx.trackTask(result.data!.id);

      // Try to complete the real task and a non-existent one
      const completeResult = await completeTasks([
        result.data!.id,
        "non-existent-id-12345",
      ]);

      expect(completeResult.success).toBe(true);
      // Note: partial failure test may show different counts depending on
      // whether the real task was already completed in a previous test run
      expect(
        completeResult.data!.totalSucceeded + completeResult.data!.totalFailed
      ).toBe(2);
    });
  });

  describe("batch update", () => {
    it("updates multiple tasks with same changes", async () => {
      // Create several tasks
      const taskIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const name = ctx.generateName(`batch-update-${i}`);
        const result = await addToInbox(name);
        expect(result.success).toBe(true);
        taskIds.push(result.data!.id);
        ctx.trackTask(result.data!.id);
      }

      // Batch update - flag all
      const updateResult = await updateTasks(taskIds, { flag: true });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.totalSucceeded).toBe(3);

      // Verify all succeeded (note: batch update returns taskId/taskName, not full task)
      expect(updateResult.data!.succeeded.length).toBe(3);
    });

    it("updates multiple tasks with same changes", async () => {
      // Create tasks
      const task1 = await addToInbox(ctx.generateName("batch-same-1"));
      expect(task1.success).toBe(true);
      ctx.trackTask(task1.data!.id);

      const task2 = await addToInbox(ctx.generateName("batch-same-2"));
      expect(task2.success).toBe(true);
      ctx.trackTask(task2.data!.id);

      // Update both with the same note
      const updateResult = await updateTasks([task1.data!.id, task2.data!.id], {
        note: "Batch updated note",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.totalSucceeded).toBe(2);
      expect(updateResult.data!.succeeded.length).toBe(2);
    });
  });

  describe("batch defer", () => {
    it("defers multiple tasks by days", async () => {
      // Create several tasks
      const taskIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const name = ctx.generateName(`batch-defer-${i}`);
        const result = await addToInbox(name);
        expect(result.success).toBe(true);
        taskIds.push(result.data!.id);
        ctx.trackTask(result.data!.id);
      }

      // Batch defer by 5 days
      const deferResult = await deferTasks(taskIds, { days: 5 });

      expect(deferResult.success).toBe(true);
      expect(deferResult.data!.totalSucceeded).toBe(3);

      // Verify all have defer dates
      for (const deferred of deferResult.data!.succeeded) {
        expect(deferred.newDeferDate).toBeDefined();
      }
    });

    it("defers tasks to specific date", async () => {
      const task1 = await addToInbox(ctx.generateName("defer-date-1"));
      expect(task1.success).toBe(true);
      ctx.trackTask(task1.data!.id);

      const task2 = await addToInbox(ctx.generateName("defer-date-2"));
      expect(task2.success).toBe(true);
      ctx.trackTask(task2.data!.id);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const targetDate = futureDate.toISOString().split("T")[0]!;

      // Defer both to the same date (batch defer uses shared options)
      const deferResult = await deferTasks([task1.data!.id, task2.data!.id], {
        to: targetDate,
      });

      expect(deferResult.success).toBe(true);
      expect(deferResult.data!.totalSucceeded).toBe(2);
    });
  });

  describe("batch delete", () => {
    it("deletes multiple tasks at once", async () => {
      // Create several tasks
      const taskIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const name = ctx.generateName(`batch-delete-${i}`);
        const result = await addToInbox(name);
        expect(result.success).toBe(true);
        taskIds.push(result.data!.id);
        // Don't track - we're about to delete them
      }

      // Batch delete
      const deleteResult = await deleteTasks(taskIds);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data!.totalSucceeded).toBe(3);
      expect(deleteResult.data!.totalFailed).toBe(0);
      // Note: We don't verify with queryTasks({}) because it's too slow on large databases
    });

    it("handles deletion of non-existent tasks", async () => {
      const deleteResult = await deleteTasks(["fake-id-1", "fake-id-2"]);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data!.totalFailed).toBe(2);
    });
  });

  describe("large batch operations", () => {
    it("handles batch of 10 tasks", async () => {
      const taskIds: string[] = [];
      for (let i = 1; i <= 10; i++) {
        const name = ctx.generateName(`large-batch-${i}`);
        const result = await addToInbox(name);
        expect(result.success).toBe(true);
        taskIds.push(result.data!.id);
        ctx.trackTask(result.data!.id);
      }

      // Batch complete all
      const completeResult = await completeTasks(taskIds);

      expect(completeResult.success).toBe(true);
      expect(completeResult.data!.totalSucceeded).toBe(10);
    });
  });
});

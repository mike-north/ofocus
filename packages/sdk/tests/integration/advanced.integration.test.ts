/**
 * Advanced Feature Integration Tests
 *
 * Tests for advanced features like focus, forecast, perspectives, and sync.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IntegrationTestContext, sleep } from "./setup.js";
import {
  addToInbox,
  createProject,
  focus,
  unfocus,
  getFocused,
  queryForecast,
  queryDeferred,
  listPerspectives,
  queryPerspective,
  getSyncStatus,
  generateUrl,
  searchTasks,
} from "../../src/index.js";

describe("Advanced Integration", () => {
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

  describe("focus operations", () => {
    it("focuses and unfocuses a project", async () => {
      const projectName = ctx.generateName("focus-project");
      const projectResult = await createProject(projectName);
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      // Focus the project (by name)
      // Note: Focus operations require OmniFocus window to be open
      const focusResult = await focus(projectName);
      if (!focusResult.success) {
        // Focus requires OmniFocus window to be open - skip test gracefully
        const errorDetails = focusResult.error?.details ?? "";
        if (
          errorDetails.includes("document window") ||
          errorDetails.includes("-1700")
        ) {
          console.warn("Skipping focus test: OmniFocus window not open");
          return;
        }
        // Some other error - fail the test
        expect.fail(`Unexpected focus error: ${focusResult.error?.message}`);
      }
      expect(focusResult.data!.focused).toBe(true);

      // Verify it's focused
      const focusedResult = await getFocused();
      expect(focusedResult.success).toBe(true);

      // Unfocus
      const unfocusResult = await unfocus();
      expect(unfocusResult.success).toBe(true);
    });

    it("gets focused items when nothing focused", async () => {
      // Ensure nothing is focused first
      const unfocusResult = await unfocus();
      if (!unfocusResult.success) {
        // Focus operations require OmniFocus window to be open
        const errorDetails = unfocusResult.error?.details ?? "";
        if (
          errorDetails.includes("document window") ||
          errorDetails.includes("-1700")
        ) {
          console.warn("Skipping focus test: OmniFocus window not open");
          return;
        }
      }

      const focusedResult = await getFocused();
      if (!focusedResult.success) {
        const errorDetails = focusedResult.error?.details ?? "";
        if (
          errorDetails.includes("document window") ||
          errorDetails.includes("-1700")
        ) {
          console.warn("Skipping focus test: OmniFocus window not open");
          return;
        }
      }
      expect(focusedResult.success).toBe(true);
      // Should be empty or handle gracefully
    });
  });

  describe("forecast operations", () => {
    it("queries forecast for next 7 days", async () => {
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);

      const result = await queryForecast({
        start: today.toISOString().split("T")[0],
        end: nextWeek.toISOString().split("T")[0],
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Just verify it returns without error
    });

    it("creates task due today and finds it in forecast", async () => {
      const taskName = ctx.generateName("forecast-task");
      const today = new Date().toISOString().split("T")[0]!;

      const taskResult = await addToInbox(taskName, { due: today });
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      const forecastResult = await queryForecast({
        start: today,
        end: today,
      });

      expect(forecastResult.success).toBe(true);
      const found = forecastResult.data!.find(
        (t) => t.id === taskResult.data!.id
      );
      expect(found).toBeDefined();
    });
  });

  describe("deferred operations", () => {
    it("queries deferred tasks", async () => {
      // Create a deferred task
      const taskName = ctx.generateName("deferred-query");
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const deferDate = futureDate.toISOString().split("T")[0]!;

      const taskResult = await addToInbox(taskName, { defer: deferDate });
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      // Wait a moment for OmniFocus to update
      await sleep(500);

      // Query deferred tasks
      const deferredResult = await queryDeferred({});

      expect(deferredResult.success).toBe(true);
      expect(deferredResult.data).toBeDefined();

      // Our task should be in the deferred list
      const found = deferredResult.data!.find(
        (t) => t.id === taskResult.data!.id
      );
      expect(found).toBeDefined();
    });

    it("queries deferred tasks with date range", async () => {
      const today = new Date();
      const inTwoWeeks = new Date();
      inTwoWeeks.setDate(today.getDate() + 14);

      const result = await queryDeferred({
        deferredBefore: inTwoWeeks.toISOString().split("T")[0],
      });

      expect(result.success).toBe(true);
      // Just verify it works
    });
  });

  describe("perspectives", () => {
    it("lists all perspectives", async () => {
      const result = await listPerspectives();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);

      // Should have at least the built-in perspectives
      expect(result.data!.length).toBeGreaterThan(0);
    });

    it("lists built-in perspectives", async () => {
      const result = await listPerspectives();
      expect(result.success).toBe(true);

      // Check for common built-in perspectives
      const names = result.data!.map((p) => p.name.toLowerCase());
      // OmniFocus always has these
      expect(
        names.some(
          (n) =>
            n.includes("inbox") ||
            n.includes("projects") ||
            n.includes("forecast")
        )
      ).toBe(true);
    });

    it("queries inbox perspective", async () => {
      // First add a task to inbox
      const taskName = ctx.generateName("inbox-perspective");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      // Query inbox perspective
      const perspectiveResult = await queryPerspective("Inbox");

      expect(perspectiveResult.success).toBe(true);
      expect(perspectiveResult.data).toBeDefined();
      // Should find our task
      const found = perspectiveResult.data!.find(
        (t) => t.id === taskResult.data!.id
      );
      expect(found).toBeDefined();
    });
  });

  describe("sync status", () => {
    it("gets sync status", async () => {
      const result = await getSyncStatus();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Should have syncing property
      expect(typeof result.data!.syncing).toBe("boolean");
    });
  });

  describe("URL generation", () => {
    it("generates URL for task", async () => {
      const taskName = ctx.generateName("url-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      const urlResult = await generateUrl(taskResult.data!.id);

      expect(urlResult.success).toBe(true);
      expect(urlResult.data!.url).toBeDefined();
      expect(urlResult.data!.url).toContain("omnifocus://");
    });

    it("generates URL for project", async () => {
      const projectName = ctx.generateName("url-project");
      const projectResult = await createProject(projectName);
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      const urlResult = await generateUrl(projectResult.data!.id);

      expect(urlResult.success).toBe(true);
      expect(urlResult.data!.url).toBeDefined();
      expect(urlResult.data!.url).toContain("omnifocus://");
    });
  });

  describe("search operations", () => {
    it("searches tasks by name", async () => {
      const uniqueId = `search${Date.now()}`;
      const taskName = ctx.generateName(`searchable-${uniqueId}`);
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      // Give OmniFocus time to index
      await sleep(1000);

      const searchResult = await searchTasks(uniqueId);

      expect(searchResult.success).toBe(true);
      const found = searchResult.data!.find(
        (t) => t.id === taskResult.data!.id
      );
      expect(found).toBeDefined();
    });

    it("searches in note content", async () => {
      const uniqueId = `notesearch${Date.now()}`;
      const taskName = ctx.generateName("note-search");
      const taskResult = await addToInbox(taskName, {
        note: `This note contains ${uniqueId} for testing`,
      });
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      // Give OmniFocus time to index
      await sleep(1000);

      const searchResult = await searchTasks(uniqueId, { scope: "both" });

      expect(searchResult.success).toBe(true);
      const found = searchResult.data!.find(
        (t) => t.id === taskResult.data!.id
      );
      expect(found).toBeDefined();
    });

    it("limits search results", async () => {
      // Create several tasks with same prefix
      const prefix = `limit${Date.now()}`;
      for (let i = 1; i <= 5; i++) {
        const name = ctx.generateName(`${prefix}-${i}`);
        const result = await addToInbox(name);
        expect(result.success).toBe(true);
        ctx.trackTask(result.data!.id);
      }

      // Give OmniFocus time to index
      await sleep(1000);

      // Search with limit
      const searchResult = await searchTasks(prefix, { limit: 2 });

      expect(searchResult.success).toBe(true);
      expect(searchResult.data!.length).toBeLessThanOrEqual(2);
    });
  });
});

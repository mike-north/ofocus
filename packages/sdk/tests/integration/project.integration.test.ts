/**
 * Project Integration Tests
 *
 * Tests for project CRUD and project operations against live OmniFocus.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IntegrationTestContext } from "./setup.js";
import {
  createProject,
  queryProjects,
  updateProject,
  deleteProject,
  dropProject,
  addToInbox,
  updateTask,
  queryProjectsForReview,
  reviewProject,
  getReviewInterval,
  setReviewInterval,
} from "../../src/index.js";

describe("Project Integration", () => {
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

  describe("project creation", () => {
    it("creates a basic project", async () => {
      const name = ctx.generateName("basic-project");
      const result = await createProject(name);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBeDefined();
      expect(result.data!.name).toBe(name);
      expect(result.data!.status).toBe("active");
      expect(result.data!.sequential).toBe(false);

      ctx.trackProject(result.data!.id);
    });

    it("creates project with note", async () => {
      const name = ctx.generateName("project-with-note");
      const note = "Project description with unicode: 日本語";

      const result = await createProject(name, { note });

      expect(result.success).toBe(true);
      expect(result.data!.note).toBe(note);

      ctx.trackProject(result.data!.id);
    });

    it("creates sequential project", async () => {
      const name = ctx.generateName("sequential-project");

      const result = await createProject(name, { sequential: true });

      expect(result.success).toBe(true);
      expect(result.data!.sequential).toBe(true);

      ctx.trackProject(result.data!.id);
    });

    it("creates project on hold", async () => {
      const name = ctx.generateName("project-on-hold");

      const result = await createProject(name, { status: "on-hold" });

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("on-hold");

      ctx.trackProject(result.data!.id);
    });

    it("creates project with due date", async () => {
      const name = ctx.generateName("project-due");
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const dueDate = nextMonth.toISOString().split("T")[0]!;

      const result = await createProject(name, { dueDate });

      expect(result.success).toBe(true);
      // Note: OFProject doesn't expose dueDate directly, but we can verify success

      ctx.trackProject(result.data!.id);
    });

    it("creates project with all options", async () => {
      const name = ctx.generateName("project-all-options");

      const result = await createProject(name, {
        note: "Full featured project",
        sequential: true,
        status: "active",
      });

      expect(result.success).toBe(true);
      expect(result.data!.note).toBe("Full featured project");
      expect(result.data!.sequential).toBe(true);
      expect(result.data!.status).toBe("active");

      ctx.trackProject(result.data!.id);
    });
  });

  describe("project queries", () => {
    it("queries active projects and finds test project", async () => {
      const name = ctx.generateName("query-project");
      // Create an active project (default status)
      const createResult = await createProject(name, { status: "active" });
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      // Query active projects (faster than querying all projects in large databases)
      const queryResult = await queryProjects({ status: "active" });

      expect(queryResult.success).toBe(true);
      expect(queryResult.data).toBeDefined();

      const found = queryResult.data!.items.find(
        (p) => p.id === createResult.data!.id
      );
      expect(found).toBeDefined();
    });

    it("queries active projects", async () => {
      const name = ctx.generateName("active-project");
      const createResult = await createProject(name, { status: "active" });
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      const queryResult = await queryProjects({ status: "active" });

      expect(queryResult.success).toBe(true);
      const found = queryResult.data!.items.find(
        (p) => p.id === createResult.data!.id
      );
      expect(found).toBeDefined();
    });

    it("queries on-hold projects", async () => {
      const name = ctx.generateName("onhold-query");
      const createResult = await createProject(name, { status: "on-hold" });
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      const queryResult = await queryProjects({ status: "on-hold" });

      expect(queryResult.success).toBe(true);
      const found = queryResult.data!.items.find(
        (p) => p.id === createResult.data!.id
      );
      expect(found).toBeDefined();
    });
  });

  describe("project updates", () => {
    it("updates project name", async () => {
      const name = ctx.generateName("update-name");
      const createResult = await createProject(name);
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      const newName = ctx.generateName("updated-name");
      const updateResult = await updateProject(createResult.data!.id, {
        name: newName,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.name).toBe(newName);
    });

    it("updates project note", async () => {
      const name = ctx.generateName("update-note");
      const createResult = await createProject(name);
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      const updateResult = await updateProject(createResult.data!.id, {
        note: "Updated project note",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.note).toBe("Updated project note");
    });

    it("updates project status to on-hold", async () => {
      const name = ctx.generateName("update-status");
      const createResult = await createProject(name);
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      const updateResult = await updateProject(createResult.data!.id, {
        status: "on-hold",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.status).toBe("on-hold");
    });

    it("updates project sequential setting", async () => {
      const name = ctx.generateName("update-sequential");
      const createResult = await createProject(name, { sequential: false });
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      const updateResult = await updateProject(createResult.data!.id, {
        sequential: true,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.sequential).toBe(true);
    });
  });

  describe("project with tasks", () => {
    it("adds task to project", async () => {
      const projectName = ctx.generateName("project-tasks");
      const createProjectResult = await createProject(projectName);
      expect(createProjectResult.success).toBe(true);
      ctx.trackProject(createProjectResult.data!.id);

      const taskName = ctx.generateName("task-in-project");
      const createTaskResult = await addToInbox(taskName);
      expect(createTaskResult.success).toBe(true);
      ctx.trackTask(createTaskResult.data!.id);

      // Move task to project (updateTask expects project NAME, not ID)
      const updateResult = await updateTask(createTaskResult.data!.id, {
        project: projectName,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.projectId).toBe(createProjectResult.data!.id);
    });
  });

  describe("project completion and deletion", () => {
    it("drops a project", async () => {
      const name = ctx.generateName("drop-project");
      const createResult = await createProject(name);
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      const dropResult = await dropProject(createResult.data!.id);

      expect(dropResult.success).toBe(true);
      expect(dropResult.data!.dropped).toBe(true);
    });

    it("deletes a project", async () => {
      const name = ctx.generateName("delete-project");
      const createResult = await createProject(name);
      expect(createResult.success).toBe(true);
      const projectId = createResult.data!.id;

      const deleteResult = await deleteProject(projectId);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data!.deleted).toBe(true);

      // Verify project is gone
      const queryResult = await queryProjects({});
      const found = queryResult.data?.find((p) => p.id === projectId);
      expect(found).toBeUndefined();

      // Don't track - it's already deleted
    });
  });

  describe("project review", () => {
    it("gets projects for review", async () => {
      const result = await queryProjectsForReview();

      expect(result.success).toBe(true);
      // May or may not have projects, just verify the call works
      expect(result.data).toBeDefined();
    });

    it("reviews a project", async () => {
      const name = ctx.generateName("review-project");
      const createResult = await createProject(name);
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      const reviewResult = await reviewProject(createResult.data!.id);

      expect(reviewResult.success).toBe(true);
      expect(reviewResult.data!.projectId).toBe(createResult.data!.id);
      expect(reviewResult.data!.lastReviewed).toBeDefined();
    });

    it("gets and sets review interval", async () => {
      const name = ctx.generateName("review-interval");
      const createResult = await createProject(name);
      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.id);

      // Set review interval to 14 days
      const setResult = await setReviewInterval(createResult.data!.id, 14);
      expect(setResult.success).toBe(true);

      // Get review interval
      const getResult = await getReviewInterval(createResult.data!.id);
      expect(getResult.success).toBe(true);
      expect(getResult.data!.reviewIntervalDays).toBe(14);
    });
  });
});

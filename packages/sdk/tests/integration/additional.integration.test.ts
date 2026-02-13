/**
 * Additional API Integration Tests
 *
 * Tests for Quick Capture, TaskPaper, Statistics, Templates, Attachments,
 * Archive, Sync, and Utilities against live OmniFocus.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IntegrationTestContext, sleep } from "./setup.js";
import {
  // Quick Capture
  quickCapture,
  parseQuickInput,
  // TaskPaper
  exportTaskPaper,
  importTaskPaper,
  // Statistics
  getStats,
  // Templates
  saveTemplate,
  listTemplates,
  getTemplate,
  createFromTemplate,
  deleteTemplate,
  // Attachments
  addAttachment,
  listAttachments,
  removeAttachment,
  // Archive
  archiveTasks,
  compactDatabase,
  // Sync
  getSyncStatus,
  triggerSync,
  // Utilities
  openItem,
  // Support functions
  addToInbox,
  createProject,
  completeTask,
  updateTask,
} from "../../src/index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Additional API Integration", () => {
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

  describe("Quick Capture", () => {
    it("parses quick input with basic task", () => {
      const parsed = parseQuickInput("Buy groceries");

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.note).toBeNull();
      expect(parsed.project).toBeNull();
      expect(parsed.tags).toEqual([]);
    });

    it("parses quick input with project marker", () => {
      const parsed = parseQuickInput("Buy groceries #Shopping");

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.project).toBe("Shopping");
    });

    it("parses quick input with tags", () => {
      const parsed = parseQuickInput("Buy groceries @errands @home");

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.tags).toContain("errands");
      expect(parsed.tags).toContain("home");
    });

    it("parses quick input with flag", () => {
      const parsed = parseQuickInput("Buy groceries !");

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.flagged).toBe(true);
    });

    it("parses quick input with due date", () => {
      const parsed = parseQuickInput("Buy groceries due:tomorrow");

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.due).toBeDefined();
    });

    it("parses quick input with defer date", () => {
      const parsed = parseQuickInput("Buy groceries defer:monday");

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.defer).toBeDefined();
    });

    it("parses quick input with estimated duration", () => {
      const parsed = parseQuickInput("Buy groceries ~30m");

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.estimatedMinutes).toBe(30);
    });

    it("parses quick input with hour duration", () => {
      const parsed = parseQuickInput("Buy groceries ~1h");

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.estimatedMinutes).toBe(60);
    });

    it("parses quick input with repetition", () => {
      const parsed = parseQuickInput("Buy groceries repeat:weekly");

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.repeat).toBeDefined();
      expect(parsed.repeat?.frequency).toBe("weekly");
    });

    it("parses quick input with all components", () => {
      const parsed = parseQuickInput(
        "Buy groceries #Shopping @errands ! ~30m due:tomorrow"
      );

      expect(parsed.title).toBe("Buy groceries");
      expect(parsed.project).toBe("Shopping");
      expect(parsed.tags).toContain("errands");
      expect(parsed.flagged).toBe(true);
      expect(parsed.estimatedMinutes).toBe(30);
      expect(parsed.due).toBeDefined();
    });

    it("creates task via quick capture", async () => {
      const taskText = ctx.generateName("quick-capture-task");
      const result = await quickCapture(taskText);

      expect(result.success).toBe(true);
      expect(result.data!.id).toBeDefined();
      expect(result.data!.name).toBe(taskText);

      ctx.trackTask(result.data!.id);
    });

    it("creates flagged task via quick capture", async () => {
      const taskName = ctx.generateName("quick-flagged");
      const result = await quickCapture(`${taskName} !`);

      expect(result.success).toBe(true);
      expect(result.data!.flagged).toBe(true);

      ctx.trackTask(result.data!.id);
    });

    it("creates task with estimate via quick capture", async () => {
      const taskName = ctx.generateName("quick-estimate");
      const result = await quickCapture(`${taskName} ~45m`);

      expect(result.success).toBe(true);
      expect(result.data!.estimatedMinutes).toBe(45);

      ctx.trackTask(result.data!.id);
    });

    it("rejects empty input", async () => {
      const result = await quickCapture("");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects whitespace-only input", async () => {
      const result = await quickCapture("   ");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("TaskPaper Import/Export", () => {
    it("exports project to TaskPaper format", async () => {
      // Create a project with a task (export by project to avoid slow full export)
      const projectName = ctx.generateName("taskpaper-project");
      const projectResult = await createProject(projectName);
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      // Add a task to the project
      const taskName = ctx.generateName("taskpaper-task");
      const taskResult = await addToInbox(taskName, {
        note: "Test note for export",
        flag: true,
      });
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      // Move task to project
      await updateTask(taskResult.data!.id, { project: projectName });

      // Export just this project
      const exportResult = await exportTaskPaper({
        project: projectName,
      });

      expect(exportResult.success).toBe(true);
      expect(exportResult.data!.content).toBeDefined();
      expect(typeof exportResult.data!.content).toBe("string");
      expect(exportResult.data!.taskCount).toBeGreaterThanOrEqual(1);

      // Verify the exported content contains our task
      const content = exportResult.data!.content;
      expect(content).toContain(taskName);
      expect(content).toContain("@flagged");
    });

    it("exports with completed tasks included", async () => {
      // Create a test project to scope the export
      const projectName = ctx.generateName("taskpaper-completed");
      const projectResult = await createProject(projectName);
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      // Add and complete a task
      const taskName = ctx.generateName("taskpaper-complete-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      // Move to project and complete
      await updateTask(taskResult.data!.id, { project: projectName });
      await completeTask(taskResult.data!.id);

      // Export with completed tasks
      const exportResult = await exportTaskPaper({
        project: projectName,
        includeCompleted: true,
      });

      expect(exportResult.success).toBe(true);
      expect(exportResult.data!.content).toBeDefined();
    });

    it("imports tasks from TaskPaper format", async () => {
      const uniqueId = Date.now();
      const taskpaperContent = `- __OFOCUS_TEST__${uniqueId}__import-task @flagged`;

      const importResult = await importTaskPaper(taskpaperContent, {});

      expect(importResult.success).toBe(true);
      expect(importResult.data!.tasksCreated).toBeGreaterThanOrEqual(1);

      // Cleanup: find and track the imported task
      // Note: importTaskPaper doesn't return task IDs, so we rely on cleanup by name pattern
    });

    it("imports multiple tasks", async () => {
      const uniqueId = Date.now();
      const taskpaperContent = `- __OFOCUS_TEST__${uniqueId}__import1
- __OFOCUS_TEST__${uniqueId}__import2
- __OFOCUS_TEST__${uniqueId}__import3`;

      const importResult = await importTaskPaper(taskpaperContent, {});

      expect(importResult.success).toBe(true);
      expect(importResult.data!.tasksCreated).toBeGreaterThanOrEqual(3);
    });

    it("skips completed tasks during import", async () => {
      const uniqueId = Date.now();
      const taskpaperContent = `- __OFOCUS_TEST__${uniqueId}__active
- __OFOCUS_TEST__${uniqueId}__done @done`;

      const importResult = await importTaskPaper(taskpaperContent, {});

      expect(importResult.success).toBe(true);
      // Should only import 1 task (the non-completed one)
      expect(importResult.data!.tasksCreated).toBe(1);
    });
  });

  describe("Statistics", () => {
    it("gets statistics", async () => {
      const result = await getStats({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(typeof result.data!.tasksCompleted).toBe("number");
      expect(typeof result.data!.tasksRemaining).toBe("number");
      expect(typeof result.data!.tasksAvailable).toBe("number");
      expect(typeof result.data!.tasksFlagged).toBe("number");
      expect(typeof result.data!.projectsActive).toBe("number");
    });

    it("gets statistics with period", async () => {
      const result = await getStats({ period: "week" });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.periodStart).toBeDefined();
      expect(result.data!.periodEnd).toBeDefined();
    });

    it("gets statistics with date range", async () => {
      const today = new Date();
      const lastWeek = new Date();
      lastWeek.setDate(today.getDate() - 7);

      const result = await getStats({
        since: lastWeek.toISOString().split("T")[0],
        until: today.toISOString().split("T")[0],
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("gets statistics filtered by project", async () => {
      // Create a project
      const projectName = ctx.generateName("stats-project");
      const projectResult = await createProject(projectName);
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      const result = await getStats({ project: projectName });

      expect(result.success).toBe(true);
      expect(result.data!.projectFilter).toBe(projectName);
    });

    it("includes tasks due today in stats", async () => {
      const today = new Date().toISOString().split("T")[0]!;
      const taskName = ctx.generateName("due-today");
      const taskResult = await addToInbox(taskName, { due: today });
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      const result = await getStats({});

      expect(result.success).toBe(true);
      expect(result.data!.tasksDueToday).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Templates", () => {
    it("saves a project as template", async () => {
      // Create a project with tasks
      const projectName = ctx.generateName("template-source");
      const projectResult = await createProject(projectName, {
        note: "Template project description",
      });
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      // Add a task to the project
      const taskName = ctx.generateName("template-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);
      await updateTask(taskResult.data!.id, { project: projectName });

      // Save as template
      const templateName = ctx.generateName("my-template");
      const saveResult = await saveTemplate({
        sourceProject: projectResult.data!.id,
        name: templateName,
        description: "A test template",
      });

      expect(saveResult.success).toBe(true);
      expect(saveResult.data!.name).toBe(templateName);
      expect(saveResult.data!.path).toBeDefined();

      // Cleanup: delete the template
      deleteTemplate(templateName);
    });

    it("lists available templates", async () => {
      const result = listTemplates();

      expect(result.success).toBe(true);
      expect(result.data!.templates).toBeDefined();
      expect(Array.isArray(result.data!.templates)).toBe(true);
    });

    it("gets template details", async () => {
      // First create and save a template
      const projectName = ctx.generateName("detail-template-source");
      const projectResult = await createProject(projectName);
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      const templateName = ctx.generateName("detail-template");
      const saveResult = await saveTemplate({
        sourceProject: projectResult.data!.id,
        name: templateName,
      });
      expect(saveResult.success).toBe(true);

      // Get template details
      const getResult = getTemplate(templateName);

      expect(getResult.success).toBe(true);
      expect(getResult.data!.name).toBe(templateName);
      expect(getResult.data!.tasks).toBeDefined();

      // Cleanup
      deleteTemplate(templateName);
    });

    it("creates project from template", async () => {
      // First create and save a template
      const sourceProjectName = ctx.generateName("create-from-source");
      const sourceResult = await createProject(sourceProjectName);
      expect(sourceResult.success).toBe(true);
      ctx.trackProject(sourceResult.data!.id);

      const templateName = ctx.generateName("create-from-template");
      const saveResult = await saveTemplate({
        sourceProject: sourceResult.data!.id,
        name: templateName,
      });
      expect(saveResult.success).toBe(true);

      // Create new project from template
      const newProjectName = ctx.generateName("from-template");
      const createResult = await createFromTemplate({
        templateName: templateName,
        projectName: newProjectName,
      });

      expect(createResult.success).toBe(true);
      expect(createResult.data!.projectId).toBeDefined();
      expect(createResult.data!.projectName).toBe(newProjectName);

      ctx.trackProject(createResult.data!.projectId);

      // Cleanup
      deleteTemplate(templateName);
    });

    it("creates project from template with folder", async () => {
      // Create source and template
      const sourceProjectName = ctx.generateName("folder-template-source");
      const sourceResult = await createProject(sourceProjectName);
      expect(sourceResult.success).toBe(true);
      ctx.trackProject(sourceResult.data!.id);

      const templateName = ctx.generateName("folder-template");
      await saveTemplate({
        sourceProject: sourceResult.data!.id,
        name: templateName,
      });

      // Create new project with folder option
      const newProjectName = ctx.generateName("from-folder-template");
      const createResult = await createFromTemplate({
        templateName: templateName,
        projectName: newProjectName,
        // Note: folder would need to exist - we skip that for this test
      });

      expect(createResult.success).toBe(true);
      ctx.trackProject(createResult.data!.projectId);

      // Cleanup
      deleteTemplate(templateName);
    });

    it("deletes a template", async () => {
      // Create a template to delete
      const projectName = ctx.generateName("delete-template-source");
      const projectResult = await createProject(projectName);
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      const templateName = ctx.generateName("delete-template");
      const saveResult = await saveTemplate({
        sourceProject: projectResult.data!.id,
        name: templateName,
      });
      expect(saveResult.success).toBe(true);

      // Delete the template
      const deleteResult = deleteTemplate(templateName);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data!.deleted).toBe(true);
    });

    it("fails to get non-existent template", () => {
      const result = getTemplate("non-existent-template-xyz123");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("fails to delete non-existent template", () => {
      const result = deleteTemplate("non-existent-template-xyz123");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Attachments", () => {
    let testFilePath: string;

    beforeAll(() => {
      // Create a temporary test file
      const tempDir = os.tmpdir();
      testFilePath = path.join(tempDir, "ofocus-test-attachment.txt");
      fs.writeFileSync(testFilePath, "Test attachment content");
    });

    afterAll(() => {
      // Clean up test file
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    it("adds attachment to task", async () => {
      const taskName = ctx.generateName("attachment-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      const attachResult = await addAttachment(
        taskResult.data!.id,
        testFilePath
      );

      expect(attachResult.success).toBe(true);
      expect(attachResult.data!.attached).toBe(true);
      expect(attachResult.data!.fileName).toBeDefined();
    });

    it("lists attachments on task", async () => {
      // Create task and add attachment
      const taskName = ctx.generateName("list-attachments-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      await addAttachment(taskResult.data!.id, testFilePath);

      // List attachments
      const listResult = await listAttachments(taskResult.data!.id);

      expect(listResult.success).toBe(true);
      expect(listResult.data!.attachments).toBeDefined();
      expect(Array.isArray(listResult.data!.attachments)).toBe(true);
      expect(listResult.data!.attachments.length).toBeGreaterThanOrEqual(1);
    });

    it("removes attachment from task", async () => {
      // Create task with attachment
      const taskName = ctx.generateName("remove-attachment-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      const attachResult = await addAttachment(
        taskResult.data!.id,
        testFilePath
      );
      expect(attachResult.success).toBe(true);

      // List to get attachment ID
      const listResult = await listAttachments(taskResult.data!.id);
      expect(listResult.success).toBe(true);
      expect(listResult.data!.attachments.length).toBeGreaterThanOrEqual(1);

      const attachmentId = listResult.data!.attachments[0]!.id;

      // Remove attachment
      const removeResult = await removeAttachment(
        taskResult.data!.id,
        attachmentId
      );

      expect(removeResult.success).toBe(true);
      expect(removeResult.data!.removed).toBe(true);
    });

    it("lists attachments on task with no attachments", async () => {
      const taskName = ctx.generateName("no-attachments-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      const listResult = await listAttachments(taskResult.data!.id);

      expect(listResult.success).toBe(true);
      expect(listResult.data!.attachments).toEqual([]);
    });

    it("fails to add attachment with non-existent file", async () => {
      const taskName = ctx.generateName("bad-attachment-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      const attachResult = await addAttachment(
        taskResult.data!.id,
        "/nonexistent/path/to/file.txt"
      );

      expect(attachResult.success).toBe(false);
      expect(attachResult.error).toBeDefined();
    });

    it("fails to remove non-existent attachment", async () => {
      const taskName = ctx.generateName("remove-nonexistent");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      const removeResult = await removeAttachment(
        taskResult.data!.id,
        "nonexistent-attachment-id"
      );

      expect(removeResult.success).toBe(false);
      expect(removeResult.error).toBeDefined();
    });
  });

  describe("Archive", () => {
    it("archives completed tasks with date filter", async () => {
      // Create and complete some tasks
      const taskName = ctx.generateName("archive-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);

      // Complete the task
      const completeResult = await completeTask(taskResult.data!.id);
      expect(completeResult.success).toBe(true);

      // Archive completed tasks before tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const archiveResult = await archiveTasks({
        completedBefore: tomorrow.toISOString().split("T")[0],
      });

      expect(archiveResult.success).toBe(true);
      expect(archiveResult.data!.tasksArchived).toBeDefined();
      expect(typeof archiveResult.data!.tasksArchived).toBe("number");
    });

    it("performs dry run archive", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const archiveResult = await archiveTasks({
        completedBefore: tomorrow.toISOString().split("T")[0],
        dryRun: true,
      });

      expect(archiveResult.success).toBe(true);
      expect(archiveResult.data!.dryRun).toBe(true);
    });

    it("requires date filter for archive", async () => {
      const archiveResult = await archiveTasks({});

      expect(archiveResult.success).toBe(false);
      expect(archiveResult.error).toBeDefined();
    });

    it("compacts the database", async () => {
      const result = await compactDatabase();

      expect(result.success).toBe(true);
      expect(result.data!.compacted).toBe(true);
      expect(result.data!.message).toBeDefined();
    });
  });

  describe("Sync", () => {
    it("gets sync status", async () => {
      const result = await getSyncStatus();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(typeof result.data!.syncing).toBe("boolean");
      expect(typeof result.data!.syncEnabled).toBe("boolean");
    });

    it("triggers sync", async () => {
      const result = await triggerSync();

      expect(result.success).toBe(true);
      expect(result.data!.triggered).toBe(true);
      expect(result.data!.message).toBeDefined();
    });

    it("verifies sync status after trigger", async () => {
      // Trigger sync
      const triggerResult = await triggerSync();
      expect(triggerResult.success).toBe(true);

      // Wait a moment for sync to potentially start
      await sleep(500);

      // Check status (may or may not be syncing depending on timing)
      const statusResult = await getSyncStatus();
      expect(statusResult.success).toBe(true);
      expect(typeof statusResult.data!.syncing).toBe("boolean");
    });
  });

  describe("Utilities", () => {
    it("opens a task in OmniFocus", async () => {
      const taskName = ctx.generateName("open-task");
      const taskResult = await addToInbox(taskName);
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      const openResult = await openItem(taskResult.data!.id);

      expect(openResult.success).toBe(true);
      expect(openResult.data!.opened).toBe(true);
      expect(openResult.data!.type).toBe("task");
    });

    it("opens a project in OmniFocus", async () => {
      const projectName = ctx.generateName("open-project");
      const projectResult = await createProject(projectName);
      expect(projectResult.success).toBe(true);
      ctx.trackProject(projectResult.data!.id);

      const openResult = await openItem(projectResult.data!.id);

      expect(openResult.success).toBe(true);
      expect(openResult.data!.opened).toBe(true);
      expect(openResult.data!.type).toBe("project");
    });

    it("handles opening non-existent item gracefully", async () => {
      const openResult = await openItem("non-existent-id-12345");

      // Should fail gracefully
      expect(openResult.success).toBe(false);
      expect(openResult.error).toBeDefined();
    });

    it("validates item ID format", async () => {
      const openResult = await openItem("");

      expect(openResult.success).toBe(false);
      expect(openResult.error).toBeDefined();
    });
  });
});

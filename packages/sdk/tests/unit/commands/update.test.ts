import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { OFTask } from "../../../src/types.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import { updateTask } from "../../../src/commands/update.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-123",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: null,
  deferDate: null,
  completionDate: null,
  projectId: null,
  projectName: null,
  tags: [],
  estimatedMinutes: null,
  ...overrides,
});

describe("updateTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await updateTask("", { title: "New Title" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject task ID with injection characters", async () => {
      const result = await updateTask('task"; drop all; "', { title: "Test" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject invalid due date format", async () => {
      const result = await updateTask("task-123", { due: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject invalid defer date format", async () => {
      const result = await updateTask("task-123", { defer: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject empty tags", async () => {
      const result = await updateTask("task-123", { tags: ["valid", ""] });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid project name", async () => {
      const result = await updateTask("task-123", { project: 'bad"name' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject negative estimated minutes", async () => {
      const result = await updateTask("task-123", { estimatedMinutes: -10 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid repetition rule", async () => {
      const result = await updateTask("task-123", {
        repeat: { frequency: "invalid" as "daily" },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid update options", async () => {
      const mockTask = createMockTask({ name: "Updated Task" });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { title: "Updated Task" });

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful updates", () => {
    it("should update task title", async () => {
      const mockTask = createMockTask({ name: "New Title" });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { title: "New Title" });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("New Title");
    });

    it("should update task note", async () => {
      const mockTask = createMockTask({ note: "New note content" });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { note: "New note content" });

      expect(result.success).toBe(true);
      expect(result.data?.note).toBe("New note content");
    });

    it("should update flag status", async () => {
      const mockTask = createMockTask({ flagged: true });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { flag: true });

      expect(result.success).toBe(true);
      expect(result.data?.flagged).toBe(true);
    });

    it("should update due date", async () => {
      const mockTask = createMockTask({ dueDate: "2024-12-31" });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { due: "December 31, 2024" });

      expect(result.success).toBe(true);
      expect(result.data?.dueDate).toBe("2024-12-31");
    });

    it("should clear due date with empty string", async () => {
      const mockTask = createMockTask({ dueDate: null });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { due: "" });

      expect(result.success).toBe(true);
      expect(result.data?.dueDate).toBeNull();
    });

    it("should update tags", async () => {
      const mockTask = createMockTask({ tags: ["work", "urgent"] });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { tags: ["work", "urgent"] });

      expect(result.success).toBe(true);
      expect(result.data?.tags).toEqual(["work", "urgent"]);
    });

    it("should update estimated minutes", async () => {
      const mockTask = createMockTask({ estimatedMinutes: 30 });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { estimatedMinutes: 30 });

      expect(result.success).toBe(true);
      expect(result.data?.estimatedMinutes).toBe(30);
    });

    it("should update multiple fields at once", async () => {
      const mockTask = createMockTask({
        name: "Updated",
        flagged: true,
        dueDate: "2024-12-31",
        tags: ["updated"],
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", {
        title: "Updated",
        flag: true,
        due: "December 31, 2024",
        tags: ["updated"],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle task not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Task not found",
        },
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("nonexistent", { title: "Test" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle project not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: "Project not found",
        },
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", {
        project: "Nonexistent Project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { title: "Test" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFTask>);

      const result = await updateTask("task-123", { title: "Test" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

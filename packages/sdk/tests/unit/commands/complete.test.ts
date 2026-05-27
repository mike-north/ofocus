import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { CompleteResult } from "../../../src/commands/complete.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Import after mocking
import { completeTask } from "../../../src/commands/complete.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

describe("completeTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await completeTask("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject task ID with dangerous characters", async () => {
      const result = await completeTask('task"; delete all tasks; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject task ID with newlines", async () => {
      const result = await completeTask("task\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should accept valid task ID", async () => {
      const mockResult: CompleteResult = {
        taskId: "abc-123",
        taskName: "Test task",
        completed: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<CompleteResult>);

      const result = await completeTask("abc-123");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful completion", () => {
    it("should complete a task and return result", async () => {
      const mockResult: CompleteResult = {
        taskId: "task-789",
        taskName: "Complete me",
        completed: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<CompleteResult>);

      const result = await completeTask("task-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        taskId: "task-789",
        taskName: "Complete me",
        completed: true,
      });
      expect(result.error).toBeNull();
    });

    it("should handle task IDs with underscores", async () => {
      const mockResult: CompleteResult = {
        taskId: "task_with_underscores",
        taskName: "Task",
        completed: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<CompleteResult>);

      const result = await completeTask("task_with_underscores");

      expect(result.success).toBe(true);
    });

    it("should handle task IDs with hyphens", async () => {
      const mockResult: CompleteResult = {
        taskId: "task-with-hyphens",
        taskName: "Task",
        completed: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<CompleteResult>);

      const result = await completeTask("task-with-hyphens");

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle task not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Task not found",
        },
      } as OmniJSResult<CompleteResult>);

      const result = await completeTask("nonexistent-task");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
      expect(result.error?.message).toBe("Task not found");
    });

    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<CompleteResult>);

      const result = await completeTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle OmniJS execution error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS script error",
          details: "Some error details",
        },
      } as OmniJSResult<CompleteResult>);

      const result = await completeTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
      expect(result.error?.details).toBe("Some error details");
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<CompleteResult>);

      const result = await completeTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<CompleteResult>);

      const result = await completeTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to complete task");
    });
  });
});

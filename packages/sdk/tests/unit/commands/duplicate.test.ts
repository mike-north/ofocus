import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { DuplicateTaskOptions } from "../../../src/types.js";
import type { DuplicateTaskResult } from "../../../src/commands/duplicate.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import { duplicateTask } from "../../../src/commands/duplicate.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("duplicateTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await duplicateTask("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject task ID with dangerous characters", async () => {
      const result = await duplicateTask('task"; delete all tasks; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject task ID with newlines", async () => {
      const result = await duplicateTask("task\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should accept valid task ID", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-123",
        newTaskId: "task-456",
        newTaskName: "Test task",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should accept task ID with underscores", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task_with_underscores",
        newTaskId: "task_456",
        newTaskName: "Test task",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task_with_underscores");

      expect(result.success).toBe(true);
    });

    it("should reject task ID with periods", async () => {
      // Periods are not allowed in IDs per validation regex
      const result = await duplicateTask("task.123.test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });
  });

  describe("successful duplication", () => {
    it("should duplicate a task and return result", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-789",
        newTaskId: "task-999",
        newTaskName: "Duplicated task",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        originalTaskId: "task-789",
        newTaskId: "task-999",
        newTaskName: "Duplicated task",
      });
      expect(result.error).toBeNull();
    });

    it("should duplicate task with subtasks by default", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-123",
        newTaskId: "task-456",
        newTaskName: "Parent task",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123");

      expect(result.success).toBe(true);
      // Default behavior includes subtasks
      const scriptCall = mockRunAppleScript.mock.calls[0]?.[0];
      expect(scriptCall).toContain("duplicate theTask");
      expect(scriptCall).not.toContain("Remove subtasks");
    });

    it("should duplicate task without subtasks when includeSubtasks is false", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-123",
        newTaskId: "task-456",
        newTaskName: "Task without subtasks",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const options: DuplicateTaskOptions = { includeSubtasks: false };
      const result = await duplicateTask("task-123", options);

      expect(result.success).toBe(true);
      // Should include script to remove subtasks
      const scriptCall = mockRunAppleScript.mock.calls[0]?.[0];
      expect(scriptCall).toContain("duplicate theTask");
      expect(scriptCall).toContain("Remove subtasks");
    });

    it("should duplicate task with subtasks when includeSubtasks is true", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-123",
        newTaskId: "task-456",
        newTaskName: "Task with subtasks",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const options: DuplicateTaskOptions = { includeSubtasks: true };
      const result = await duplicateTask("task-123", options);

      expect(result.success).toBe(true);
      const scriptCall = mockRunAppleScript.mock.calls[0]?.[0];
      expect(scriptCall).toContain("duplicate theTask");
      expect(scriptCall).not.toContain("Remove subtasks");
    });

    it("should handle task names with special characters", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-123",
        newTaskId: "task-456",
        newTaskName: "Task with \"quotes\" and 'apostrophes'",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123");

      expect(result.success).toBe(true);
      expect(result.data?.newTaskName).toBe(
        "Task with \"quotes\" and 'apostrophes'"
      );
    });

    it("should handle task IDs with hyphens", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-with-hyphens",
        newTaskId: "task-new-id",
        newTaskName: "Task",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-with-hyphens");

      expect(result.success).toBe(true);
    });
  });

  describe("includeSubtasks option", () => {
    it("should default to including subtasks when options not provided", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-123",
        newTaskId: "task-456",
        newTaskName: "Task",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123");

      expect(result.success).toBe(true);
      const scriptCall = mockRunAppleScript.mock.calls[0]?.[0];
      expect(scriptCall).not.toContain("Remove subtasks");
    });

    it("should default to including subtasks when options is empty object", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-123",
        newTaskId: "task-456",
        newTaskName: "Task",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123", {});

      expect(result.success).toBe(true);
      const scriptCall = mockRunAppleScript.mock.calls[0]?.[0];
      expect(scriptCall).not.toContain("Remove subtasks");
    });

    it("should exclude subtasks when explicitly set to false", async () => {
      const mockResult: DuplicateTaskResult = {
        originalTaskId: "task-123",
        newTaskId: "task-456",
        newTaskName: "Task",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123", {
        includeSubtasks: false,
      });

      expect(result.success).toBe(true);
      const scriptCall = mockRunAppleScript.mock.calls[0]?.[0];
      expect(scriptCall).toContain("Remove subtasks");
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
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("nonexistent-task");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
      expect(result.error?.message).toBe("Task not found");
    });

    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript execution error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
          details: "Duplication error",
        },
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
      expect(result.error?.details).toBe("Duplication error");
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to duplicate task");
    });

    it("should handle permission denied error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Permission denied",
        },
      } as AppleScriptResult<DuplicateTaskResult>);

      const result = await duplicateTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });
  });

  describe("negative tests", () => {
    it("should reject task ID with SQL injection attempt", async () => {
      const result = await duplicateTask("task'; DROP TABLE tasks; --");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject task ID with backslashes", async () => {
      const result = await duplicateTask("task\\123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject task ID with tabs", async () => {
      const result = await duplicateTask("task\tid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject task ID with control characters", async () => {
      const result = await duplicateTask("task\x00id");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });
});

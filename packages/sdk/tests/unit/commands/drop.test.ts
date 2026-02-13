import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { DropResult, DeleteResult } from "../../../src/commands/drop.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import { dropTask, deleteTask } from "../../../src/commands/drop.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("dropTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await dropTask("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject task ID with dangerous characters", async () => {
      const result = await dropTask('task"; delete all; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should accept valid task ID", async () => {
      const mockResult: DropResult = {
        taskId: "abc-123",
        taskName: "Test task",
        dropped: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DropResult>);

      const result = await dropTask("abc-123");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful drop", () => {
    it("should drop a task and return result", async () => {
      const mockResult: DropResult = {
        taskId: "task-789",
        taskName: "Drop me",
        dropped: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DropResult>);

      const result = await dropTask("task-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        taskId: "task-789",
        taskName: "Drop me",
        dropped: true,
      });
      expect(result.error).toBeNull();
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
      } as AppleScriptResult<DropResult>);

      const result = await dropTask("nonexistent-task");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<DropResult>);

      const result = await dropTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<DropResult>);

      const result = await dropTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("deleteTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await deleteTask("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject task ID with injection characters", async () => {
      const result = await deleteTask("task\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });

  describe("successful deletion", () => {
    it("should delete a task and return result", async () => {
      const mockResult: DeleteResult = {
        taskId: "task-456",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteResult>);

      const result = await deleteTask("task-456");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        taskId: "task-456",
        deleted: true,
      });
    });
  });

  describe("error handling", () => {
    it("should handle not found error from script", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: { error: "not found", taskId: "missing-task" },
      } as AppleScriptResult<{ error: string; taskId: string }>);

      const result = await deleteTask("missing-task");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<DeleteResult>);

      const result = await deleteTask("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

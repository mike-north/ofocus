import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type {
  DeferResult,
  BatchDeferItem,
} from "../../../src/commands/defer.js";
import type { BatchResult } from "../../../src/types.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import { deferTask, deferTasks } from "../../../src/commands/defer.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("deferTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await deferTask("", { days: 1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject when neither days nor to is provided", async () => {
      const result = await deferTask("task-123", {});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("--days or --to");
    });

    it("should reject negative days", async () => {
      const result = await deferTask("task-123", { days: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject non-integer days", async () => {
      const result = await deferTask("task-123", { days: 1.5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject zero days", async () => {
      const result = await deferTask("task-123", { days: 0 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid date format in to option", async () => {
      const result = await deferTask("task-123", { to: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should accept valid days option", async () => {
      const mockResult: DeferResult = {
        taskId: "task-123",
        taskName: "Test",
        previousDeferDate: null,
        newDeferDate: "2024-12-31",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeferResult>);

      const result = await deferTask("task-123", { days: 7 });

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should accept valid to option", async () => {
      const mockResult: DeferResult = {
        taskId: "task-123",
        taskName: "Test",
        previousDeferDate: "2024-01-01",
        newDeferDate: "2024-12-31",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeferResult>);

      const result = await deferTask("task-123", { to: "December 31, 2024" });

      expect(result.success).toBe(true);
    });
  });

  describe("successful defer", () => {
    it("should defer a task by days", async () => {
      const mockResult: DeferResult = {
        taskId: "task-456",
        taskName: "Defer me",
        previousDeferDate: null,
        newDeferDate: "2024-01-08",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeferResult>);

      const result = await deferTask("task-456", { days: 7 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
    });

    it("should defer a task to a specific date", async () => {
      const mockResult: DeferResult = {
        taskId: "task-789",
        taskName: "Defer to date",
        previousDeferDate: "2024-01-01",
        newDeferDate: "2024-06-15",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeferResult>);

      const result = await deferTask("task-789", { to: "June 15, 2024" });

      expect(result.success).toBe(true);
      expect(result.data?.newDeferDate).toBe("2024-06-15");
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
      } as AppleScriptResult<DeferResult>);

      const result = await deferTask("nonexistent", { days: 1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<DeferResult>);

      const result = await deferTask("task-123", { days: 1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("deferTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject if any task ID is invalid", async () => {
      const result = await deferTasks(["valid-id", ""], { days: 1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject when neither days nor to is provided", async () => {
      const result = await deferTasks(["task-1", "task-2"], {});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid days", async () => {
      const result = await deferTasks(["task-1"], { days: -5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid date format", async () => {
      const result = await deferTasks(["task-1"], { to: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });
  });

  describe("successful batch defer", () => {
    it("should defer multiple tasks", async () => {
      const mockResult: { succeeded: BatchDeferItem[]; failed: never[] } = {
        succeeded: [
          {
            taskId: "task-1",
            taskName: "Task 1",
            previousDeferDate: null,
            newDeferDate: "2024-01-08",
          },
          {
            taskId: "task-2",
            taskName: "Task 2",
            previousDeferDate: "2024-01-01",
            newDeferDate: "2024-01-08",
          },
        ],
        failed: [],
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<typeof mockResult>);

      const result = await deferTasks(["task-1", "task-2"], { days: 7 });

      expect(result.success).toBe(true);
      expect(result.data?.totalSucceeded).toBe(2);
      expect(result.data?.totalFailed).toBe(0);
    });

    it("should handle partial failures", async () => {
      const mockResult: {
        succeeded: BatchDeferItem[];
        failed: { id: string; error: string }[];
      } = {
        succeeded: [
          {
            taskId: "task-1",
            taskName: "Task 1",
            previousDeferDate: null,
            newDeferDate: "2024-01-08",
          },
        ],
        failed: [{ id: "task-2", error: "Task not found" }],
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<typeof mockResult>);

      const result = await deferTasks(["task-1", "task-2"], { days: 7 });

      expect(result.success).toBe(true);
      expect(result.data?.totalSucceeded).toBe(1);
      expect(result.data?.totalFailed).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should handle complete batch failure", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Script failed",
        },
      } as AppleScriptResult<BatchResult<BatchDeferItem>>);

      const result = await deferTasks(["task-1", "task-2"], { days: 1 });

      expect(result.success).toBe(true);
      expect(result.data?.totalFailed).toBe(2);
      expect(result.data?.totalSucceeded).toBe(0);
    });
  });
});

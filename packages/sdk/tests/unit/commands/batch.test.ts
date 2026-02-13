import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  completeTasks,
  updateTasks,
  deleteTasks,
} from "../../../src/commands/batch.js";
import { ErrorCode } from "../../../src/errors.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runComposedScript: vi.fn(),
}));

// Mock the asset-loader module
vi.mock("../../../src/asset-loader.js", () => ({
  loadScriptContentCached: vi.fn().mockResolvedValue("-- mocked json helpers"),
}));

// Import the mocked function
import { runComposedScript } from "../../../src/applescript.js";
const mockRunComposedScript = vi.mocked(runComposedScript);

describe("completeTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should return error for empty task IDs array", async () => {
      const result = await completeTasks([]);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toBe("No task IDs provided");
      expect(mockRunComposedScript).not.toHaveBeenCalled();
    });

    it("should return error for invalid task ID format", async () => {
      const result = await completeTasks(['task"with-quote']);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunComposedScript).not.toHaveBeenCalled();
    });

    it("should return error if any task ID is invalid", async () => {
      const result = await completeTasks([
        "abc123ABC-xyz789XYZ-12345678",
        'invalid"id',
      ]);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunComposedScript).not.toHaveBeenCalled();
    });
  });

  describe("success cases", () => {
    it("should complete a single task", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Test Task" },
          ],
          failed: [],
        },
      });

      const result = await completeTasks(["abc123ABC-xyz789XYZ-12345678"]);

      expect(result.success).toBe(true);
      expect(result.data?.succeeded).toHaveLength(1);
      expect(result.data?.succeeded[0].taskId).toBe(
        "abc123ABC-xyz789XYZ-12345678"
      );
      expect(result.data?.succeeded[0].taskName).toBe("Test Task");
      expect(result.data?.totalSucceeded).toBe(1);
      expect(result.data?.totalFailed).toBe(0);
    });

    it("should complete multiple tasks", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Task 1" },
            { taskId: "def456DEF-uvw012UVW-87654321", taskName: "Task 2" },
          ],
          failed: [],
        },
      });

      const result = await completeTasks([
        "abc123ABC-xyz789XYZ-12345678",
        "def456DEF-uvw012UVW-87654321",
      ]);

      expect(result.success).toBe(true);
      expect(result.data?.succeeded).toHaveLength(2);
      expect(result.data?.totalSucceeded).toBe(2);
      expect(result.data?.totalFailed).toBe(0);
    });

    it("should handle partial failures", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Task 1" },
          ],
          failed: [
            { id: "def456DEF-uvw012UVW-87654321", error: "Task not found" },
          ],
        },
      });

      const result = await completeTasks([
        "abc123ABC-xyz789XYZ-12345678",
        "def456DEF-uvw012UVW-87654321",
      ]);

      expect(result.success).toBe(true);
      expect(result.data?.succeeded).toHaveLength(1);
      expect(result.data?.failed).toHaveLength(1);
      expect(result.data?.failed[0].id).toBe("def456DEF-uvw012UVW-87654321");
      expect(result.data?.failed[0].error).toBe("Task not found");
      expect(result.data?.totalSucceeded).toBe(1);
      expect(result.data?.totalFailed).toBe(1);
    });
  });

  describe("chunking", () => {
    it("should process large batches in chunks of 50", async () => {
      // Create 75 task IDs
      const taskIds = Array.from(
        { length: 75 },
        (_, i) => `abc${String(i).padStart(3, "0")}ABC-xyz789XYZ-12345678`
      );

      // First chunk returns 50 succeeded
      mockRunComposedScript.mockResolvedValueOnce({
        success: true,
        data: {
          succeeded: taskIds
            .slice(0, 50)
            .map((id) => ({ taskId: id, taskName: `Task ${id}` })),
          failed: [],
        },
      });

      // Second chunk returns 25 succeeded
      mockRunComposedScript.mockResolvedValueOnce({
        success: true,
        data: {
          succeeded: taskIds
            .slice(50, 75)
            .map((id) => ({ taskId: id, taskName: `Task ${id}` })),
          failed: [],
        },
      });

      const result = await completeTasks(taskIds);

      expect(mockRunComposedScript).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.data?.totalSucceeded).toBe(75);
    });
  });

  describe("error cases", () => {
    it("should return failure if AppleScript fails", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
        },
      });

      const result = await completeTasks(["abc123ABC-xyz789XYZ-12345678"]);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });
  });
});

describe("updateTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should return error for empty task IDs array", async () => {
      const result = await updateTasks([], { flag: true });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toBe("No task IDs provided");
    });

    it("should return error for invalid task ID format", async () => {
      const result = await updateTasks(['task"quote'], { flag: true });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should return error for invalid due date format", async () => {
      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        due: 'date"with-quote',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should return error for invalid defer date format", async () => {
      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        defer: 'date"with-quote',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should return error for invalid estimated minutes", async () => {
      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        estimatedMinutes: -5,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should return error for invalid repetition rule", async () => {
      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        repeat: {
          frequency: "invalid" as "daily",
          interval: 1,
          repeatMethod: "due-again",
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe("success cases", () => {
    it("should update task flag", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Test Task" },
          ],
          failed: [],
        },
      });

      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        flag: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.succeeded).toHaveLength(1);
    });

    it("should update task title", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "New Title" },
          ],
          failed: [],
        },
      });

      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        title: "New Title",
      });

      expect(result.success).toBe(true);
      expect(result.data?.succeeded[0].taskName).toBe("New Title");
    });

    it("should update multiple tasks with same options", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Task 1" },
            { taskId: "def456DEF-uvw012UVW-87654321", taskName: "Task 2" },
          ],
          failed: [],
        },
      });

      const result = await updateTasks(
        ["abc123ABC-xyz789XYZ-12345678", "def456DEF-uvw012UVW-87654321"],
        { flag: true, note: "Batch updated" }
      );

      expect(result.success).toBe(true);
      expect(result.data?.totalSucceeded).toBe(2);
    });

    it("should allow clearing due date with empty string", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Test" },
          ],
          failed: [],
        },
      });

      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        due: "",
      });

      expect(result.success).toBe(true);
      // The script should contain "missing value" for clearing
      expect(mockRunComposedScript).toHaveBeenCalled();
    });

    it("should handle repetition rule updates", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Test" },
          ],
          failed: [],
        },
      });

      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        repeat: {
          frequency: "weekly",
          interval: 2,
          repeatMethod: "due-again",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should handle clear repetition", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Test" },
          ],
          failed: [],
        },
      });

      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        clearRepeat: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("chunking", () => {
    it("should process large batches in chunks", async () => {
      const taskIds = Array.from(
        { length: 60 },
        (_, i) => `abc${String(i).padStart(3, "0")}ABC-xyz789XYZ-12345678`
      );

      mockRunComposedScript
        .mockResolvedValueOnce({
          success: true,
          data: {
            succeeded: taskIds
              .slice(0, 50)
              .map((id) => ({ taskId: id, taskName: "Test" })),
            failed: [],
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            succeeded: taskIds
              .slice(50, 60)
              .map((id) => ({ taskId: id, taskName: "Test" })),
            failed: [],
          },
        });

      const result = await updateTasks(taskIds, { flag: true });

      expect(mockRunComposedScript).toHaveBeenCalledTimes(2);
      expect(result.data?.totalSucceeded).toBe(60);
    });
  });
});

describe("deleteTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should return error for empty task IDs array", async () => {
      const result = await deleteTasks([]);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toBe("No task IDs provided");
    });

    it("should return error for invalid task ID format", async () => {
      const result = await deleteTasks(['task"quote']);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });

  describe("success cases", () => {
    it("should delete a single task", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [{ taskId: "abc123ABC-xyz789XYZ-12345678" }],
          failed: [],
        },
      });

      const result = await deleteTasks(["abc123ABC-xyz789XYZ-12345678"]);

      expect(result.success).toBe(true);
      expect(result.data?.succeeded).toHaveLength(1);
      expect(result.data?.succeeded[0].taskId).toBe(
        "abc123ABC-xyz789XYZ-12345678"
      );
      expect(result.data?.totalSucceeded).toBe(1);
      expect(result.data?.totalFailed).toBe(0);
    });

    it("should delete multiple tasks", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678" },
            { taskId: "def456DEF-uvw012UVW-87654321" },
          ],
          failed: [],
        },
      });

      const result = await deleteTasks([
        "abc123ABC-xyz789XYZ-12345678",
        "def456DEF-uvw012UVW-87654321",
      ]);

      expect(result.success).toBe(true);
      expect(result.data?.succeeded).toHaveLength(2);
      expect(result.data?.totalSucceeded).toBe(2);
    });

    it("should handle partial failures", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: {
          succeeded: [{ taskId: "abc123ABC-xyz789XYZ-12345678" }],
          failed: [
            { id: "def456DEF-uvw012UVW-87654321", error: "Task not found" },
          ],
        },
      });

      const result = await deleteTasks([
        "abc123ABC-xyz789XYZ-12345678",
        "def456DEF-uvw012UVW-87654321",
      ]);

      expect(result.success).toBe(true);
      expect(result.data?.succeeded).toHaveLength(1);
      expect(result.data?.failed).toHaveLength(1);
      expect(result.data?.totalSucceeded).toBe(1);
      expect(result.data?.totalFailed).toBe(1);
    });
  });

  describe("chunking", () => {
    it("should process large batches in chunks of 50", async () => {
      const taskIds = Array.from(
        { length: 100 },
        (_, i) => `abc${String(i).padStart(3, "0")}ABC-xyz789XYZ-12345678`
      );

      mockRunComposedScript
        .mockResolvedValueOnce({
          success: true,
          data: {
            succeeded: taskIds.slice(0, 50).map((id) => ({ taskId: id })),
            failed: [],
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            succeeded: taskIds.slice(50, 100).map((id) => ({ taskId: id })),
            failed: [],
          },
        });

      const result = await deleteTasks(taskIds);

      expect(mockRunComposedScript).toHaveBeenCalledTimes(2);
      expect(result.data?.totalSucceeded).toBe(100);
    });
  });

  describe("error cases", () => {
    it("should return failure if AppleScript fails", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "OmniFocus not running",
        },
      });

      const result = await deleteTasks(["abc123ABC-xyz789XYZ-12345678"]);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });
  });
});

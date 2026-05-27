import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  completeTasks,
  updateTasks,
  deleteTasks,
} from "../../../src/commands/batch.js";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
  toOmniJSDate: vi.fn((s: string) => `new Date("${s}")`),
}));

// Import after mocking
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function succeededCompleteResult(
  ids: string[],
  namePrefix = "Task"
): OmniJSResult<{
  succeeded: { taskId: string; taskName: string }[];
  failed: { id: string; error: string }[];
}> {
  return {
    success: true,
    data: {
      succeeded: ids.map((id) => ({ taskId: id, taskName: `${namePrefix} ${id}` })),
      failed: [],
    },
  };
}

function succeededDeleteResult(
  ids: string[]
): OmniJSResult<{
  succeeded: { taskId: string }[];
  failed: { id: string; error: string }[];
}> {
  return {
    success: true,
    data: {
      succeeded: ids.map((id) => ({ taskId: id })),
      failed: [],
    },
  };
}

function errorResult(message = "OmniFocus not running"): OmniJSResult<never> {
  return {
    success: false,
    error: { code: ErrorCode.APPLESCRIPT_ERROR, message },
  };
}

// ---------------------------------------------------------------------------
// completeTasks
// ---------------------------------------------------------------------------

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
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should return error for invalid task ID format", async () => {
      const result = await completeTasks(['task"with-quote']);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should return error if any task ID is invalid", async () => {
      const result = await completeTasks([
        "abc123ABC-xyz789XYZ-12345678",
        'invalid"id',
      ]);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });
  });

  describe("success cases", () => {
    it("should complete a single task", async () => {
      mockRunOmniJS.mockResolvedValue({
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
      mockRunOmniJS.mockResolvedValue({
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

    it("should handle partial failures (task not found in OmniJS)", async () => {
      mockRunOmniJS.mockResolvedValue({
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

      // First chunk: 50 succeeded
      mockRunOmniJS.mockResolvedValueOnce(
        succeededCompleteResult(taskIds.slice(0, 50))
      );

      // Second chunk: 25 succeeded
      mockRunOmniJS.mockResolvedValueOnce(
        succeededCompleteResult(taskIds.slice(50, 75))
      );

      const result = await completeTasks(taskIds);

      expect(mockRunOmniJS).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.data?.totalSucceeded).toBe(75);
      expect(result.data?.totalFailed).toBe(0);
    });

    it("should mark all chunk IDs as failed when OmniJS fails for whole chunk", async () => {
      const taskIds = [
        "abc123ABC-xyz789XYZ-12345678",
        "def456DEF-uvw012UVW-87654321",
      ];

      mockRunOmniJS.mockResolvedValue(errorResult("Script execution failed"));

      const result = await completeTasks(taskIds);

      // The outer function still returns success:true with failed items
      expect(result.success).toBe(true);
      expect(result.data?.totalSucceeded).toBe(0);
      expect(result.data?.totalFailed).toBe(2);
    });
  });

  describe("error cases", () => {
    it("should return failure if OmniJS executor rejects entirely", async () => {
      mockRunOmniJS.mockRejectedValue(new Error("Network error"));

      await expect(
        completeTasks(["abc123ABC-xyz789XYZ-12345678"])
      ).rejects.toThrow("Network error");
    });
  });
});

// ---------------------------------------------------------------------------
// updateTasks
// ---------------------------------------------------------------------------

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
      mockRunOmniJS.mockResolvedValue({
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
      mockRunOmniJS.mockResolvedValue({
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
      mockRunOmniJS.mockResolvedValue({
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
      mockRunOmniJS.mockResolvedValue({
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
      expect(mockRunOmniJS).toHaveBeenCalled();
    });

    it("should allow clearing defer date with empty string", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Test" },
          ],
          failed: [],
        },
      });

      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        defer: "",
      });

      expect(result.success).toBe(true);
    });

    it("should handle repetition rule updates (due-again)", async () => {
      mockRunOmniJS.mockResolvedValue({
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

    it("should handle repetition rule updates (defer-another)", async () => {
      mockRunOmniJS.mockResolvedValue({
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
          frequency: "monthly",
          interval: 1,
          repeatMethod: "defer-another",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should handle clear repetition", async () => {
      mockRunOmniJS.mockResolvedValue({
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

    it("should handle clearEstimate option", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          succeeded: [
            { taskId: "abc123ABC-xyz789XYZ-12345678", taskName: "Test" },
          ],
          failed: [],
        },
      });

      const result = await updateTasks(["abc123ABC-xyz789XYZ-12345678"], {
        clearEstimate: true,
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

      mockRunOmniJS
        .mockResolvedValueOnce(succeededCompleteResult(taskIds.slice(0, 50)))
        .mockResolvedValueOnce(succeededCompleteResult(taskIds.slice(50, 60)));

      const result = await updateTasks(taskIds, { flag: true });

      expect(mockRunOmniJS).toHaveBeenCalledTimes(2);
      expect(result.data?.totalSucceeded).toBe(60);
    });

    it("should accumulate failed items from a failing chunk", async () => {
      const taskIds = [
        "abc123ABC-xyz789XYZ-12345678",
        "def456DEF-uvw012UVW-87654321",
      ];

      mockRunOmniJS.mockResolvedValue(errorResult("OmniJS crash"));

      const result = await updateTasks(taskIds, { flag: false });

      expect(result.success).toBe(true);
      expect(result.data?.totalFailed).toBe(2);
      expect(result.data?.totalSucceeded).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// deleteTasks
// ---------------------------------------------------------------------------

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
      mockRunOmniJS.mockResolvedValue(
        succeededDeleteResult(["abc123ABC-xyz789XYZ-12345678"])
      );

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
      mockRunOmniJS.mockResolvedValue(
        succeededDeleteResult([
          "abc123ABC-xyz789XYZ-12345678",
          "def456DEF-uvw012UVW-87654321",
        ])
      );

      const result = await deleteTasks([
        "abc123ABC-xyz789XYZ-12345678",
        "def456DEF-uvw012UVW-87654321",
      ]);

      expect(result.success).toBe(true);
      expect(result.data?.succeeded).toHaveLength(2);
      expect(result.data?.totalSucceeded).toBe(2);
    });

    it("should handle partial failures (task not found in OmniJS)", async () => {
      mockRunOmniJS.mockResolvedValue({
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

      mockRunOmniJS
        .mockResolvedValueOnce(succeededDeleteResult(taskIds.slice(0, 50)))
        .mockResolvedValueOnce(succeededDeleteResult(taskIds.slice(50, 100)));

      const result = await deleteTasks(taskIds);

      expect(mockRunOmniJS).toHaveBeenCalledTimes(2);
      expect(result.data?.totalSucceeded).toBe(100);
    });

    it("should mark all chunk IDs as failed when OmniJS fails for whole chunk", async () => {
      const taskIds = [
        "abc123ABC-xyz789XYZ-12345678",
        "def456DEF-uvw012UVW-87654321",
      ];

      mockRunOmniJS.mockResolvedValue(errorResult("OmniFocus not running"));

      const result = await deleteTasks(taskIds);

      expect(result.success).toBe(true);
      expect(result.data?.totalSucceeded).toBe(0);
      expect(result.data?.totalFailed).toBe(2);
    });
  });

  describe("error cases", () => {
    it("should return failure if OmniJS executor rejects entirely", async () => {
      mockRunOmniJS.mockRejectedValue(new Error("OmniFocus not running"));

      await expect(
        deleteTasks(["abc123ABC-xyz789XYZ-12345678"])
      ).rejects.toThrow("OmniFocus not running");
    });
  });
});

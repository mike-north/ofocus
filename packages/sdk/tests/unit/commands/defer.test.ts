import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type {
  DeferResult,
  BatchDeferItem,
} from "../../../src/commands/defer.js";
import type { BatchResult } from "../../../src/types.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
  toOmniJSDate: vi.fn((s: string) => `new Date("${s}")`),
}));

// Import after mocking
import {
  deferTask,
  deferTasks,
  deferTaskDescriptor,
  deferTasksDescriptor,
} from "../../../src/commands/defer.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

describe("deferTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await deferTask("", { days: 1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeferResult>);

      const result = await deferTask("task-123", { days: 7 });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should accept valid to option", async () => {
      const mockResult: DeferResult = {
        taskId: "task-123",
        taskName: "Test",
        previousDeferDate: "2024-01-01",
        newDeferDate: "2024-12-31",
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeferResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeferResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeferResult>);

      const result = await deferTask("task-789", { to: "June 15, 2024" });

      expect(result.success).toBe(true);
      expect(result.data?.newDeferDate).toBe("2024-06-15");
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
      } as OmniJSResult<DeferResult>);

      const result = await deferTask("nonexistent", { days: 1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<DeferResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<typeof mockResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<typeof mockResult>);

      const result = await deferTasks(["task-1", "task-2"], { days: 7 });

      expect(result.success).toBe(true);
      expect(result.data?.totalSucceeded).toBe(1);
      expect(result.data?.totalFailed).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should handle complete batch failure", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "Script failed",
        },
      } as OmniJSResult<BatchResult<BatchDeferItem>>);

      const result = await deferTasks(["task-1", "task-2"], { days: 1 });

      expect(result.success).toBe(true);
      expect(result.data?.totalFailed).toBe(2);
      expect(result.data?.totalSucceeded).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Registry descriptors
// ---------------------------------------------------------------------------

const ID_A = "abc123ABC-xyz789XYZ-12345678";
const ID_B = "def456DEF-uvw012UVW-87654321";

function getScriptBody(): string {
  const call = mockRunOmniJS.mock.calls[0];
  if (!call) throw new Error("runOmniJSWrapped was not called");
  return call[0] as string;
}

describe("defer descriptors — metadata", () => {
  it("defer descriptor maps to the right CLI/MCP names", () => {
    expect(deferTaskDescriptor.name).toBe("deferTask");
    expect(deferTaskDescriptor.cliName).toBe("defer");
    expect(deferTaskDescriptor.mcpName).toBe("task_defer");
    expect(deferTaskDescriptor.cliPositional).toEqual(["taskId"]);
  });

  it("defer-batch descriptor maps to the right CLI/MCP names", () => {
    expect(deferTasksDescriptor.name).toBe("deferTasks");
    expect(deferTasksDescriptor.cliName).toBe("defer-batch");
    expect(deferTasksDescriptor.mcpName).toBe("tasks_defer_batch");
    expect(deferTasksDescriptor.cliPositional).toEqual(["taskIds"]);
  });

  it("rejects an empty taskIds array at the schema boundary", () => {
    // Regression: the variadic positional must require at least one ID so the
    // CLI/MCP surfaces fail validation rather than running an empty no-op.
    const parsed = deferTasksDescriptor.inputSchema.safeParse({ taskIds: [] });
    expect(parsed.success).toBe(false);
  });
});

describe("defer descriptors — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deferTaskDescriptor forwards taskId and days to deferTask", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: {
        taskId: ID_A,
        taskName: "Task A",
        previousDeferDate: null,
        newDeferDate: "2026-01-08",
      },
    } as OmniJSResult<DeferResult>);

    const result = await deferTaskDescriptor.handler({
      taskId: ID_A,
      days: 7,
    });

    expect(result.success).toBe(true);
    const body = getScriptBody();
    expect(body).toContain(`flattenedTasks.byId("${ID_A}")`);
    expect(body).toContain("7 * 86400000");
  });

  it("deferTaskDescriptor forwards the to date", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: {
        taskId: ID_A,
        taskName: "Task A",
        previousDeferDate: null,
        newDeferDate: "2026-06-15",
      },
    } as OmniJSResult<DeferResult>);

    await deferTaskDescriptor.handler({ taskId: ID_A, to: "2026-06-15" });

    const body = getScriptBody();
    // toOmniJSDate is mocked to emit `new Date("<input>")`.
    expect(body).toContain('new Date("2026-06-15")');
  });

  it("deferTasksDescriptor forwards taskIds and days to deferTasks", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { succeeded: [], failed: [] },
    } as OmniJSResult<{
      succeeded: BatchDeferItem[];
      failed: { id: string; error: string }[];
    }>);

    const result = await deferTasksDescriptor.handler({
      taskIds: [ID_A, ID_B],
      days: 3,
    });

    expect(result.success).toBe(true);
    const body = getScriptBody();
    expect(body).toContain(JSON.stringify([ID_A, ID_B]));
    expect(body).toContain("3 * 86400000");
  });
});

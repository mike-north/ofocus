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
import { queryDeferred } from "../../../src/commands/deferred.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-123",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: null,
  deferDate: "2024-12-31",
  completionDate: null,
  projectId: null,
  projectName: null,
  tags: [],
  estimatedMinutes: null,
  ...overrides,
});

describe("queryDeferred", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject invalid deferredAfter date format", async () => {
      const result = await queryDeferred({ deferredAfter: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid deferredBefore date format", async () => {
      const result = await queryDeferred({ deferredBefore: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should accept valid date options", async () => {
      const mockTasks = [createMockTask()];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryDeferred({
        deferredAfter: "2024-01-01",
        deferredBefore: "2024-12-31",
      });

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should return deferred tasks with default options", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", deferDate: "2024-06-01" }),
        createMockTask({ id: "task-2", deferDate: "2024-07-01" }),
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should filter by deferredAfter", async () => {
      const mockTasks = [createMockTask({ deferDate: "2024-07-01" })];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryDeferred({ deferredAfter: "2024-06-01" });

      expect(result.success).toBe(true);
    });

    it("should filter by deferredBefore", async () => {
      const mockTasks = [createMockTask({ deferDate: "2024-05-01" })];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryDeferred({ deferredBefore: "2024-06-01" });

      expect(result.success).toBe(true);
    });

    it("should filter blocked only tasks", async () => {
      const mockTasks = [
        createMockTask({ deferDate: "2025-12-01" }), // Future date
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryDeferred({ blockedOnly: true });

      expect(result.success).toBe(true);
    });

    it("should return empty array when no deferred tasks exist", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return empty array on undefined data", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

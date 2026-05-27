import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask } from "../../../src/types.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
  toOmniJSDate: vi.fn((s: string) => `new Date("${s}")`),
}));

// Import after mocking
import { queryDeferred } from "../../../src/commands/deferred.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-123",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: null,
  deferDate: "2024-12-31T00:00:00.000Z",
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
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid deferredBefore date format", async () => {
      const result = await queryDeferred({ deferredBefore: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should accept valid date options", async () => {
      const mockTasks = [createMockTask()];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred({
        deferredAfter: "2024-01-01",
        deferredBefore: "2024-12-31",
      });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should return deferred tasks with default options", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", deferDate: "2024-06-01T00:00:00.000Z" }),
        createMockTask({ id: "task-2", deferDate: "2024-07-01T00:00:00.000Z" }),
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should filter by deferredAfter", async () => {
      const mockTasks = [
        createMockTask({ deferDate: "2024-07-01T00:00:00.000Z" }),
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred({ deferredAfter: "2024-06-01" });

      expect(result.success).toBe(true);
    });

    it("should filter by deferredBefore", async () => {
      const mockTasks = [
        createMockTask({ deferDate: "2024-05-01T00:00:00.000Z" }),
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred({ deferredBefore: "2024-06-01" });

      expect(result.success).toBe(true);
    });

    it("should filter blocked only tasks", async () => {
      const mockTasks = [
        createMockTask({ deferDate: "2025-12-01T00:00:00.000Z" }), // Future date
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred({ blockedOnly: true });

      expect(result.success).toBe(true);
    });

    it("should return empty array when no deferred tasks exist", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: [],
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return empty array on undefined data", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle OmniJS script error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS script error: ReferenceError: flattenedTasks is not defined",
        },
      } as OmniJSResult<OFTask[]>);

      const result = await queryDeferred();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask, PaginatedResult } from "../../../src/types.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Import after mocking
import { queryTasks } from "../../../src/commands/tasks.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

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

const createMockPaginatedResult = (
  items: OFTask[],
  overrides: Partial<PaginatedResult<OFTask>> = {}
): PaginatedResult<OFTask> => ({
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
  ...overrides,
});

describe("queryTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject invalid dueBefore date format", async () => {
      const result = await queryTasks({ dueBefore: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid dueAfter date format", async () => {
      const result = await queryTasks({ dueAfter: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject invalid project name", async () => {
      const result = await queryTasks({ project: 'bad"project' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject negative limit", async () => {
      const result = await queryTasks({ limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject negative offset", async () => {
      const result = await queryTasks({ offset: -10 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject non-integer limit", async () => {
      const result = await queryTasks({ limit: 10.5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid options", async () => {
      const mockResult = createMockPaginatedResult([createMockTask()]);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks({
        project: "Valid Project",
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should return paginated tasks with default options", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1" }),
        createMockTask({ id: "task-2" }),
      ];
      const mockResult = createMockPaginatedResult(mockTasks);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks();

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.totalCount).toBe(2);
    });

    it("should filter by completed status", async () => {
      const mockTasks = [createMockTask({ completed: true })];
      const mockResult = createMockPaginatedResult(mockTasks);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks({ completed: true });

      expect(result.success).toBe(true);
    });

    it("should filter by flagged status", async () => {
      const mockTasks = [createMockTask({ flagged: true })];
      const mockResult = createMockPaginatedResult(mockTasks);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks({ flagged: true });

      expect(result.success).toBe(true);
    });

    it("should filter by available status", async () => {
      const mockTasks = [createMockTask({ completed: false, flagged: false })];
      const mockResult = createMockPaginatedResult(mockTasks);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks({ available: true });

      expect(result.success).toBe(true);
    });

    it("should handle pagination with offset and limit", async () => {
      const mockTasks = [createMockTask({ id: "task-51" })];
      const mockResult = createMockPaginatedResult(mockTasks, {
        totalCount: 100,
        returnedCount: 1,
        hasMore: true,
        offset: 50,
        limit: 1,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks({ offset: 50, limit: 1 });

      expect(result.success).toBe(true);
      expect(result.data?.offset).toBe(50);
      expect(result.data?.hasMore).toBe(true);
    });

    it("should return empty result when no tasks match", async () => {
      const mockResult = createMockPaginatedResult([], {
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks({ project: "Empty Project" });

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
      expect(result.data?.totalCount).toBe(0);
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
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response with default empty result", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks();

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
      expect(result.data?.totalCount).toBe(0);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<PaginatedResult<OFTask>>);

      const result = await queryTasks();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

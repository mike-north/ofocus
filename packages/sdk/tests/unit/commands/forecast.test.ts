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
import { queryForecast } from "../../../src/commands/forecast.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-123",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: "2024-12-31T00:00:00.000Z",
  deferDate: null,
  completionDate: null,
  projectId: null,
  projectName: null,
  tags: [],
  estimatedMinutes: null,
  ...overrides,
});

describe("queryForecast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject invalid start date format", async () => {
      const result = await queryForecast({ start: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid end date format", async () => {
      const result = await queryForecast({ end: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject zero days", async () => {
      const result = await queryForecast({ days: 0 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("positive integer");
    });

    it("should reject negative days", async () => {
      const result = await queryForecast({ days: -5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject non-integer days", async () => {
      const result = await queryForecast({ days: 3.5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid options", async () => {
      const mockTasks = [createMockTask()];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast({
        start: "2024-01-01",
        end: "2024-01-31",
      });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should return forecast tasks with default options", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", dueDate: "2024-06-01T00:00:00.000Z" }),
        createMockTask({ id: "task-2", dueDate: "2024-06-02T00:00:00.000Z" }),
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should filter by start date", async () => {
      const mockTasks = [
        createMockTask({ dueDate: "2024-07-01T00:00:00.000Z" }),
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast({ start: "2024-06-15" });

      expect(result.success).toBe(true);
    });

    it("should filter by end date", async () => {
      const mockTasks = [
        createMockTask({ dueDate: "2024-05-01T00:00:00.000Z" }),
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast({ end: "2024-06-01" });

      expect(result.success).toBe(true);
    });

    it("should filter by days", async () => {
      const mockTasks = [createMockTask()];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast({ days: 14 });

      expect(result.success).toBe(true);
    });

    it("should include deferred tasks when specified", async () => {
      const mockTasks = [
        createMockTask({ dueDate: "2024-06-01T00:00:00.000Z" }),
        createMockTask({
          dueDate: null,
          deferDate: "2024-06-02T00:00:00.000Z",
        }),
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast({ includeDeferred: true });

      expect(result.success).toBe(true);
    });

    it("should return empty array when no tasks in range", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: [],
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return empty array on undefined data", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast();

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

      const result = await queryForecast();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle OmniJS script error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS script error: TypeError: flattenedTasks is not a function",
        },
      } as OmniJSResult<OFTask[]>);

      const result = await queryForecast();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });
  });
});

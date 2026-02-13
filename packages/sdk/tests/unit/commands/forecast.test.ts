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
import { queryForecast } from "../../../src/commands/forecast.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-123",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: "2024-12-31",
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
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid end date format", async () => {
      const result = await queryForecast({ end: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
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

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryForecast({
        start: "2024-01-01",
        end: "2024-01-31",
      });

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should return forecast tasks with default options", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", dueDate: "2024-06-01" }),
        createMockTask({ id: "task-2", dueDate: "2024-06-02" }),
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryForecast();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should filter by start date", async () => {
      const mockTasks = [createMockTask({ dueDate: "2024-07-01" })];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryForecast({ start: "2024-06-15" });

      expect(result.success).toBe(true);
    });

    it("should filter by end date", async () => {
      const mockTasks = [createMockTask({ dueDate: "2024-05-01" })];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryForecast({ end: "2024-06-01" });

      expect(result.success).toBe(true);
    });

    it("should filter by days", async () => {
      const mockTasks = [createMockTask()];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryForecast({ days: 14 });

      expect(result.success).toBe(true);
    });

    it("should include deferred tasks when specified", async () => {
      const mockTasks = [
        createMockTask({ dueDate: "2024-06-01" }),
        createMockTask({ dueDate: null, deferDate: "2024-06-02" }),
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryForecast({ includeDeferred: true });

      expect(result.success).toBe(true);
    });

    it("should return empty array when no tasks in range", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFTask[]>);

      const result = await queryForecast();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return empty array on undefined data", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryForecast();

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

      const result = await queryForecast();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryForecast();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

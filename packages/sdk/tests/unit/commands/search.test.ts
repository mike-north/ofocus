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
import { searchTasks } from "../../../src/commands/search.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

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

describe("searchTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty query", async () => {
      const result = await searchTasks("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject whitespace-only query", async () => {
      const result = await searchTasks("   ");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject query with injection characters", async () => {
      const result = await searchTasks('test"query');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid query", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("valid query");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful search", () => {
    it("should return matching tasks", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", name: "Buy groceries" }),
        createMockTask({ id: "task-2", name: "Go grocery shopping" }),
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("grocery");

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should return empty array when no matches", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("nonexistent");

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should search by name scope", async () => {
      const mockTasks = [createMockTask({ name: "Meeting notes" })];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("meeting", { scope: "name" });

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        expect.stringContaining("containsText(name of t")
      );
    });

    it("should search by note scope", async () => {
      const mockTasks = [createMockTask({ note: "Important details here" })];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("important", { scope: "note" });

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        expect.stringContaining("containsText(note of t")
      );
    });

    it("should search both name and note by default", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("term");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        expect.stringContaining("containsText(name of t")
      );
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        expect.stringContaining("containsText(note of t")
      );
    });

    it("should include completed tasks when specified", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", completed: true }),
        createMockTask({ id: "task-2", completed: false }),
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("test", { includeCompleted: true });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should respect limit option", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("test", { limit: 10 });

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        expect.stringContaining("set maxResults to 10")
      );
    });

    it("should use default limit of 100", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("test");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        expect.stringContaining("set maxResults to 100")
      );
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

      const result = await searchTasks("test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript errors", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Script execution failed",
        },
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("test");

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFTask[]>);

      const result = await searchTasks("test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

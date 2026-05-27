import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask } from "../../../src/types.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Import after mocking
import { searchTasks } from "../../../src/commands/search.js";
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

describe("searchTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty query", async () => {
      const result = await searchTasks("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
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
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: [],
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("valid query");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful search", () => {
    it("should return matching tasks", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", name: "Buy groceries" }),
        createMockTask({ id: "task-2", name: "Go grocery shopping" }),
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("grocery");

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should return empty array when no matches", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: [],
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("nonexistent");

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should search by name scope using indexOf on t.name", async () => {
      const mockTasks = [createMockTask({ name: "Meeting notes" })];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("meeting", { scope: "name" });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledWith(
        expect.stringContaining("t.name.toLowerCase().indexOf(")
      );
    });

    it("should search by note scope using indexOf on t.note", async () => {
      const mockTasks = [createMockTask({ note: "Important details here" })];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("important", { scope: "note" });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledWith(
        expect.stringContaining("t.note && t.note.toLowerCase().indexOf(")
      );
    });

    it("should search both name and note by default", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: [],
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("term");

      expect(result.success).toBe(true);
      const scriptBody = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(scriptBody).toContain("t.name.toLowerCase().indexOf(");
      expect(scriptBody).toContain("t.note && t.note.toLowerCase().indexOf(");
    });

    it("should include completed tasks when specified", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", completed: true }),
        createMockTask({ id: "task-2", completed: false }),
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("test", { includeCompleted: true });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      // When includeCompleted is true, the completed-filter line must be absent
      const scriptBody = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(scriptBody).not.toContain("if (t.completed) return false");
    });

    it("should exclude completed tasks by default", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: [],
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("test");

      expect(result.success).toBe(true);
      const scriptBody = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(scriptBody).toContain("if (t.completed) return false");
    });

    it("should respect limit option", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: [],
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("test", { limit: 10 });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledWith(
        expect.stringContaining("var maxResults = 10")
      );
    });

    it("should use default limit of 100", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: [],
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("test");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledWith(
        expect.stringContaining("var maxResults = 100")
      );
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

      const result = await searchTasks("test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle OmniJS script errors", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "OmniJS script error",
        },
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("test");

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<OFTask[]>);

      const result = await searchTasks("test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

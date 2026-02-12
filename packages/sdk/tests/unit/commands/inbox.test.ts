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
import { addToInbox } from "../../../src/commands/inbox.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("addToInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject due date with invalid characters", async () => {
      // Dates with quotes are invalid (injection risk)
      const result = await addToInbox("Test task", { due: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject defer date with invalid characters", async () => {
      const result = await addToInbox("Test task", { defer: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject tags with invalid characters", async () => {
      const result = await addToInbox("Test task", { tags: ["valid", ""] });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should allow undefined optional fields", async () => {
      const mockTask: OFTask = {
        id: "task-123",
        name: "Test task",
        note: "",
        flagged: false,
        completed: false,
        dueDate: null,
        deferDate: null,
        completionDate: null,
        projectId: null,
        projectName: null,
        tags: [],
        estimatedMinutes: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await addToInbox("Test task");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful creation", () => {
    it("should create a basic task", async () => {
      const mockTask: OFTask = {
        id: "task-123",
        name: "Test task",
        note: "",
        flagged: false,
        completed: false,
        dueDate: null,
        deferDate: null,
        completionDate: null,
        projectId: null,
        projectName: null,
        tags: [],
        estimatedMinutes: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await addToInbox("Test task");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
      expect(result.error).toBeNull();
    });

    it("should create a task with all options", async () => {
      const mockTask: OFTask = {
        id: "task-456",
        name: "Full task",
        note: "Some notes",
        flagged: true,
        completed: false,
        dueDate: "2024-12-31",
        deferDate: "2024-12-01",
        completionDate: null,
        projectId: null,
        projectName: null,
        tags: ["work", "urgent"],
        estimatedMinutes: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTask>);

      const result = await addToInbox("Full task", {
        note: "Some notes",
        flag: true,
        due: "December 31, 2024",
        defer: "December 1, 2024",
        tags: ["work", "urgent"],
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
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
      } as AppleScriptResult<OFTask>);

      const result = await addToInbox("Test task");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript errors", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
          details: "Syntax error",
        },
      } as AppleScriptResult<OFTask>);

      const result = await addToInbox("Test task");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFTask>);

      const result = await addToInbox("Test task");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No task data returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFTask>);

      const result = await addToInbox("Test task");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

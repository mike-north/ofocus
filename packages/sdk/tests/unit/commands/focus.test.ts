import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { FocusResult } from "../../../src/commands/focus.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import { focusOn, unfocus, getFocused } from "../../../src/commands/focus.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("focusOn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should handle empty target by name", async () => {
      // validateProjectName allows empty strings, so the call proceeds to AppleScript
      // which will fail to find a target with empty name
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Target not found: ",
        },
      } as AppleScriptResult<FocusResult>);

      const result = await focusOn("");

      expect(result.success).toBe(false);
      expect(mockRunAppleScript).toHaveBeenCalled();
    });

    it("should reject empty target by ID", async () => {
      const result = await focusOn("", { byId: true });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject invalid ID format", async () => {
      const result = await focusOn('invalid"id', { byId: true });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should accept valid project name", async () => {
      const mockResult: FocusResult = {
        focused: true,
        targetId: "proj-123",
        targetName: "My Project",
        targetType: "project",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<FocusResult>);

      const result = await focusOn("My Project");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should accept valid ID", async () => {
      const mockResult: FocusResult = {
        focused: true,
        targetId: "abc-123",
        targetName: "Test Project",
        targetType: "project",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<FocusResult>);

      const result = await focusOn("abc-123", { byId: true });

      expect(result.success).toBe(true);
    });
  });

  describe("successful focus", () => {
    it("should focus on a project by name", async () => {
      const mockResult: FocusResult = {
        focused: true,
        targetId: "proj-456",
        targetName: "Work Projects",
        targetType: "project",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<FocusResult>);

      const result = await focusOn("Work Projects");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
    });

    it("should focus on a folder", async () => {
      const mockResult: FocusResult = {
        focused: true,
        targetId: "folder-789",
        targetName: "Personal",
        targetType: "folder",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<FocusResult>);

      const result = await focusOn("Personal");

      expect(result.success).toBe(true);
      expect(result.data?.targetType).toBe("folder");
    });
  });

  describe("error handling", () => {
    it("should handle target not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Target not found",
        },
      } as AppleScriptResult<FocusResult>);

      const result = await focusOn("Nonexistent Project");

      expect(result.success).toBe(false);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<FocusResult>);

      const result = await focusOn("Test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<FocusResult>);

      const result = await focusOn("Test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("unfocus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful unfocus", () => {
    it("should clear focus", async () => {
      const mockResult: FocusResult = {
        focused: false,
        targetId: null,
        targetName: null,
        targetType: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<FocusResult>);

      const result = await unfocus();

      expect(result.success).toBe(true);
      expect(result.data?.focused).toBe(false);
      expect(result.data?.targetId).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<FocusResult>);

      const result = await unfocus();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle script failure", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<FocusResult>);

      const result = await unfocus();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });
  });
});

describe("getFocused", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful get", () => {
    it("should return focused project", async () => {
      const mockResult: FocusResult = {
        focused: true,
        targetId: "proj-123",
        targetName: "Active Project",
        targetType: "project",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<FocusResult>);

      const result = await getFocused();

      expect(result.success).toBe(true);
      expect(result.data?.focused).toBe(true);
      expect(result.data?.targetName).toBe("Active Project");
    });

    it("should return no focus state", async () => {
      const mockResult: FocusResult = {
        focused: false,
        targetId: null,
        targetName: null,
        targetType: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<FocusResult>);

      const result = await getFocused();

      expect(result.success).toBe(true);
      expect(result.data?.focused).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<FocusResult>);

      const result = await getFocused();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

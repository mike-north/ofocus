import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { FocusResult } from "../../../src/commands/focus.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Import after mocking
import { focusOn, unfocus, getFocused } from "../../../src/commands/focus.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

describe("focusOn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should handle empty target by name", async () => {
      // validateProjectName allows empty strings, so the call proceeds to OmniJS
      // which will fail to find a target with empty name
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Target not found: ",
        },
      } as OmniJSResult<FocusResult>);

      const result = await focusOn("");

      expect(result.success).toBe(false);
      expect(mockRunOmniJS).toHaveBeenCalled();
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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<FocusResult>);

      const result = await focusOn("My Project");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should accept valid ID", async () => {
      const mockResult: FocusResult = {
        focused: true,
        targetId: "abc-123",
        targetName: "Test Project",
        targetType: "project",
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<FocusResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<FocusResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<FocusResult>);

      const result = await focusOn("Personal");

      expect(result.success).toBe(true);
      expect(result.data?.targetType).toBe("folder");
    });
  });

  describe("error handling", () => {
    it("should handle target not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Target not found",
        },
      } as OmniJSResult<FocusResult>);

      const result = await focusOn("Nonexistent Project");

      expect(result.success).toBe(false);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<FocusResult>);

      const result = await focusOn("Test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<FocusResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<FocusResult>);

      const result = await unfocus();

      expect(result.success).toBe(true);
      expect(result.data?.focused).toBe(false);
      expect(result.data?.targetId).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<FocusResult>);

      const result = await unfocus();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle script failure", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<FocusResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<FocusResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<FocusResult>);

      const result = await getFocused();

      expect(result.success).toBe(true);
      expect(result.data?.focused).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<FocusResult>);

      const result = await getFocused();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

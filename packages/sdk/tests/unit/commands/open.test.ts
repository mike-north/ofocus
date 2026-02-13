import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { OpenResult } from "../../../src/commands/open.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import { openItem } from "../../../src/commands/open.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("openItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty item ID", async () => {
      const result = await openItem("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject item ID with dangerous characters", async () => {
      const result = await openItem('item"; activate "Calculator"; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject item ID with newlines", async () => {
      const result = await openItem("item\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should accept valid item ID", async () => {
      const mockResult: OpenResult = {
        id: "item-123",
        type: "task",
        name: "Test item",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-123");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should accept item ID with underscores", async () => {
      const mockResult: OpenResult = {
        id: "item_with_underscores",
        type: "task",
        name: "Test item",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item_with_underscores");

      expect(result.success).toBe(true);
    });

    it("should reject item ID with periods", async () => {
      // Periods are not allowed in IDs per validation regex
      const result = await openItem("item.123.test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });
  });

  describe("type auto-detection", () => {
    it("should detect and open a task", async () => {
      const mockResult: OpenResult = {
        id: "task-123",
        type: "task",
        name: "My Task",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("task-123");

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe("task");
      expect(result.data?.name).toBe("My Task");
    });

    it("should detect and open a project", async () => {
      const mockResult: OpenResult = {
        id: "project-456",
        type: "project",
        name: "My Project",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("project-456");

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe("project");
      expect(result.data?.name).toBe("My Project");
    });

    it("should detect and open a folder", async () => {
      const mockResult: OpenResult = {
        id: "folder-789",
        type: "folder",
        name: "My Folder",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("folder-789");

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe("folder");
      expect(result.data?.name).toBe("My Folder");
    });

    it("should detect and open a tag", async () => {
      const mockResult: OpenResult = {
        id: "tag-999",
        type: "tag",
        name: "My Tag",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("tag-999");

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe("tag");
      expect(result.data?.name).toBe("My Tag");
    });
  });

  describe("successful opening", () => {
    it("should open an item and return result", async () => {
      const mockResult: OpenResult = {
        id: "item-789",
        type: "task",
        name: "Task to open",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: "item-789",
        type: "task",
        name: "Task to open",
        opened: true,
      });
      expect(result.error).toBeNull();
    });

    it("should handle item names with special characters", async () => {
      const mockResult: OpenResult = {
        id: "item-123",
        type: "project",
        name: "Project with \"quotes\" and 'apostrophes'",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-123");

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe(
        "Project with \"quotes\" and 'apostrophes'"
      );
    });

    it("should handle item IDs with hyphens", async () => {
      const mockResult: OpenResult = {
        id: "item-with-hyphens",
        type: "task",
        name: "Task",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-with-hyphens");

      expect(result.success).toBe(true);
    });

    it("should handle alphanumeric item IDs", async () => {
      const mockResult: OpenResult = {
        id: "abc123XYZ",
        type: "folder",
        name: "Folder",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("abc123XYZ");

      expect(result.success).toBe(true);
    });

    it("should verify opened flag is true", async () => {
      const mockResult: OpenResult = {
        id: "item-123",
        type: "task",
        name: "Task",
        opened: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-123");

      expect(result.success).toBe(true);
      expect(result.data?.opened).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle item not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Item not found with ID: nonexistent-item",
        },
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("nonexistent-item");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript execution error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
          details: "URL scheme error",
        },
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
      expect(result.error?.details).toBe("URL scheme error");
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to open item");
    });

    it("should handle activation error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Cannot activate OmniFocus",
        },
      } as AppleScriptResult<OpenResult>);

      const result = await openItem("item-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });
  });

  describe("negative tests", () => {
    it("should reject item ID with SQL injection attempt", async () => {
      const result = await openItem("item'; DROP TABLE items; --");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject item ID with backslashes", async () => {
      const result = await openItem("item\\123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject item ID with tabs", async () => {
      const result = await openItem("item\tid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject item ID with control characters", async () => {
      const result = await openItem("item\x00id");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject item ID with semicolons", async () => {
      const result = await openItem("item;123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });
});

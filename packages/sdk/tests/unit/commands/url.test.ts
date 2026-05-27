import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { UrlResult } from "../../../src/commands/url.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Import after mocking
import { generateUrl } from "../../../src/commands/url.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

describe("generateUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty ID", async () => {
      const result = await generateUrl("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject ID with whitespace only", async () => {
      const result = await generateUrl("   ");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject ID with invalid characters", async () => {
      const result = await generateUrl('task"id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject ID with special characters", async () => {
      const result = await generateUrl("task/id/path");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should accept valid alphanumeric ID", async () => {
      const mockResult: UrlResult = {
        id: "abc123",
        type: "task",
        url: "omnifocus:///task/abc123",
        name: "Test Task",
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("abc123");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should accept ID with hyphens", async () => {
      const mockResult: UrlResult = {
        id: "abc-123-def",
        type: "project",
        url: "omnifocus:///project/abc-123-def",
        name: "Test Project",
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("abc-123-def");

      expect(result.success).toBe(true);
    });

    it("should accept ID with underscores", async () => {
      const mockResult: UrlResult = {
        id: "task_with_underscores",
        type: "task",
        url: "omnifocus:///task/task_with_underscores",
        name: "Task",
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("task_with_underscores");

      expect(result.success).toBe(true);
    });
  });

  describe("successful URL generation", () => {
    it("should generate URL for a task", async () => {
      const mockResult: UrlResult = {
        id: "task-789",
        type: "task",
        url: "omnifocus:///task/task-789",
        name: "My Task",
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("task-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
      expect(result.data?.type).toBe("task");
      expect(result.data?.url).toContain("omnifocus:///task/");
    });

    it("should generate URL for a project", async () => {
      const mockResult: UrlResult = {
        id: "proj-456",
        type: "project",
        url: "omnifocus:///project/proj-456",
        name: "My Project",
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("proj-456");

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe("project");
    });

    it("should generate URL for a folder", async () => {
      const mockResult: UrlResult = {
        id: "folder-123",
        type: "folder",
        url: "omnifocus:///folder/folder-123",
        name: "My Folder",
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("folder-123");

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe("folder");
    });

    it("should generate URL for a tag", async () => {
      const mockResult: UrlResult = {
        id: "tag-999",
        type: "tag",
        url: "omnifocus:///tag/tag-999",
        name: "Important",
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("tag-999");

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe("tag");
    });
  });

  describe("error handling", () => {
    it("should handle item not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Item not found with ID: nonexistent",
        },
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("nonexistent");

      expect(result.success).toBe(false);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<UrlResult>);

      const result = await generateUrl("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

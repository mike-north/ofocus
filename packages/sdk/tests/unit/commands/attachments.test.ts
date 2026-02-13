import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type {
  AddAttachmentResult,
  ListAttachmentsResult,
  RemoveAttachmentResult,
} from "../../../src/commands/attachments.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Mock the fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

// Import after mocking
import {
  addAttachment,
  listAttachments,
  removeAttachment,
} from "../../../src/commands/attachments.js";
import { runAppleScript } from "../../../src/applescript.js";
import * as fs from "node:fs";

const mockRunAppleScript = vi.mocked(runAppleScript);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockStatSync = vi.mocked(fs.statSync);

describe("addAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await addAttachment("", "/path/to/file.pdf");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid task ID format", async () => {
      const result = await addAttachment('task"id', "/path/to/file.pdf");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject non-existent file", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await addAttachment(
        "task-123",
        "/path/to/nonexistent.pdf"
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("File not found");
    });

    it("should reject directory path", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => false } as ReturnType<
        typeof fs.statSync
      >);

      const result = await addAttachment("task-123", "/path/to/directory");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Not a file");
    });

    it("should accept valid task ID and file path", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as ReturnType<
        typeof fs.statSync
      >);

      const mockResult: AddAttachmentResult = {
        taskId: "task-123",
        taskName: "Test Task",
        fileName: "document.pdf",
        attached: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<AddAttachmentResult>);

      const result = await addAttachment("task-123", "/path/to/document.pdf");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful attachment", () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as ReturnType<
        typeof fs.statSync
      >);
    });

    it("should add attachment to task", async () => {
      const mockResult: AddAttachmentResult = {
        taskId: "task-123",
        taskName: "Test Task",
        fileName: "report.pdf",
        attached: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<AddAttachmentResult>);

      const result = await addAttachment("task-123", "/path/to/report.pdf");

      expect(result.success).toBe(true);
      expect(result.data?.attached).toBe(true);
      expect(result.data?.fileName).toBe("report.pdf");
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as ReturnType<
        typeof fs.statSync
      >);
    });

    it("should handle task not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Task not found",
        },
      } as AppleScriptResult<AddAttachmentResult>);

      const result = await addAttachment("nonexistent", "/path/to/file.pdf");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<AddAttachmentResult>);

      const result = await addAttachment("task-123", "/path/to/file.pdf");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<AddAttachmentResult>);

      const result = await addAttachment("task-123", "/path/to/file.pdf");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("listAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await listAttachments("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject invalid task ID format", async () => {
      const result = await listAttachments('task"id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });

  describe("successful listing", () => {
    it("should list task attachments", async () => {
      const mockResult: ListAttachmentsResult = {
        taskId: "task-123",
        taskName: "Test Task",
        attachments: [
          { id: "att-1", name: "file1.pdf", size: null, type: null },
          { id: "att-2", name: "file2.png", size: null, type: null },
        ],
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ListAttachmentsResult>);

      const result = await listAttachments("task-123");

      expect(result.success).toBe(true);
      expect(result.data?.attachments).toHaveLength(2);
    });

    it("should return empty attachments array", async () => {
      const mockResult: ListAttachmentsResult = {
        taskId: "task-123",
        taskName: "Test Task",
        attachments: [],
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ListAttachmentsResult>);

      const result = await listAttachments("task-123");

      expect(result.success).toBe(true);
      expect(result.data?.attachments).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should handle task not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Task not found",
        },
      } as AppleScriptResult<ListAttachmentsResult>);

      const result = await listAttachments("nonexistent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<ListAttachmentsResult>);

      const result = await listAttachments("task-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("removeAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await removeAttachment("", "attachment-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject invalid task ID format", async () => {
      const result = await removeAttachment('task"id', "attachment-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject empty attachment identifier", async () => {
      const result = await removeAttachment("task-123", "");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("required");
    });

    it("should reject whitespace-only attachment identifier", async () => {
      const result = await removeAttachment("task-123", "   ");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("required");
    });
  });

  describe("successful removal", () => {
    it("should remove attachment by ID", async () => {
      const mockResult: RemoveAttachmentResult = {
        taskId: "task-123",
        attachmentName: "document.pdf",
        removed: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "att-456");

      expect(result.success).toBe(true);
      expect(result.data?.removed).toBe(true);
    });

    it("should remove attachment by name", async () => {
      const mockResult: RemoveAttachmentResult = {
        taskId: "task-123",
        attachmentName: "notes.txt",
        removed: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "notes.txt");

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle attachment not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Attachment not found",
        },
      } as AppleScriptResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "nonexistent");

      expect(result.success).toBe(false);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "att-456");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "att-456");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

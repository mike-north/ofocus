import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type {
  AddAttachmentResult,
  ListAttachmentsResult,
  RemoveAttachmentResult,
} from "../../../src/commands/attachments.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Mock the fs module (sync API used for file validation and reading)
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Import after mocking
import {
  addAttachment,
  listAttachments,
  removeAttachment,
} from "../../../src/commands/attachments.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";
import * as fs from "node:fs";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockStatSync = vi.mocked(fs.statSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

/** Shared helper: configure fs mocks to simulate an existing, readable file. */
function setupExistingFile(): void {
  mockExistsSync.mockReturnValue(true);
  mockStatSync.mockReturnValue({ isFile: () => true } as ReturnType<
    typeof fs.statSync
  >);
  // Return a Buffer with fake file contents so base64 encoding succeeds
  mockReadFileSync.mockReturnValue(Buffer.from("fake file contents") as never);
}

describe("addAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await addAttachment("", "/path/to/file.pdf");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
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
      setupExistingFile();

      const mockResult: AddAttachmentResult = {
        taskId: "task-123",
        taskName: "Test Task",
        fileName: "document.pdf",
        attached: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<AddAttachmentResult>);

      const result = await addAttachment("task-123", "/path/to/document.pdf");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful attachment", () => {
    beforeEach(() => {
      setupExistingFile();
    });

    it("should add attachment to task", async () => {
      const mockResult: AddAttachmentResult = {
        taskId: "task-123",
        taskName: "Test Task",
        fileName: "report.pdf",
        attached: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<AddAttachmentResult>);

      const result = await addAttachment("task-123", "/path/to/report.pdf");

      expect(result.success).toBe(true);
      expect(result.data?.attached).toBe(true);
      expect(result.data?.fileName).toBe("report.pdf");
    });

    it("should read the file and pass it to OmniJS", async () => {
      const mockResult: AddAttachmentResult = {
        taskId: "task-123",
        taskName: "Test Task",
        fileName: "image.png",
        attached: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<AddAttachmentResult>);

      await addAttachment("task-123", "/path/to/image.png");

      // The implementation must read the file to produce base64 for OmniJS
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      setupExistingFile();
    });

    it("should handle task not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Task not found",
        },
      } as OmniJSResult<AddAttachmentResult>);

      const result = await addAttachment("nonexistent", "/path/to/file.pdf");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<AddAttachmentResult>);

      const result = await addAttachment("task-123", "/path/to/file.pdf");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<AddAttachmentResult>);

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
          { id: "file1.pdf", name: "file1.pdf", size: null, type: null },
          { id: "file2.png", name: "file2.png", size: null, type: null },
        ],
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<ListAttachmentsResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<ListAttachmentsResult>);

      const result = await listAttachments("task-123");

      expect(result.success).toBe(true);
      expect(result.data?.attachments).toEqual([]);
    });

    it("should expose attachment id equal to attachment name for removeAttachment compatibility", async () => {
      const mockResult: ListAttachmentsResult = {
        taskId: "task-123",
        taskName: "Test Task",
        attachments: [
          { id: "notes.txt", name: "notes.txt", size: null, type: null },
        ],
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<ListAttachmentsResult>);

      const result = await listAttachments("task-123");

      expect(result.success).toBe(true);
      const att = result.data?.attachments[0];
      expect(att?.id).toBe(att?.name);
    });
  });

  describe("error handling", () => {
    it("should handle task not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Task not found",
        },
      } as OmniJSResult<ListAttachmentsResult>);

      const result = await listAttachments("nonexistent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<ListAttachmentsResult>);

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
    it("should remove attachment by name", async () => {
      const mockResult: RemoveAttachmentResult = {
        taskId: "task-123",
        attachmentName: "document.pdf",
        removed: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "document.pdf");

      expect(result.success).toBe(true);
      expect(result.data?.removed).toBe(true);
    });

    it("should remove attachment using id returned by listAttachments", async () => {
      // OmniJS uses filename as the id (id === name from listAttachments)
      const mockResult: RemoveAttachmentResult = {
        taskId: "task-123",
        attachmentName: "notes.txt",
        removed: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "notes.txt");

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle attachment not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Attachment not found",
        },
      } as OmniJSResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "nonexistent");

      expect(result.success).toBe(false);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "att-456");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<RemoveAttachmentResult>);

      const result = await removeAttachment("task-123", "att-456");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

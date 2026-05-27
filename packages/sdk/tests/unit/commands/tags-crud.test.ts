import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type {
  OFTag,
  CreateTagOptions,
  UpdateTagOptions,
} from "../../../src/types.js";
import type { DeleteTagResult } from "../../../src/commands/tags-crud.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Import after mocking
import {
  createTag,
  updateTag,
  deleteTag,
} from "../../../src/commands/tags-crud.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const createMockTag = (overrides: Partial<OFTag> = {}): OFTag => ({
  id: "tag-123",
  name: "Test Tag",
  parentId: null,
  parentName: null,
  availableTaskCount: 5,
  ...overrides,
});

describe("createTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty tag name", async () => {
      const result = await createTag("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject tag name with dangerous characters", async () => {
      const result = await createTag('tag"name');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid parent tag ID", async () => {
      const result = await createTag("New Tag", {
        parentTagId: "bad\nid",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid parent tag name", async () => {
      const result = await createTag("New Tag", {
        parentTagName: 'bad"name',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should accept valid tag name", async () => {
      const mockTag = createMockTag({ name: "New Tag" });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const result = await createTag("New Tag");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful creation", () => {
    it("should create tag at root level", async () => {
      const mockTag = createMockTag({ name: "New Tag", parentId: null });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const result = await createTag("New Tag");

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("New Tag");
      expect(result.data?.parentId).toBeNull();
    });

    it("should create tag under parent by ID", async () => {
      const mockTag = createMockTag({
        name: "Child Tag",
        parentId: "parent-123",
        parentName: "Work",
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const options: CreateTagOptions = { parentTagId: "parent-123" };
      const result = await createTag("Child Tag", options);

      expect(result.success).toBe(true);
      expect(result.data?.parentId).toBe("parent-123");
    });

    it("should create tag under parent by name", async () => {
      const mockTag = createMockTag({
        name: "Child Tag",
        parentName: "Work",
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const options: CreateTagOptions = { parentTagName: "Work" };
      const result = await createTag("Child Tag", options);

      expect(result.success).toBe(true);
      expect(result.data?.parentName).toBe("Work");
    });

    it("should return the full tag object with availableTaskCount", async () => {
      const mockTag = createMockTag({
        id: "tag-999",
        name: "Urgent",
        availableTaskCount: 7,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const result = await createTag("Urgent");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTag);
    });
  });

  describe("error handling", () => {
    it("should handle parent tag not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "Tag not found",
        },
      } as OmniJSResult<OFTag>);

      const result = await createTag("Child Tag", {
        parentTagName: "Nonexistent",
      });

      expect(result.success).toBe(false);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<OFTag>);

      const result = await createTag("New Tag");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No tag data returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<OFTag>);

      const result = await createTag("New Tag");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to create tag");
    });

    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<OFTag>);

      const result = await createTag("New Tag");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });
  });
});

describe("updateTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty tag ID", async () => {
      const result = await updateTag("", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject tag ID with dangerous characters", async () => {
      const result = await updateTag('tag"; delete all tags; "', {
        name: "New Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject tag ID with newlines", async () => {
      const result = await updateTag("tag\nid", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid tag name with quotes", async () => {
      const result = await updateTag("tag-123", { name: 'Bad"Name' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid parent tag ID", async () => {
      const result = await updateTag("tag-123", {
        name: "Valid Name",
        parentTagId: "bad\nparent",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid parent tag name with backslash", async () => {
      const result = await updateTag("tag-123", {
        name: "Valid Name",
        parentTagName: "Bad\\Parent",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });
  });

  describe("successful updates", () => {
    it("should update tag name", async () => {
      const mockTag = createMockTag({ name: "Updated Name" });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const options: UpdateTagOptions = { name: "Updated Name" };
      const result = await updateTag("tag-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("Updated Name");
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should move tag to new parent by ID", async () => {
      const mockTag = createMockTag({
        id: "tag-123",
        name: "My Tag",
        parentId: "parent-456",
        parentName: "Work",
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const options: UpdateTagOptions = { parentTagId: "parent-456" };
      const result = await updateTag("tag-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.parentId).toBe("parent-456");
    });

    it("should move tag to new parent by name", async () => {
      const mockTag = createMockTag({
        id: "tag-123",
        name: "My Tag",
        parentId: "parent-789",
        parentName: "Work",
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const options: UpdateTagOptions = { parentTagName: "Work" };
      const result = await updateTag("tag-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.parentName).toBe("Work");
    });

    it("should update tag name and parent together", async () => {
      const mockTag = createMockTag({
        id: "tag-123",
        name: "Renamed Tag",
        parentId: "parent-456",
        parentName: "New Parent",
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const options: UpdateTagOptions = {
        name: "Renamed Tag",
        parentTagId: "parent-456",
      };
      const result = await updateTag("tag-123", options);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTag);
    });

    it("should handle tags with no parent", async () => {
      const mockTag = createMockTag({
        id: "tag-123",
        name: "Root Tag",
        parentId: null,
        parentName: null,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTag,
      } as OmniJSResult<OFTag>);

      const options: UpdateTagOptions = { name: "Root Tag" };
      const result = await updateTag("tag-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.parentId).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should handle tag not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TAG_NOT_FOUND,
          message: "Tag not found",
        },
      } as OmniJSResult<OFTag>);

      const result = await updateTag("nonexistent-tag", {
        name: "New Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TAG_NOT_FOUND);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<OFTag>);

      const result = await updateTag("tag-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle OmniJS execution error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS execution failed",
          details: "Permission denied",
        },
      } as OmniJSResult<OFTag>);

      const result = await updateTag("tag-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
      expect(result.error?.details).toBe("Permission denied");
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<OFTag>);

      const result = await updateTag("tag-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No tag data returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<OFTag>);

      const result = await updateTag("tag-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to update tag");
    });

    it("should handle parent tag not found during reparent", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TAG_NOT_FOUND,
          message: "Parent tag not found",
        },
      } as OmniJSResult<OFTag>);

      const result = await updateTag("tag-123", {
        parentTagId: "nonexistent-parent",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TAG_NOT_FOUND);
    });
  });

  describe("negative tests", () => {
    it("should reject tag ID with special characters", async () => {
      const result = await updateTag("tag-123'; activate 'Calculator';", {
        name: "Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject tag ID with control characters", async () => {
      const result = await updateTag("tag\x00id", { name: "Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });
});

describe("deleteTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty tag ID", async () => {
      const result = await deleteTag("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject tag ID with dangerous characters", async () => {
      const result = await deleteTag('tag"; delete all; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject tag ID with newlines", async () => {
      const result = await deleteTag("tag\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should accept valid tag ID", async () => {
      const mockResult: DeleteTagResult = {
        tagId: "tag-123",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("tag-123");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should accept tag ID with underscores", async () => {
      const mockResult: DeleteTagResult = {
        tagId: "tag_with_underscores",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("tag_with_underscores");

      expect(result.success).toBe(true);
    });

    it("should reject tag IDs with periods", async () => {
      // Periods are not allowed in IDs per validation regex
      const result = await deleteTag("tag.123.test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });
  });

  describe("successful deletion", () => {
    it("should delete a tag and return result", async () => {
      const mockResult: DeleteTagResult = {
        tagId: "tag-789",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("tag-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        tagId: "tag-789",
        deleted: true,
      });
      expect(result.error).toBeNull();
    });

    it("should handle tag IDs with hyphens", async () => {
      const mockResult: DeleteTagResult = {
        tagId: "tag-with-hyphens",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("tag-with-hyphens");

      expect(result.success).toBe(true);
    });

    it("should handle alphanumeric tag IDs", async () => {
      const mockResult: DeleteTagResult = {
        tagId: "abc123XYZ",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("abc123XYZ");

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle tag not found via runtime error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TAG_NOT_FOUND,
          message: "Tag not found",
        },
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("nonexistent-tag");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TAG_NOT_FOUND);
      expect(result.error?.message).toBe("Tag not found");
    });

    it("should surface TAG_NOT_FOUND when OmniJS returns not-found sentinel", async () => {
      // Regression: the OmniJS script returns { error: "not found", tagId } instead of throwing
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { error: "not found", tagId: "nonexistent-tag" },
      } as OmniJSResult<{ error: string; tagId: string }>);

      const result = await deleteTag("nonexistent-tag");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TAG_NOT_FOUND);
      expect(result.error?.message).toContain("nonexistent-tag");
    });

    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("tag-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle OmniJS execution error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS execution failed",
          details: "Access denied",
        },
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("tag-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
      expect(result.error?.details).toBe("Access denied");
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("tag-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<DeleteTagResult>);

      const result = await deleteTag("tag-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to delete tag");
    });
  });

  describe("negative tests", () => {
    it("should reject tag ID with SQL injection attempt", async () => {
      const result = await deleteTag("tag'; DROP TABLE tags; --");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject tag ID with backslashes", async () => {
      const result = await deleteTag("tag\\123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject tag ID with tabs", async () => {
      const result = await deleteTag("tag\tid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject tag ID with control characters", async () => {
      const result = await deleteTag("tag\x00id");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });
});

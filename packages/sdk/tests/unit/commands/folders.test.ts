import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFFolder, PaginatedResult } from "../../../src/types.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Import after mocking
import { createFolder, queryFolders } from "../../../src/commands/folders.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const createMockFolder = (overrides: Partial<OFFolder> = {}): OFFolder => ({
  id: "folder-123",
  name: "Test Folder",
  parentId: null,
  parentName: null,
  projectCount: 3,
  folderCount: 0,
  ...overrides,
});

const createMockPaginatedResult = (
  items: OFFolder[],
  overrides: Partial<PaginatedResult<OFFolder>> = {}
): PaginatedResult<OFFolder> => ({
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
  ...overrides,
});

describe("createFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty folder name", async () => {
      const result = await createFolder("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("cannot be empty");
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject whitespace-only folder name", async () => {
      const result = await createFolder("   ");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject folder name with dangerous characters", async () => {
      const result = await createFolder('folder"name');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid parent folder ID", async () => {
      const result = await createFolder("New Folder", {
        parentFolderId: 'bad"id',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject invalid parent folder name", async () => {
      const result = await createFolder("New Folder", {
        parentFolderName: 'bad"name',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid folder name", async () => {
      const mockFolder = createMockFolder({ name: "New Folder" });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as OmniJSResult<OFFolder>);

      const result = await createFolder("New Folder");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful creation", () => {
    it("should create folder at root level", async () => {
      const mockFolder = createMockFolder({
        name: "New Folder",
        parentId: null,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as OmniJSResult<OFFolder>);

      const result = await createFolder("New Folder");

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("New Folder");
    });

    it("should create folder inside parent by ID", async () => {
      const mockFolder = createMockFolder({
        name: "Child Folder",
        parentId: "parent-123",
        parentName: "Parent Folder",
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as OmniJSResult<OFFolder>);

      const result = await createFolder("Child Folder", {
        parentFolderId: "parent-123",
      });

      expect(result.success).toBe(true);
      expect(result.data?.parentId).toBe("parent-123");
    });

    it("should create folder inside parent by name", async () => {
      const mockFolder = createMockFolder({
        name: "Child Folder",
        parentName: "Work",
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as OmniJSResult<OFFolder>);

      const result = await createFolder("Child Folder", {
        parentFolderName: "Work",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle parent folder not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Folder not found",
        },
      } as OmniJSResult<OFFolder>);

      const result = await createFolder("New Folder", {
        parentFolderName: "Nonexistent",
      });

      expect(result.success).toBe(false);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<OFFolder>);

      const result = await createFolder("New Folder");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<OFFolder>);

      const result = await createFolder("New Folder");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("queryFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject invalid parent name", async () => {
      const result = await queryFolders({ parent: 'bad"name' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject negative limit", async () => {
      const result = await queryFolders({ limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject negative offset", async () => {
      const result = await queryFolders({ offset: -10 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid options", async () => {
      const mockResult = createMockPaginatedResult([createMockFolder()]);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFFolder>>);

      const result = await queryFolders({ limit: 50, offset: 0 });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should return paginated folders with default options", async () => {
      const mockFolders = [
        createMockFolder({ id: "folder-1" }),
        createMockFolder({ id: "folder-2" }),
      ];
      const mockResult = createMockPaginatedResult(mockFolders);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFFolder>>);

      const result = await queryFolders();

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.totalCount).toBe(2);
    });

    it("should filter by parent folder", async () => {
      const mockFolders = [createMockFolder({ parentName: "Work" })];
      const mockResult = createMockPaginatedResult(mockFolders);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFFolder>>);

      const result = await queryFolders({ parent: "Work" });

      expect(result.success).toBe(true);
    });

    it("should handle pagination with offset and limit", async () => {
      const mockFolders = [createMockFolder({ id: "folder-51" })];
      const mockResult = createMockPaginatedResult(mockFolders, {
        totalCount: 100,
        returnedCount: 1,
        hasMore: true,
        offset: 50,
        limit: 1,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFFolder>>);

      const result = await queryFolders({ offset: 50, limit: 1 });

      expect(result.success).toBe(true);
      expect(result.data?.offset).toBe(50);
      expect(result.data?.hasMore).toBe(true);
    });

    it("should return default empty result on undefined data", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<PaginatedResult<OFFolder>>);

      const result = await queryFolders();

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
      expect(result.data?.totalCount).toBe(0);
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
      } as OmniJSResult<PaginatedResult<OFFolder>>);

      const result = await queryFolders();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<PaginatedResult<OFFolder>>);

      const result = await queryFolders();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

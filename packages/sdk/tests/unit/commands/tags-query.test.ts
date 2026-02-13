import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { OFTag, PaginatedResult } from "../../../src/types.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runComposedScript: vi.fn(),
}));

// Mock the asset-loader module
vi.mock("../../../src/asset-loader.js", () => ({
  loadScriptContentCached: vi.fn().mockResolvedValue("-- mocked script"),
}));

// Import after mocking
import { queryTags } from "../../../src/commands/tags.js";
import { runComposedScript } from "../../../src/applescript.js";

const mockRunComposedScript = vi.mocked(runComposedScript);

const createMockTag = (overrides: Partial<OFTag> = {}): OFTag => ({
  id: "tag-123",
  name: "Test Tag",
  parentTagId: null,
  parentTagName: null,
  taskCount: 5,
  ...overrides,
});

const createMockPaginatedResult = (
  items: OFTag[],
  overrides: Partial<PaginatedResult<OFTag>> = {}
): PaginatedResult<OFTag> => ({
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
  ...overrides,
});

describe("queryTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject negative limit", async () => {
      const result = await queryTags({ limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunComposedScript).not.toHaveBeenCalled();
    });

    it("should reject negative offset", async () => {
      const result = await queryTags({ offset: -10 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject non-integer limit", async () => {
      const result = await queryTags({ limit: 10.5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid options", async () => {
      const mockResult = createMockPaginatedResult([createMockTag()]);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFTag>>);

      const result = await queryTags({ limit: 50, offset: 0 });

      expect(result.success).toBe(true);
      expect(mockRunComposedScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should return paginated tags with default options", async () => {
      const mockTags = [
        createMockTag({ id: "tag-1", name: "Work" }),
        createMockTag({ id: "tag-2", name: "Personal" }),
      ];
      const mockResult = createMockPaginatedResult(mockTags);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.totalCount).toBe(2);
    });

    it("should filter by parent tag", async () => {
      const mockTags = [
        createMockTag({ name: "Urgent", parentTagName: "Work" }),
      ];
      const mockResult = createMockPaginatedResult(mockTags);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFTag>>);

      const result = await queryTags({ parent: "Work" });

      expect(result.success).toBe(true);
    });

    it("should handle pagination with offset and limit", async () => {
      const mockTags = [createMockTag({ id: "tag-51" })];
      const mockResult = createMockPaginatedResult(mockTags, {
        totalCount: 100,
        returnedCount: 1,
        hasMore: true,
        offset: 50,
        limit: 1,
      });

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFTag>>);

      const result = await queryTags({ offset: 50, limit: 1 });

      expect(result.success).toBe(true);
      expect(result.data?.offset).toBe(50);
      expect(result.data?.hasMore).toBe(true);
    });

    it("should return empty result when no tags exist", async () => {
      const mockResult = createMockPaginatedResult([], {
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
      });

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
      expect(result.data?.totalCount).toBe(0);
    });

    it("should return default empty result on undefined data", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
      expect(result.data?.totalCount).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

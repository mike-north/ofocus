import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTag, PaginatedResult } from "../../../src/types.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Import after mocking
import { queryTags } from "../../../src/commands/tags.js";
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
      expect(mockRunOmniJS).not.toHaveBeenCalled();
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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTag>>);

      const result = await queryTags({ limit: 50, offset: 0 });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should return paginated tags with default options", async () => {
      const mockTags = [
        createMockTag({ id: "tag-1", name: "Work" }),
        createMockTag({ id: "tag-2", name: "Personal" }),
      ];
      const mockResult = createMockPaginatedResult(mockTags);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.totalCount).toBe(2);
    });

    it("should filter by parent tag", async () => {
      const mockTags = [
        createMockTag({ name: "Urgent", parentName: "Work" }),
      ];
      const mockResult = createMockPaginatedResult(mockTags);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTag>>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTag>>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
      expect(result.data?.totalCount).toBe(0);
    });

    it("should return default empty result on undefined data", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

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
      } as OmniJSResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle OmniJS script errors", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "OmniJS script error",
        },
      } as OmniJSResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<PaginatedResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

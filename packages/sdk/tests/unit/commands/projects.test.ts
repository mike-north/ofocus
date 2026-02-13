import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { OFProject, PaginatedResult } from "../../../src/types.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runComposedScript: vi.fn(),
}));

// Mock the asset-loader module
vi.mock("../../../src/asset-loader.js", () => ({
  loadScriptContentCached: vi.fn().mockResolvedValue("-- mocked script"),
}));

// Import after mocking
import { queryProjects } from "../../../src/commands/projects.js";
import { runComposedScript } from "../../../src/applescript.js";

const mockRunComposedScript = vi.mocked(runComposedScript);

const createMockProject = (overrides: Partial<OFProject> = {}): OFProject => ({
  id: "project-123",
  name: "Test Project",
  note: null,
  status: "active",
  sequential: false,
  folderId: null,
  folderName: null,
  taskCount: 5,
  remainingTaskCount: 3,
  ...overrides,
});

const createMockPaginatedResult = (
  items: OFProject[],
  overrides: Partial<PaginatedResult<OFProject>> = {}
): PaginatedResult<OFProject> => ({
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
  ...overrides,
});

describe("queryProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject negative limit", async () => {
      const result = await queryProjects({ limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunComposedScript).not.toHaveBeenCalled();
    });

    it("should reject negative offset", async () => {
      const result = await queryProjects({ offset: -10 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject non-integer limit", async () => {
      const result = await queryProjects({ limit: 10.5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid options", async () => {
      const mockResult = createMockPaginatedResult([createMockProject()]);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects({ limit: 50, offset: 0 });

      expect(result.success).toBe(true);
      expect(mockRunComposedScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should return paginated projects with default options", async () => {
      const mockProjects = [
        createMockProject({ id: "project-1" }),
        createMockProject({ id: "project-2" }),
      ];
      const mockResult = createMockPaginatedResult(mockProjects);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects();

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.totalCount).toBe(2);
    });

    it("should filter by status", async () => {
      const mockProjects = [createMockProject({ status: "on-hold" })];
      const mockResult = createMockPaginatedResult(mockProjects);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects({ status: "on-hold" });

      expect(result.success).toBe(true);
    });

    it("should filter by sequential", async () => {
      const mockProjects = [createMockProject({ sequential: true })];
      const mockResult = createMockPaginatedResult(mockProjects);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects({ sequential: true });

      expect(result.success).toBe(true);
    });

    it("should filter by folder", async () => {
      const mockProjects = [createMockProject({ folderName: "Work" })];
      const mockResult = createMockPaginatedResult(mockProjects);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects({ folder: "Work" });

      expect(result.success).toBe(true);
    });

    it("should handle pagination with offset and limit", async () => {
      const mockProjects = [createMockProject({ id: "project-51" })];
      const mockResult = createMockPaginatedResult(mockProjects, {
        totalCount: 100,
        returnedCount: 1,
        hasMore: true,
        offset: 50,
        limit: 1,
      });

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects({ offset: 50, limit: 1 });

      expect(result.success).toBe(true);
      expect(result.data?.offset).toBe(50);
      expect(result.data?.hasMore).toBe(true);
    });

    it("should return empty result when no projects match", async () => {
      const mockResult = createMockPaginatedResult([], {
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
      });

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects({ folder: "Nonexistent" });

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
      expect(result.data?.totalCount).toBe(0);
    });

    it("should return default empty result on undefined data", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects();

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
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<PaginatedResult<OFProject>>);

      const result = await queryProjects();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

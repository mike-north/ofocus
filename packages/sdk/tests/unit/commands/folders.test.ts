import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFFolder } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

// Mock the omnijs module. `runOmniJSWrapped` is the only OmniJS entry the
// refactored folders.ts uses; `escapeJSString` is still imported transitively
// by predicates.ts via the real (un-mocked) source path.
vi.mock("../../../src/omnijs.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/omnijs.js")>(
    "../../../src/omnijs.js"
  );
  return {
    ...actual,
    runOmniJSWrapped: vi.fn(),
  };
});

// Import after mocking
import { createFolder, queryFolders } from "../../../src/commands/folders.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

// ── Test helpers ─────────────────────────────────────────────────────────────

const createMockFolder = (overrides: Partial<OFFolder> = {}): OFFolder => ({
  id: "folder-123",
  name: "Test Folder",
  parentId: null,
  parentName: null,
  projectCount: 3,
  folderCount: 0,
  ...overrides,
});

const createMockListResult = (
  items: OFFolder[],
  overrides: Partial<Extract<QueryResult<OFFolder>, { kind: "list" }>> = {}
): Extract<QueryResult<OFFolder>, { kind: "list" }> => ({
  kind: "list",
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
  ...overrides,
});

/** Narrow a QueryResult to the list shape and fail fast if it isn't. */
function expectList(
  result: QueryResult<OFFolder> | null | undefined
): Extract<QueryResult<OFFolder>, { kind: "list" }> {
  expect(result).toBeDefined();
  expect(result?.kind).toBe("list");
  if (!result || result.kind !== "list")
    throw new Error("Expected list shape");
  return result;
}

// ── createFolder ──────────────────────────────────────────────────────────────

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
          code: ErrorCode.SCRIPT_ERROR,
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

// ── queryFolders ──────────────────────────────────────────────────────────────

describe("queryFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject invalid parent name (quotes)", async () => {
      const result = await queryFolders({ parent: 'bad"name' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject empty parent array", async () => {
      const result = await queryFolders({ parent: [] });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject empty ancestor array", async () => {
      const result = await queryFolders({ ancestor: [] });

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

    it("should reject unknown projection field", async () => {
      const result = await queryFolders({ fields: ["id", "doesNotExist"] });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject unknown sort key", async () => {
      const result = await queryFolders({ sort: ["bogusKey"] });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject mutually exclusive shape modifiers", async () => {
      const result = await queryFolders({ count: true, first: true });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject unknown groupBy key", async () => {
      const result = await queryFolders({ groupBy: "bogusKey" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid options", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockFolder()]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders({ limit: 50, offset: 0 });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("list-shape queries", () => {
    it("should return list result with default options", async () => {
      const mockFolders = [
        createMockFolder({ id: "folder-1" }),
        createMockFolder({ id: "folder-2" }),
      ];
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult(mockFolders),
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toHaveLength(2);
      expect(list.totalCount).toBe(2);
    });

    it("should filter by parent folder (single)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockFolder({ parentName: "Work" })]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders({ parent: "Work" });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.parent.name");
      expect(body).toContain('"Work"');
    });

    it("should filter by ancestor (transitive walk)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ ancestor: "Work" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("p = t.parent");
      expect(body).toContain("p = p.parent");
      expect(body).toContain('"Work"');
    });

    it("should filter by isRoot: true", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockFolder()]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ isRoot: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("(t.parent == null)");
    });

    it("should filter by hasProjects: true", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockFolder({ projectCount: 5 })]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ hasProjects: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("(t.projects.length > 0)");
    });

    it("should filter by status: active", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ status: "active" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("Folder.Status.Active");
    });

    it("should handle pagination with offset and limit", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult(
          [createMockFolder({ id: "folder-51" })],
          { totalCount: 100, returnedCount: 1, hasMore: true, offset: 50, limit: 1 }
        ),
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders({ offset: 50, limit: 1 });

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.offset).toBe(50);
      expect(list.hasMore).toBe(true);
    });
  });

  describe("aggregate shapes", () => {
    it("--count returns kind: 'count'", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "count", count: 7 },
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders({ count: true });

      expect(result.success).toBe(true);
      expect(result.data?.kind).toBe("count");
      if (result.data?.kind === "count") expect(result.data.count).toBe(7);
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain('kind: "count"');
    });

    it("--ids-only returns kind: 'ids'", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "ids", ids: ["a", "b"] },
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders({ idsOnly: true });
      expect(result.data?.kind).toBe("ids");
    });

    it("--first returns kind: 'single'", async () => {
      const folder = createMockFolder({ id: "folder-first" });
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "single", item: folder },
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders({ first: true });
      expect(result.data?.kind).toBe("single");
      if (result.data?.kind === "single") {
        expect(result.data.item?.id).toBe("folder-first");
      }
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("rows[0]");
    });

    it("--group-by parent returns kind: 'groups'", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "groups",
          groups: [{ key: "Work", count: 3 }],
          totalCount: 3,
        },
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders({ groupBy: "parent" });
      expect(result.data?.kind).toBe("groups");
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain('kind: "groups"');
      expect(body).toContain("(Root)");
    });

    it("--group-by status groups by active/dropped", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "groups", groups: [], totalCount: 0 },
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ groupBy: "status" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("Folder.Status.Active");
    });
  });

  describe("projection options", () => {
    it("--fields id,name limits the projection", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ fields: ["id", "name"] });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("id: t.id.primaryKey");
      expect(body).toContain("name: t.name");
      // Default field not requested — should not appear
      expect(body).not.toContain("projectCount");
    });

    it("extended fields like flattenedProjectCount are accessible", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ fields: ["id", "flattenedProjectCount", "status"] });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.flattenedProjects.length");
      expect(body).toContain("Folder.Status.Active");
    });
  });

  describe("sort options", () => {
    it("--sort name --reverse wraps comparator", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ sort: ["name"], reverse: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("rows.sort");
      expect(body).toContain("return -base(a, b)");
    });
  });

  describe("string predicates", () => {
    it("nameContains is case-insensitive by default", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ nameContains: "work" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.name.toLowerCase()");
      expect(body).toContain('"work"');
    });

    it("nameEquals with caseSensitive: true keeps original case", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFFolder>>);

      await queryFolders({ nameEquals: "Work", caseSensitive: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain('"Work"');
      expect(body).not.toContain("toLowerCase");
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
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response with default empty list", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toEqual([]);
      expect(list.totalCount).toBe(0);
    });

    it("default for count shape uses count: 0", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders({ count: true });
      expect(result.data?.kind).toBe("count");
      if (result.data?.kind === "count") expect(result.data.count).toBe(0);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<QueryResult<OFFolder>>);

      const result = await queryFolders();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

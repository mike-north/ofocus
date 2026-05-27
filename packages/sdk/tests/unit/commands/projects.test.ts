import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFProject } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

// Mock the omnijs module. `runOmniJSWrapped` is the only OmniJS entry the
// refactored projects.ts uses; `escapeJSString` is used by predicates.ts.
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
import { queryProjects } from "../../../src/commands/projects.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

// ─── Shared test factories ──────────────────────────────────────────────────

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

const createMockListResult = (
  items: OFProject[],
  overrides: Partial<Extract<QueryResult<OFProject>, { kind: "list" }>> = {}
): Extract<QueryResult<OFProject>, { kind: "list" }> => ({
  kind: "list",
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
  ...overrides,
});

/** Narrows to `kind: "list"` and throws if it isn't. */
function expectList(
  result: QueryResult<OFProject> | null | undefined
): Extract<QueryResult<OFProject>, { kind: "list" }> {
  expect(result).toBeDefined();
  expect(result?.kind).toBe("list");
  if (!result || result.kind !== "list")
    throw new Error("Expected list shape");
  return result;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("queryProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject negative limit", async () => {
      const result = await queryProjects({ limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
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

    it("should reject unknown projection field", async () => {
      const result = await queryProjects({ fields: ["id", "doesNotExist"] });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject unknown sort key", async () => {
      const result = await queryProjects({ sort: ["bogusKey"] });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject mutually exclusive shape modifiers", async () => {
      const result = await queryProjects({ count: true, first: true });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid folder name with quotes", async () => {
      const result = await queryProjects({ folder: 'bad"folder' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid dueBefore date format", async () => {
      const result = await queryProjects({ dueBefore: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should accept valid options", async () => {
      const mockResult = createMockListResult([createMockProject()]);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ limit: 50, offset: 0 });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful list-shape queries", () => {
    it("should return paginated projects with default options", async () => {
      const mockProjects = [
        createMockProject({ id: "project-1" }),
        createMockProject({ id: "project-2" }),
      ];
      const mockResult = createMockListResult(mockProjects);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toHaveLength(2);
      expect(list.totalCount).toBe(2);
    });

    it("should filter by status emitting Project.Status enum comparison", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockProject({ status: "on-hold" })]),
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ status: "on-hold" });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("Project.Status.OnHold");
    });

    it("should filter by active status", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ status: "active" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("Project.Status.Active");
    });

    it("should filter by sequential", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockProject({ sequential: true })]),
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ sequential: true });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.sequential");
    });

    it("should filter by folder (transitive walk)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockProject({ folderName: "Work" })]),
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ folder: "Work" });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("parentFolder");
      expect(body).toContain('"Work"');
    });

    it("should filter by multiple folders (array)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ folder: ["Work", "Personal"] });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain('"Work"');
      expect(body).toContain('"Personal"');
    });

    it("should filter by flagged", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ flagged: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.flagged");
    });

    it("should filter dueForReview", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ dueForReview: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.nextReviewDate");
      expect(body).toContain("new Date()");
    });

    it("should handle pagination with offset and limit", async () => {
      const mockResult = createMockListResult(
        [createMockProject({ id: "project-51" })],
        {
          totalCount: 100,
          returnedCount: 1,
          hasMore: true,
          offset: 50,
          limit: 1,
        }
      );

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ offset: 50, limit: 1 });

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.offset).toBe(50);
      expect(list.hasMore).toBe(true);
    });

    it("should return empty list when no projects match", async () => {
      const mockResult = createMockListResult([], {
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ folder: "Nonexistent" });

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toEqual([]);
      expect(list.totalCount).toBe(0);
    });

    it("uses flattenedProjects as the source collection", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects();
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("flattenedProjects");
    });
  });

  describe("aggregate shapes", () => {
    it("--count returns kind: 'count'", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "count", count: 7 },
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ count: true });
      expect(result.success).toBe(true);
      expect(result.data?.kind).toBe("count");
      if (result.data?.kind === "count") {
        expect(result.data.count).toBe(7);
      }
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain('kind: "count"');
    });

    it("--ids-only returns kind: 'ids'", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "ids", ids: ["p1", "p2"] },
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ idsOnly: true });
      expect(result.data?.kind).toBe("ids");
    });

    it("--first returns kind: 'single'", async () => {
      const proj = createMockProject({ id: "first-project" });
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "single", item: proj },
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ first: true });
      expect(result.data?.kind).toBe("single");
      if (result.data?.kind === "single") {
        expect(result.data.item?.id).toBe("first-project");
      }
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("rows[0]");
    });

    it("--last uses rows[length-1]", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "single", item: null },
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ last: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("rows[rows.length - 1]");
    });

    it("--group-by folder returns kind: 'groups'", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "groups",
          groups: [{ key: "Work", count: 3 }],
          totalCount: 3,
        },
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ groupBy: "folder" });
      expect(result.data?.kind).toBe("groups");
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain('kind: "groups"');
    });

    it("--group-by status emits Project.Status comparison", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "groups", groups: [], totalCount: 0 },
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ groupBy: "status" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("Project.Status.Active");
    });

    it("--group-by nextReviewBucket compiles bucket logic", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "groups", groups: [], totalCount: 0 },
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ groupBy: "nextReviewBucket" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("nextReviewDate");
      expect(body).toContain("overdue");
      expect(body).toContain("this-week");
    });

    it("rejects unknown groupBy key", async () => {
      const result = await queryProjects({ groupBy: "unknownKey" });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe("projection options", () => {
    it("--fields id,name limits the projection to those fields", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ fields: ["id", "name"] });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("id: t.id.primaryKey");
      expect(body).toContain("name: t.name");
      // Non-requested fields should not appear
      expect(body).not.toContain("sequential: t.sequential");
    });

    it("default fields include status, folderName, remainingTaskCount", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects();
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("remainingTaskCount");
      expect(body).toContain("status");
      expect(body).toContain("folderName");
    });

    it("opt-in fields like nextReviewDate are available", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ fields: ["id", "name", "nextReviewDate"] });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("nextReviewDate");
    });
  });

  describe("sort options", () => {
    it("--sort name --reverse wraps comparator", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ sort: ["name"], reverse: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("rows.sort");
      expect(body).toContain("return -base(a, b)");
    });
  });

  describe("predicate body generation", () => {
    it("status + folder combination includes both conditions", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({ status: "active", folder: "Work" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("Project.Status.Active");
      expect(body).toContain('"Work"');
    });

    it("dueForReview + sort nextReviewDate produces correct body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFProject>>);

      await queryProjects({
        dueForReview: true,
        sort: ["nextReviewDate"],
        fields: ["id", "name"],
      });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      // predicate
      expect(body).toContain("t.nextReviewDate != null");
      expect(body).toContain("new Date()");
      // sort by nextReviewDate
      expect(body).toContain("rows.sort");
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
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response with default empty list", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toEqual([]);
      expect(list.totalCount).toBe(0);
    });

    it("default for count shape uses count: 0", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects({ count: true });
      expect(result.data?.kind).toBe("count");
      if (result.data?.kind === "count") expect(result.data.count).toBe(0);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<QueryResult<OFProject>>);

      const result = await queryProjects();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

// Mock the omnijs module. `runOmniJSWrapped` is the only OmniJS entry the
// refactored tasks.ts uses; `escapeJSString` is still imported transitively by
// predicates.ts via the real (un-mocked) source path.
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
import { queryTasks } from "../../../src/commands/tasks.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-123",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: null,
  deferDate: null,
  completionDate: null,
  projectId: null,
  projectName: null,
  tags: [],
  estimatedMinutes: null,
  ...overrides,
});

const createMockListResult = (
  items: OFTask[],
  overrides: Partial<Extract<QueryResult<OFTask>, { kind: "list" }>> = {}
): Extract<QueryResult<OFTask>, { kind: "list" }> => ({
  kind: "list",
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
  ...overrides,
});

function expectList(
  result: QueryResult<OFTask> | null | undefined
): Extract<QueryResult<OFTask>, { kind: "list" }> {
  expect(result).toBeDefined();
  expect(result?.kind).toBe("list");
  if (!result || result.kind !== "list") throw new Error("Expected list shape");
  return result;
}

describe("queryTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject invalid dueBefore date format", async () => {
      const result = await queryTasks({ dueBefore: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid dueAfter date format", async () => {
      const result = await queryTasks({ dueAfter: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject invalid project name", async () => {
      const result = await queryTasks({ project: 'bad"project' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject negative limit", async () => {
      const result = await queryTasks({ limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject negative offset", async () => {
      const result = await queryTasks({ offset: -10 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject non-integer limit", async () => {
      const result = await queryTasks({ limit: 10.5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject unknown projection field", async () => {
      const result = await queryTasks({ fields: ["id", "doesNotExist"] });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject unknown sort key", async () => {
      const result = await queryTasks({ sort: ["bogusKey"] });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject mutually exclusive shape modifiers", async () => {
      const result = await queryTasks({ count: true, first: true });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid options", async () => {
      const mockResult = createMockListResult([createMockTask()]);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({
        project: "Valid Project",
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful list-shape queries", () => {
    it("should return paginated tasks with default options", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1" }),
        createMockTask({ id: "task-2" }),
      ];
      const mockResult = createMockListResult(mockTasks);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toHaveLength(2);
      expect(list.totalCount).toBe(2);
    });

    it("should filter by completed status", async () => {
      const mockResult = createMockListResult([
        createMockTask({ completed: true }),
      ]);

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ completed: true });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.completed");
    });

    it("should filter by flagged status", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockTask({ flagged: true })]),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ flagged: true });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.flagged");
    });

    it("should filter by available status", async () => {
      // available=true emits actionable statuses: Available, Next, DueSoon, Overdue.
      // The old code used non-existent t.completed/t.effectivelyDropped/t.blocked.
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ available: true });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("Task.Status.Available");
      expect(body).toContain("Task.Status.Next");
      expect(body).toContain("Task.Status.DueSoon");
      expect(body).toContain("Task.Status.Overdue");
    });

    it("should handle pagination with offset and limit", async () => {
      const mockResult = createMockListResult(
        [createMockTask({ id: "task-51" })],
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
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ offset: 50, limit: 1 });

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.offset).toBe(50);
      expect(list.hasMore).toBe(true);
    });

    it("should return empty list when no tasks match", async () => {
      const mockResult = createMockListResult([], {
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ project: "Empty Project" });

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toEqual([]);
      expect(list.totalCount).toBe(0);
    });
  });

  describe("aggregate shapes", () => {
    it("--count returns kind: 'count'", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "count", count: 42 },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ count: true });
      expect(result.success).toBe(true);
      expect(result.data?.kind).toBe("count");
      if (result.data?.kind === "count") {
        expect(result.data.count).toBe(42);
      }
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain('kind: "count"');
    });

    it("--ids-only returns kind: 'ids'", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "ids", ids: ["a", "b", "c"] },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ idsOnly: true });
      expect(result.data?.kind).toBe("ids");
      if (result.data?.kind === "ids") {
        expect(result.data.ids).toEqual(["a", "b", "c"]);
      }
    });

    it("--first returns kind: 'single'", async () => {
      const task = createMockTask({ id: "task-first" });
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "single", item: task },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ first: true });
      expect(result.data?.kind).toBe("single");
      if (result.data?.kind === "single") {
        expect(result.data.item?.id).toBe("task-first");
      }
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("rows[0]");
    });

    it("--last uses rows[length-1]", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "single", item: null },
      } as OmniJSResult<QueryResult<OFTask>>);

      await queryTasks({ last: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("rows[rows.length - 1]");
    });

    it("--group-by project returns kind: 'groups'", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "groups",
          groups: [{ key: "Work", count: 5 }],
          totalCount: 5,
        },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ groupBy: "project" });
      expect(result.data?.kind).toBe("groups");
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain('kind: "groups"');
    });

    it("--group-by dueBucket compiles bucket logic", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "groups", groups: [], totalCount: 0 },
      } as OmniJSResult<QueryResult<OFTask>>);

      await queryTasks({ groupBy: "dueBucket" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("overdue");
      expect(body).toContain("this-week");
    });
  });

  describe("projection options", () => {
    it("--fields id,name limits the projection", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      await queryTasks({ fields: ["id", "name"] });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("id: t.id.primaryKey");
      expect(body).toContain("name: t.name");
      // Default fields not requested should not appear in the projection.
      expect(body).not.toContain("flagged: t.flagged");
    });
  });

  describe("sort options", () => {
    it("--sort due,name --reverse wraps comparator", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      await queryTasks({ sort: ["dueDate", "name"], reverse: true });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("rows.sort");
      expect(body).toContain("return -base(a, b)");
    });
  });

  describe("string + date predicates", () => {
    it('nameContains "foo" emits case-insensitive substring check', async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      await queryTasks({ nameContains: "foo" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.name.toLowerCase()");
      expect(body).toContain('"foo"');
    });

    it('dueWithin "7d" emits an upper-bound Date comparison', async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      await queryTasks({ dueWithin: "7d" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain("t.dueDate >= new Date()");
      expect(body).toContain("t.dueDate <=");
    });

    it("tag with mode 'any' uses .some()", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      await queryTasks({ tag: ["Work", "Home"], tagMode: "any" });
      const body = mockRunOmniJS.mock.calls[0]?.[0];
      expect(body).toContain('["Work", "Home"]');
      expect(body).toContain(".some");
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
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response with default empty list", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toEqual([]);
      expect(list.totalCount).toBe(0);
    });

    it("default for count shape uses count: 0", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ count: true });
      expect(result.data?.kind).toBe("count");
      if (result.data?.kind === "count") expect(result.data.count).toBe(0);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe("--all flag", () => {
    it("rejects all=true combined with limit", async () => {
      const result = await queryTasks({ all: true, limit: 5 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("Cannot combine --all");
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects all=true combined with offset", async () => {
      const result = await queryTasks({ all: true, offset: 10 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("accepts all=true with no limit or offset and emits full-scan body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockTask()]),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryTasks({ all: true });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      // full-scan body maps all rows without __paged slice
      expect(body).toContain("rows.map(__mapFn)");
      expect(body).not.toContain("__paged");
    });
  });
});

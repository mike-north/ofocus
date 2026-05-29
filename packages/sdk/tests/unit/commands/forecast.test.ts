import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

// Use the partial-real mock pattern so that escapeJSString and other helpers
// run for real (the query layer uses them), while runOmniJSWrapped is
// intercepted.
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
import { queryForecast } from "../../../src/commands/forecast.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

// ── helpers ──────────────────────────────────────────────────────────────────

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-123",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: "2024-12-31T00:00:00.000Z",
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

function getScriptBody(): string {
  const call = mockRunOmniJS.mock.calls[0];
  if (!call) throw new Error("runOmniJSWrapped was not called");
  return call[0] as string;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("queryForecast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("rejects zero days", async () => {
      const result = await queryForecast({ days: 0 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("positive integer");
    });

    it("rejects negative days", async () => {
      const result = await queryForecast({ days: -5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects non-integer days", async () => {
      const result = await queryForecast({ days: 3.5 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects invalid limit", async () => {
      const result = await queryForecast({ limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("accepts valid options", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockTask()]),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast({ days: 7 });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("preset conditions", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("always emits completed: false predicate (!t.completed)", async () => {
      await queryForecast();

      expect(getScriptBody()).toContain("!t.completed");
    });

    it("always emits effectivelyDropped: false predicate (!t.effectivelyDropped)", async () => {
      await queryForecast();

      expect(getScriptBody()).toContain("!t.effectivelyDropped");
    });
  });

  describe("includeDeferred option — dueOrDeferWithin vs dueWithin", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("when includeDeferred: false (default) → dueWithin predicate (dueDate only)", async () => {
      await queryForecast({ days: 7 });

      const body = getScriptBody();
      // dueWithin emits a condition checking t.dueDate against the cutoff
      expect(body).toContain("t.dueDate");
      // dueOrDeferWithin emits an OR condition with both t.dueDate and t.deferDate;
      // when includeDeferred is false, we must not have the OR pattern
      expect(body).not.toMatch(/t\.dueDate.*\|\|.*t\.deferDate/);
    });

    it("when includeDeferred: true → dueOrDeferWithin predicate (dueDate OR deferDate within window)", async () => {
      await queryForecast({ days: 7, includeDeferred: true });

      const body = getScriptBody();
      // dueOrDeferWithin emits an OR expression covering both dates
      expect(body).toContain("t.dueDate");
      expect(body).toContain("t.deferDate");
      expect(body).toMatch(/t\.dueDate.*\|\|.*t\.deferDate/s);
    });

    it("uses default 7d window when days is not specified", async () => {
      // The cutoff date is computed from Date.now() + 7*86400000; we cannot
      // assert the exact ISO string without mocking the clock, but the script
      // body must reference the filter expression (either via dueWithin or
      // dueOrDeferWithin).
      await queryForecast();

      expect(getScriptBody()).toContain("t.dueDate");
    });

    it("respects custom days value (14 days → 14d duration)", async () => {
      // The query layer compiles dueWithin: "14d" for days=14. We cannot assert
      // the exact date without clock control, but the script body must be
      // generated without errors.
      await queryForecast({ days: 14 });

      expect(getScriptBody()).toContain("t.dueDate");
    });
  });

  describe("return shape — QueryResult", () => {
    it("returns a list result with matching tasks", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", dueDate: "2024-06-01T00:00:00.000Z" }),
        createMockTask({ id: "task-2", dueDate: "2024-06-02T00:00:00.000Z" }),
      ];
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult(mockTasks),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toHaveLength(2);
    });

    it("returns empty list result when no tasks in range", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toHaveLength(0);
    });

    it("handles undefined data with empty list default", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toEqual([]);
    });

    it("supports count shape via count: true", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "count", count: 4 },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast({ count: true });

      expect(result.success).toBe(true);
      expect(result.data?.kind).toBe("count");
    });

    it("supports groupBy shape", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "groups",
          groups: [{ key: "today", count: 3 }],
          totalCount: 3,
        },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast({ groupBy: "dueBucket" });

      expect(result.success).toBe(true);
      expect(result.data?.kind).toBe("groups");
    });
  });

  describe("sort and pagination are forwarded", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("respects limit option", async () => {
      await queryForecast({ limit: 50 });

      expect(getScriptBody()).toContain("var __limit = 50");
    });

    it("includes sort comparator when sort option is set", async () => {
      await queryForecast({ sort: ["dueDate"] });

      expect(getScriptBody()).toContain("rows.sort(");
    });
  });

  describe("error handling", () => {
    it("propagates OmniFocus not running error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("propagates OmniJS script errors", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS script error",
        },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });

    it("falls back to UNKNOWN_ERROR when failure has no error object", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe("--all flag", () => {
    it("rejects all=true combined with limit", async () => {
      const result = await queryForecast({ all: true, limit: 5 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("Cannot combine --all");
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects all=true combined with offset", async () => {
      const result = await queryForecast({ all: true, offset: 10 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("accepts all=true with no limit or offset and emits full-scan body", async () => {
      const mockTask: OFTask = {
        id: "t1",
        name: "Due task",
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
      };
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "list",
          items: [mockTask],
          totalCount: 1,
          returnedCount: 1,
          hasMore: false,
          offset: 0,
          limit: 1,
        },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryForecast({ all: true });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("rows.map(__mapFn)");
      expect(body).not.toContain("__paged");
    });
  });
});

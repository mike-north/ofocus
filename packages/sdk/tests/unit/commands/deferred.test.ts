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
import { queryDeferred } from "../../../src/commands/deferred.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

// ── helpers ──────────────────────────────────────────────────────────────────

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-123",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: null,
  deferDate: "2024-12-31T00:00:00.000Z",
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

describe("queryDeferred", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("rejects invalid deferAfter date format", async () => {
      const result = await queryDeferred({ deferAfter: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects invalid deferBefore date format", async () => {
      const result = await queryDeferred({ deferBefore: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects invalid limit", async () => {
      const result = await queryDeferred({ limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("accepts valid date options", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockTask()]),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryDeferred({
        deferAfter: "2024-01-01",
        deferBefore: "2024-12-31",
      });

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

    it("always emits hasDefer predicate (t.deferDate != null)", async () => {
      await queryDeferred();

      expect(getScriptBody()).toContain("(t.deferDate != null)");
    });

    it("always emits completed: false predicate (!t.completed)", async () => {
      await queryDeferred();

      expect(getScriptBody()).toContain("!t.completed");
    });

    it("always emits effectivelyDropped: false predicate (!t.effectivelyDropped)", async () => {
      await queryDeferred();

      expect(getScriptBody()).toContain("!t.effectivelyDropped");
    });
  });

  describe("blockedOnly option", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("when blockedOnly: true → emits deferredToFuture predicate (deferDate > new Date())", async () => {
      await queryDeferred({ blockedOnly: true });

      expect(getScriptBody()).toContain(
        "(t.deferDate != null && t.deferDate > new Date())"
      );
    });

    it("when blockedOnly: false (default) → no deferredToFuture predicate", async () => {
      await queryDeferred({ blockedOnly: false });

      // Only the deferDate != null from hasDefer, not the > new Date() guard
      expect(getScriptBody()).not.toContain("t.deferDate > new Date()");
    });
  });

  describe("date range predicates", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("deferAfter emits deferDate > expr predicate", async () => {
      await queryDeferred({ deferAfter: "2024-06-01" });

      expect(getScriptBody()).toContain("t.deferDate > ");
    });

    it("deferBefore emits deferDate < expr predicate", async () => {
      await queryDeferred({ deferBefore: "2024-12-31" });

      expect(getScriptBody()).toContain("t.deferDate < ");
    });
  });

  describe("return shape — QueryResult", () => {
    it("returns deferred tasks as a list result", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", deferDate: "2024-06-01T00:00:00.000Z" }),
        createMockTask({ id: "task-2", deferDate: "2024-07-01T00:00:00.000Z" }),
      ];
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult(mockTasks),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryDeferred();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toHaveLength(2);
    });

    it("returns empty list on undefined data", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryDeferred();

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toEqual([]);
    });

    it("supports count shape via count: true", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "count", count: 3 },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryDeferred({ count: true });

      expect(result.success).toBe(true);
      expect(result.data?.kind).toBe("count");
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
      await queryDeferred({ limit: 25 });

      expect(getScriptBody()).toContain("var __limit = 25");
    });

    it("includes sort comparator when sort option is set", async () => {
      await queryDeferred({ sort: ["deferDate"] });

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

      const result = await queryDeferred();

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

      const result = await queryDeferred();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });

    it("falls back to UNKNOWN_ERROR when failure has no error object", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryDeferred();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe("--all flag", () => {
    it("rejects all=true combined with limit", async () => {
      const result = await queryDeferred({ all: true, limit: 5 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("Cannot combine --all");
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects all=true combined with offset", async () => {
      const result = await queryDeferred({ all: true, offset: 10 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("accepts all=true with no limit or offset and emits full-scan body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "list",
          items: [],
          totalCount: 0,
          returnedCount: 0,
          hasMore: false,
          offset: 0,
          limit: 0,
        },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await queryDeferred({ all: true });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("rows.map(__mapFn)");
      expect(body).not.toContain("__paged");
    });
  });
});

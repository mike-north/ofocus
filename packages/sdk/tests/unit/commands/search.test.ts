import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

// Use the partial-real mock pattern so that escapeJSString and other helpers
// run for real (the query layer uses them to produce OmniJS expressions we
// assert against), while runOmniJSWrapped is intercepted.
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
import { searchTasks } from "../../../src/commands/search.js";
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

describe("searchTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("rejects empty query", async () => {
      const result = await searchTasks("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects whitespace-only query", async () => {
      const result = await searchTasks("   ");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects query with injection characters (double-quote)", async () => {
      const result = await searchTasks('test"query');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects invalid limit", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await searchTasks("test", { limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("accepts valid query", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await searchTasks("valid query");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("scope → predicate mapping", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("scope='name' → nameContains predicate (indexOf on t.name)", async () => {
      await searchTasks("meeting", { scope: "name" });

      expect(getScriptBody()).toContain("t.name.toLowerCase().indexOf(");
      expect(getScriptBody()).not.toContain("t.note");
    });

    it("scope='note' → noteContains predicate (indexOf on t.note)", async () => {
      await searchTasks("important", { scope: "note" });

      const body = getScriptBody();
      expect(body).toContain("(t.note || '').toLowerCase().indexOf(");
      expect(body).not.toContain("t.name.toLowerCase()");
    });

    it("scope='both' (default) → nameOrNoteContains predicate — matches name OR note", async () => {
      await searchTasks("term");

      const body = getScriptBody();
      // nameOrNoteContains emits an OR expression covering both name and note
      expect(body).toContain("t.name.toLowerCase().indexOf(");
      expect(body).toContain("t.note && t.note.toLowerCase().indexOf(");
    });

    it("explicit scope='both' → same OR predicate", async () => {
      await searchTasks("term", { scope: "both" });

      const body = getScriptBody();
      expect(body).toContain("t.name.toLowerCase().indexOf(");
      expect(body).toContain("t.note && t.note.toLowerCase().indexOf(");
    });
  });

  describe("includeCompleted", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("excludes completed tasks by default (completed: false predicate)", async () => {
      await searchTasks("test");

      expect(getScriptBody()).toContain("!t.completed");
    });

    it("includes completed tasks when includeCompleted: true (no completed predicate)", async () => {
      await searchTasks("test", { includeCompleted: true });

      // completed: false is not set — the completed predicate must be absent
      expect(getScriptBody()).not.toContain("!t.completed");
    });
  });

  describe("return shape — QueryResult", () => {
    it("returns a list result with matching tasks", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", name: "Buy groceries" }),
        createMockTask({ id: "task-2", name: "Go grocery shopping" }),
      ];
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult(mockTasks),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await searchTasks("grocery");

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toHaveLength(2);
    });

    it("returns empty list result when no matches", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await searchTasks("nonexistent");

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toHaveLength(0);
    });

    it("handles undefined data response with empty list default", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await searchTasks("test");

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toEqual([]);
    });

    it("supports count shape via count: true", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "count", count: 5 },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await searchTasks("test", { count: true });

      expect(result.success).toBe(true);
      expect(result.data?.kind).toBe("count");
    });
  });

  describe("pagination and sort are forwarded", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("respects limit option", async () => {
      await searchTasks("test", { limit: 10 });

      expect(getScriptBody()).toContain("var __limit = 10");
    });

    it("uses default limit of 100", async () => {
      await searchTasks("test");

      expect(getScriptBody()).toContain("var __limit = 100");
    });

    it("respects offset option", async () => {
      await searchTasks("test", { offset: 20 });

      expect(getScriptBody()).toContain("var __offset = 20");
    });

    it("includes sort comparator when sort option is set", async () => {
      await searchTasks("test", { sort: ["dueDate"] });

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

      const result = await searchTasks("test");

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

      const result = await searchTasks("test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });

    it("falls back to UNKNOWN_ERROR when failure has no error object", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await searchTasks("test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe("--all flag", () => {
    it("rejects all=true combined with limit", async () => {
      const result = await searchTasks("meeting", { all: true, limit: 5 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("Cannot combine --all");
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects all=true combined with offset", async () => {
      const result = await searchTasks("meeting", { all: true, offset: 10 });
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

      const result = await searchTasks("meeting", { all: true });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("rows.map(__mapFn)");
      expect(body).not.toContain("__paged");
    });
  });
});

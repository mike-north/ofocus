import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTag } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
}));

// Import after mocking
import { queryTags } from "../../../src/commands/tags.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

/** Minimal OFTag fixture factory */
const makeTag = (overrides: Partial<OFTag> = {}): OFTag => ({
  id: "tag-123",
  name: "Test Tag",
  parentId: null,
  parentName: null,
  availableTaskCount: 5,
  ...overrides,
});

/** Wrap items in the canonical list QueryResult */
const makeListResult = (
  items: OFTag[],
  overrides: Partial<Extract<QueryResult<OFTag>, { kind: "list" }>> = {}
): QueryResult<OFTag> => ({
  kind: "list",
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

  // ── Pagination validation ────────────────────────────────────────────────
  describe("pagination validation", () => {
    it("rejects negative limit without calling OmniJS", async () => {
      const result = await queryTags({ limit: -1 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects negative offset", async () => {
      const result = await queryTags({ offset: -10 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects non-integer limit", async () => {
      const result = await queryTags({ limit: 10.5 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  // ── Query-layer predicate validation ─────────────────────────────────────
  describe("predicate validation", () => {
    it("rejects empty parent array before calling OmniJS", async () => {
      const result = await queryTags({ parent: [] });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects empty ancestor array", async () => {
      const result = await queryTags({ ancestor: [] });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects unknown field in fields array", async () => {
      const result = await queryTags({ fields: ["nonexistent"] });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects unknown sort field", async () => {
      const result = await queryTags({ sort: ["nonexistent"] });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects unknown groupBy key", async () => {
      const result = await queryTags({ groupBy: "nonexistent" });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  // ── Successful list queries ───────────────────────────────────────────────
  describe("successful list queries", () => {
    it("returns a list result with default options", async () => {
      const tags = [
        makeTag({ id: "tag-1", name: "Work" }),
        makeTag({ id: "tag-2", name: "Personal" }),
      ];
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeListResult(tags),
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ kind: "list" });
      if (result.data?.kind === "list") {
        expect(result.data.items).toHaveLength(2);
        expect(result.data.totalCount).toBe(2);
      }
    });

    it("handles pagination with offset and limit", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeListResult([makeTag({ id: "tag-51" })], {
          totalCount: 100,
          returnedCount: 1,
          hasMore: true,
          offset: 50,
          limit: 1,
        }),
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ offset: 50, limit: 1 });

      expect(result.success).toBe(true);
      if (result.data?.kind === "list") {
        expect(result.data.offset).toBe(50);
        expect(result.data.hasMore).toBe(true);
      }
    });

    it("returns empty list result when no tags exist", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeListResult([], { totalCount: 0, returnedCount: 0 }),
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(true);
      if (result.data?.kind === "list") {
        expect(result.data.items).toEqual([]);
        expect(result.data.totalCount).toBe(0);
      }
    });

    it("returns a default empty list result when OmniJS returns undefined data", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        kind: "list",
        items: [],
        totalCount: 0,
      });
    });
  });

  // ── Shape variants ────────────────────────────────────────────────────────
  describe("shape variants", () => {
    it("count: true returns a count result", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "count", count: 42 } satisfies QueryResult<OFTag>,
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ count: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ kind: "count", count: 42 });
    });

    it("idsOnly: true returns an ids result", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "ids",
          ids: ["id-1", "id-2"],
        } satisfies QueryResult<OFTag>,
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ idsOnly: true });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ kind: "ids" });
    });

    it("first: true returns a single-item result", async () => {
      const tag = makeTag();
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "single", item: tag } satisfies QueryResult<OFTag>,
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ first: true });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ kind: "single" });
    });

    it("groupBy: parent returns a groups result", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "groups",
          groups: [{ key: "(Root)", count: 3 }],
          totalCount: 3,
        } satisfies QueryResult<OFTag>,
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ groupBy: "parent" });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ kind: "groups" });
    });

    it("groupBy: status is a valid group key", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "groups",
          groups: [{ key: "active", count: 5 }],
          totalCount: 5,
        } satisfies QueryResult<OFTag>,
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ groupBy: "status" });
      expect(result.success).toBe(true);
    });

    it("groupBy: isRoot is a valid group key", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "groups",
          groups: [
            { key: "root", count: 4 },
            { key: "child", count: 10 },
          ],
          totalCount: 14,
        } satisfies QueryResult<OFTag>,
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ groupBy: "isRoot" });
      expect(result.success).toBe(true);
    });

    it("groupBy: hasAvailableTasks is a valid group key", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "groups",
          groups: [{ key: "active", count: 7 }],
          totalCount: 7,
        } satisfies QueryResult<OFTag>,
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ groupBy: "hasAvailableTasks" });
      expect(result.success).toBe(true);
    });
  });

  // ── Predicate options pass-through ────────────────────────────────────────
  describe("predicate options forwarded to OmniJS", () => {
    it("isRoot: true calls OmniJS (query layer compiles the predicate)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeListResult([]),
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ isRoot: true });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
      // Verify the generated body contains the expected condition
      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("(t.parent == null)");
    });

    it("ancestor: Contexts generates a parent-chain walker", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeListResult([]),
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags({ ancestor: "Contexts" });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("p = p.parent");
      expect(body).toContain('"Contexts"');
    });

    it("sort by availableTaskCount + reverse builds a sort comparator", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeListResult([]),
      } as OmniJSResult<QueryResult<OFTag>>);

      await queryTags({
        sort: ["availableTaskCount"],
        reverse: true,
        fields: ["id", "name", "availableTaskCount"],
      });

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("rows.sort(");
      expect(body).toContain("availableTaskCount");
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────
  describe("error handling", () => {
    it("surfaces OmniFocus not running error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("surfaces script error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS script error",
        },
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });

    it("falls back to UNKNOWN_ERROR when failure has no error property", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<QueryResult<OFTag>>);

      const result = await queryTags();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

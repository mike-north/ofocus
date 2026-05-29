import { describe, expect, it } from "vitest";
import { buildListQueryBody } from "../../../src/query/index.js";
import { compileAggregate } from "../../../src/query/aggregate.js";
import { compileProjection } from "../../../src/query/projection.js";
import { taskFieldSpec } from "../../../src/query/fields.js";

describe("buildListQueryBody", () => {
  const projection = compileProjection(taskFieldSpec, {});
  const baseArgs = {
    source: "flattenedTasks",
    itemVar: "t",
    mapExpression: projection.mapExpression,
    limit: 100,
    offset: 0,
  } as const;

  it("filters with `true` when no conditions", () => {
    const body = buildListQueryBody({
      ...baseArgs,
      conditions: [],
      comparator: null,
      aggregate: compileAggregate({}),
    });
    expect(body).toContain("flattenedTasks.filter");
    expect(body).toContain("return true;");
  });

  it("AND-combines multiple conditions", () => {
    const body = buildListQueryBody({
      ...baseArgs,
      conditions: ["t.flagged", "t.completed"],
      comparator: null,
      aggregate: compileAggregate({}),
    });
    expect(body).toContain("t.flagged && t.completed");
  });

  it("emits sort block when comparator provided", () => {
    const body = buildListQueryBody({
      ...baseArgs,
      conditions: [],
      comparator: "function(a, b) { return 0; }",
      aggregate: compileAggregate({}),
    });
    expect(body).toContain("rows.sort(function(a, b)");
  });

  it("omits sort block when comparator is null", () => {
    const body = buildListQueryBody({
      ...baseArgs,
      conditions: [],
      comparator: null,
      aggregate: compileAggregate({}),
    });
    expect(body).not.toContain("rows.sort");
  });

  describe("list shape", () => {
    it("emits paginated list output", () => {
      const body = buildListQueryBody({
        ...baseArgs,
        conditions: [],
        comparator: null,
        aggregate: compileAggregate({}),
      });
      expect(body).toContain('kind: "list"');
      expect(body).toContain("items:");
      expect(body).toContain("totalCount:");
      expect(body).toContain("hasMore:");
      expect(body).toContain("__offset = 0");
      expect(body).toContain("__limit = 100");
    });

    it("respects custom offset/limit", () => {
      const body = buildListQueryBody({
        ...baseArgs,
        offset: 50,
        limit: 25,
        conditions: [],
        comparator: null,
        aggregate: compileAggregate({}),
      });
      expect(body).toContain("__offset = 50");
      expect(body).toContain("__limit = 25");
    });

    describe("all flag", () => {
      it("when all=true omits slice and maps the full rows array", () => {
        const body = buildListQueryBody({
          ...baseArgs,
          conditions: [],
          comparator: null,
          aggregate: compileAggregate({}),
          all: true,
        });
        // Must not use the paginated __offset/__limit/__paged pattern
        expect(body).not.toContain("__offset");
        expect(body).not.toContain("__paged");
        // Must map the full rows array
        expect(body).toContain("rows.map(__mapFn)");
        expect(body).toContain('kind: "list"');
      });

      it("when all=true emits hasMore: false and offset: 0", () => {
        const body = buildListQueryBody({
          ...baseArgs,
          conditions: [],
          comparator: null,
          aggregate: compileAggregate({}),
          all: true,
        });
        expect(body).toContain("hasMore: false");
        expect(body).toContain("offset: 0");
        // limit equals items length, not a hard-coded integer
        expect(body).toContain("limit: __items.length");
      });

      it("when all=false (default) uses normal paginated slice", () => {
        const body = buildListQueryBody({
          ...baseArgs,
          conditions: [],
          comparator: null,
          aggregate: compileAggregate({}),
          all: false,
        });
        expect(body).toContain("__paged = rows.slice");
        expect(body).toContain("__offset = 0");
        expect(body).toContain("__limit = 100");
      });

      it("when all is omitted uses normal paginated slice", () => {
        const body = buildListQueryBody({
          ...baseArgs,
          conditions: [],
          comparator: null,
          aggregate: compileAggregate({}),
        });
        expect(body).toContain("__paged = rows.slice");
      });
    });
  });

  describe("count shape", () => {
    it("emits count output only", () => {
      const body = buildListQueryBody({
        ...baseArgs,
        conditions: [],
        comparator: null,
        aggregate: compileAggregate({ count: true }),
      });
      expect(body).toContain('kind: "count"');
      expect(body).toContain("count: rows.length");
      expect(body).not.toContain("items:");
    });
  });

  describe("ids shape", () => {
    it("emits ID list output", () => {
      const body = buildListQueryBody({
        ...baseArgs,
        conditions: [],
        comparator: null,
        aggregate: compileAggregate({ idsOnly: true }),
      });
      expect(body).toContain('kind: "ids"');
      expect(body).toContain("t.id.primaryKey");
    });
  });

  describe("single shape", () => {
    it("first: emits rows[0] projection", () => {
      const body = buildListQueryBody({
        ...baseArgs,
        conditions: [],
        comparator: null,
        aggregate: compileAggregate({ first: true }),
      });
      expect(body).toContain('kind: "single"');
      expect(body).toContain("rows[0]");
    });

    it("last: emits rows[rows.length - 1] projection", () => {
      const body = buildListQueryBody({
        ...baseArgs,
        conditions: [],
        comparator: null,
        aggregate: compileAggregate({ last: true }),
      });
      expect(body).toContain("rows[rows.length - 1]");
    });
  });

  describe("groups shape", () => {
    it("emits groups output with counts only by default", () => {
      const body = buildListQueryBody({
        ...baseArgs,
        conditions: [],
        comparator: null,
        aggregate: compileAggregate({ groupBy: "project" }),
      });
      expect(body).toContain('kind: "groups"');
      expect(body).toContain("__groups[__key]");
      // Without stats: no items array per group
      expect(body).not.toContain("items: []");
    });

    it("includes items per group when stats: true", () => {
      const body = buildListQueryBody({
        ...baseArgs,
        conditions: [],
        comparator: null,
        aggregate: compileAggregate({ groupBy: "project", stats: true }),
      });
      expect(body).toContain("items: []");
      expect(body).toContain("items.push(__mapFn(t))");
    });
  });
});

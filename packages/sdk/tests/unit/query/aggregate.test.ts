import { describe, expect, it } from "vitest";
import { compileAggregate } from "../../../src/query/aggregate.js";
import { ErrorCode } from "../../../src/errors.js";

describe("compileAggregate", () => {
  it("defaults to 'list' shape when no flags set", () => {
    const r = compileAggregate({});
    expect(r.shape).toBe("list");
    expect(r.withStats).toBe(false);
    expect(r.validationErrors).toEqual([]);
  });

  it("count: true → shape 'count'", () => {
    const r = compileAggregate({ count: true });
    expect(r.shape).toBe("count");
  });

  it("idsOnly: true → shape 'ids'", () => {
    const r = compileAggregate({ idsOnly: true });
    expect(r.shape).toBe("ids");
  });

  it("first: true → shape 'single-first'", () => {
    const r = compileAggregate({ first: true });
    expect(r.shape).toBe("single-first");
  });

  it("last: true → shape 'single-last'", () => {
    const r = compileAggregate({ last: true });
    expect(r.shape).toBe("single-last");
  });

  describe("groupBy", () => {
    it("project group key compiles", () => {
      const r = compileAggregate({ groupBy: "project" });
      expect(r.shape).toBe("groups");
      expect(r.groupKey).toBe("project");
      expect(r.groupKeyExpr).toContain("t.containingProject");
    });

    it("folder group key compiles", () => {
      const r = compileAggregate({ groupBy: "folder" });
      expect(r.shape).toBe("groups");
      expect(r.groupKeyExpr).toContain("parentFolder");
    });

    it("tag group key", () => {
      const r = compileAggregate({ groupBy: "tag" });
      expect(r.shape).toBe("groups");
      expect(r.groupKeyExpr).toContain("t.tags");
    });

    it("dueBucket group key", () => {
      const r = compileAggregate({ groupBy: "dueBucket" });
      expect(r.shape).toBe("groups");
      expect(r.groupKeyExpr).toContain("overdue");
      expect(r.groupKeyExpr).toContain("today");
      expect(r.groupKeyExpr).toContain("this-week");
      expect(r.groupKeyExpr).toContain("later");
      expect(r.groupKeyExpr).toContain("none");
    });

    it("flagged group key", () => {
      const r = compileAggregate({ groupBy: "flagged" });
      expect(r.groupKeyExpr).toContain('"flagged"');
      expect(r.groupKeyExpr).toContain('"unflagged"');
    });

    it("status group key", () => {
      const r = compileAggregate({ groupBy: "status" });
      expect(r.groupKeyExpr).toContain('"completed"');
      expect(r.groupKeyExpr).toContain('"dropped"');
      expect(r.groupKeyExpr).toContain('"blocked"');
      expect(r.groupKeyExpr).toContain('"active"');
    });

    it("rejects unknown group key", () => {
      const r = compileAggregate({ groupBy: "unknown-key" });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
      // Degrades to 'list' so downstream codegen doesn't reference an undefined key.
      expect(r.shape).toBe("list");
    });
  });

  describe("mutual exclusion", () => {
    it("rejects count + first", () => {
      const r = compileAggregate({ count: true, first: true });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.message).toContain("Mutually exclusive");
    });

    it("rejects count + idsOnly", () => {
      const r = compileAggregate({ count: true, idsOnly: true });
      expect(r.validationErrors).toHaveLength(1);
    });

    it("rejects first + last", () => {
      const r = compileAggregate({ first: true, last: true });
      expect(r.validationErrors).toHaveLength(1);
    });

    it("rejects groupBy + count", () => {
      const r = compileAggregate({ count: true, groupBy: "project" });
      expect(r.validationErrors).toHaveLength(1);
    });

    it("accepts a single shape modifier (no error)", () => {
      expect(compileAggregate({ count: true }).validationErrors).toEqual([]);
      expect(compileAggregate({ first: true }).validationErrors).toEqual([]);
      expect(compileAggregate({ last: true }).validationErrors).toEqual([]);
      expect(compileAggregate({ idsOnly: true }).validationErrors).toEqual([]);
      expect(compileAggregate({ groupBy: "project" }).validationErrors).toEqual(
        []
      );
    });
  });

  describe("pagination applies to list and ids output, not scalar shapes", () => {
    // Issue #83 §2: the scalar/single-item shapes collapse the result set, so
    // paginating them is meaningless and must still be rejected. `--ids-only`
    // is deliberately ABSENT here — it now paginates like a list (see below).
    const rejectedCases = [
      { opt: { count: true }, flag: "--count" },
      { opt: { first: true }, flag: "--first" },
      { opt: { last: true }, flag: "--last" },
      { opt: { groupBy: "project" }, flag: "--group-by" },
    ] as const;

    for (const { opt, flag } of rejectedCases) {
      it(`rejects ${flag} combined with limit`, () => {
        const r = compileAggregate({ ...opt, limit: 5 });
        expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(r.validationErrors[0]?.message).toBe(
          `Cannot combine --limit/--offset with ${flag}`
        );
      });

      it(`rejects ${flag} combined with offset`, () => {
        const r = compileAggregate({ ...opt, offset: 10 });
        expect(r.validationErrors[0]?.message).toBe(
          `Cannot combine --limit/--offset with ${flag}`
        );
      });

      it(`allows ${flag} with neither limit nor offset`, () => {
        const r = compileAggregate(opt);
        expect(
          r.validationErrors.some((e) =>
            e.message.startsWith("Cannot combine --limit/--offset")
          )
        ).toBe(false);
      });
    }

    it("allows limit/offset on the default list shape", () => {
      const r = compileAggregate({ limit: 5, offset: 10 });
      expect(r.shape).toBe("list");
      expect(r.validationErrors).toEqual([]);
    });

    // Issue #83 §2: the validation rule that forbade --ids-only + --limit/
    // --offset is removed. The `ids` shape is an ordered collection that can be
    // paged exactly like a list, so an id-list can now be paginated.
    describe("--ids-only is paginatable", () => {
      it("allows --ids-only with --limit", () => {
        const r = compileAggregate({ idsOnly: true, limit: 5 });
        expect(r.shape).toBe("ids");
        expect(r.validationErrors).toEqual([]);
      });

      it("allows --ids-only with --offset", () => {
        const r = compileAggregate({ idsOnly: true, offset: 50 });
        expect(r.shape).toBe("ids");
        expect(r.validationErrors).toEqual([]);
      });

      it("allows --ids-only with both --limit and --offset", () => {
        const r = compileAggregate({ idsOnly: true, limit: 25, offset: 25 });
        expect(r.shape).toBe("ids");
        expect(r.validationErrors).toEqual([]);
      });
    });
  });

  describe("stats", () => {
    it("stats: true is captured", () => {
      const r = compileAggregate({ groupBy: "project", stats: true });
      expect(r.withStats).toBe(true);
    });

    it("stats: false (default)", () => {
      const r = compileAggregate({ groupBy: "project" });
      expect(r.withStats).toBe(false);
    });
  });
});

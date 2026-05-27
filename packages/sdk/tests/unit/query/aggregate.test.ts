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
      expect(
        compileAggregate({ groupBy: "project" }).validationErrors
      ).toEqual([]);
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

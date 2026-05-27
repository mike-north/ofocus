import { describe, expect, it } from "vitest";
import { compileProjection } from "../../../src/query/projection.js";
import { taskFieldSpec } from "../../../src/query/fields.js";
import { ErrorCode } from "../../../src/errors.js";

describe("compileProjection", () => {
  describe("default field set", () => {
    it("uses the entity's defaultFields when fields is not provided", () => {
      const r = compileProjection(taskFieldSpec, {});
      expect(r.validationErrors).toEqual([]);
      expect(r.resolvedFields).toEqual([
        "id",
        "name",
        "flagged",
        "dueDate",
        "projectName",
      ]);
    });

    it("emits a function literal mapping to the default object", () => {
      const r = compileProjection(taskFieldSpec, {});
      expect(r.mapExpression.startsWith("function(t) {")).toBe(true);
      expect(r.mapExpression).toContain("id: t.id.primaryKey");
      expect(r.mapExpression).toContain("name: t.name");
      expect(r.mapExpression).toContain("flagged: t.flagged");
      expect(r.mapExpression).toContain("dueDate:");
      expect(r.mapExpression).toContain("projectName:");
    });
  });

  describe("explicit fields", () => {
    it("includes only the requested fields, in order", () => {
      const r = compileProjection(taskFieldSpec, {
        fields: ["name", "id"],
      });
      expect(r.resolvedFields).toEqual(["name", "id"]);
      const idx = (s: string) => r.mapExpression.indexOf(s);
      expect(idx("name:")).toBeLessThan(idx("id:"));
    });

    it("rejects unknown fields with VALIDATION_ERROR", () => {
      const r = compileProjection(taskFieldSpec, {
        fields: ["id", "definitelyNotAField"],
      });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(r.validationErrors[0]?.message).toContain("definitelyNotAField");
    });

    it("deduplicates repeated fields", () => {
      const r = compileProjection(taskFieldSpec, {
        fields: ["id", "name", "id"],
      });
      expect(r.resolvedFields).toEqual(["id", "name"]);
    });

    it("ignores unknown fields in the projection but reports them as errors", () => {
      const r = compileProjection(taskFieldSpec, {
        fields: ["id", "nope", "name"],
      });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.resolvedFields).toEqual(["id", "name"]);
    });
  });

  describe("excludeFields", () => {
    it("removes fields from the default set", () => {
      const r = compileProjection(taskFieldSpec, {
        excludeFields: ["dueDate", "projectName"],
      });
      expect(r.resolvedFields).toEqual(["id", "name", "flagged"]);
    });

    it("removes fields from an explicit projection", () => {
      const r = compileProjection(taskFieldSpec, {
        fields: ["id", "name", "flagged"],
        excludeFields: ["flagged"],
      });
      expect(r.resolvedFields).toEqual(["id", "name"]);
    });

    it("reports unknown exclusions as validation errors", () => {
      const r = compileProjection(taskFieldSpec, {
        excludeFields: ["bogus"],
      });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.message).toContain("bogus");
    });
  });

  describe("edge cases", () => {
    it("empty fields array falls back to defaults (not 'empty projection')", () => {
      // We treat empty as 'not provided' to avoid silently emitting empty rows.
      const r = compileProjection(taskFieldSpec, { fields: [] });
      expect(r.resolvedFields).toEqual(taskFieldSpec.defaultFields);
    });

    it("excluding all default fields yields an empty projection", () => {
      const r = compileProjection(taskFieldSpec, {
        excludeFields: taskFieldSpec.defaultFields,
      });
      expect(r.resolvedFields).toEqual([]);
      expect(r.mapExpression).toContain("return {};");
    });

    it("emits a function with all fields when full set requested", () => {
      const allFields = Object.keys(taskFieldSpec.fields);
      const r = compileProjection(taskFieldSpec, { fields: allFields });
      expect(r.validationErrors).toEqual([]);
      expect(r.resolvedFields).toEqual(allFields);
    });
  });
});

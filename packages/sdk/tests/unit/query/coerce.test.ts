import { describe, expect, it } from "vitest";
import {
  splitCommaSeparated,
  commaSeparatedStringArray,
} from "../../../src/query/coerce.js";

describe("splitCommaSeparated", () => {
  describe("comma form (single arg containing commas)", () => {
    it("splits a single comma-separated element into multiple fields", () => {
      expect(splitCommaSeparated(["id,name,dueDate"])).toEqual([
        "id",
        "name",
        "dueDate",
      ]);
    });

    it("handles two-element comma string", () => {
      expect(splitCommaSeparated(["id,name"])).toEqual(["id", "name"]);
    });
  });

  describe("space form (variadic, already split by Commander)", () => {
    it("passes through a space-separated (already-split) array unchanged", () => {
      expect(splitCommaSeparated(["id", "name", "dueDate"])).toEqual([
        "id",
        "name",
        "dueDate",
      ]);
    });

    it("passes through a single-element array with no commas", () => {
      expect(splitCommaSeparated(["id"])).toEqual(["id"]);
    });
  });

  describe("mixed form (some elements contain commas, some don't)", () => {
    it("splits comma elements and keeps non-comma elements", () => {
      expect(splitCommaSeparated(["id,name", "dueDate"])).toEqual([
        "id",
        "name",
        "dueDate",
      ]);
    });

    it("produces the same result as the space form", () => {
      const commaForm = splitCommaSeparated(["id,name,dueDate"]);
      const spaceForm = splitCommaSeparated(["id", "name", "dueDate"]);
      const mixedForm = splitCommaSeparated(["id,name", "dueDate"]);
      expect(commaForm).toEqual(spaceForm);
      expect(mixedForm).toEqual(spaceForm);
    });
  });

  describe("whitespace trimming", () => {
    it("trims whitespace around each field after splitting on commas", () => {
      expect(splitCommaSeparated([" id , name , dueDate "])).toEqual([
        "id",
        "name",
        "dueDate",
      ]);
    });

    it("trims whitespace on space-form elements", () => {
      expect(splitCommaSeparated([" id ", " name "])).toEqual(["id", "name"]);
    });
  });

  describe("empty string handling", () => {
    it("drops empty strings produced by trailing commas", () => {
      expect(splitCommaSeparated(["id,name,"])).toEqual(["id", "name"]);
    });

    it("drops empty strings produced by leading commas", () => {
      expect(splitCommaSeparated([",id,name"])).toEqual(["id", "name"]);
    });

    it("drops whitespace-only segments", () => {
      expect(splitCommaSeparated(["id, ,name"])).toEqual(["id", "name"]);
    });

    it("returns empty array for empty input", () => {
      expect(splitCommaSeparated([])).toEqual([]);
    });

    it("drops empty string elements", () => {
      expect(splitCommaSeparated([""])).toEqual([]);
    });
  });
});

describe("commaSeparatedStringArray (Zod schema)", () => {
  describe("comma form", () => {
    it("parses 'id,name,dueDate' as a single element to ['id','name','dueDate']", () => {
      const result = commaSeparatedStringArray.safeParse(["id,name,dueDate"]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(["id", "name", "dueDate"]);
      }
    });
  });

  describe("space form", () => {
    it("passes through ['id','name','dueDate'] unchanged", () => {
      const result = commaSeparatedStringArray.safeParse([
        "id",
        "name",
        "dueDate",
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(["id", "name", "dueDate"]);
      }
    });
  });

  describe("mixed form", () => {
    it("splits comma elements and keeps non-comma elements", () => {
      const result = commaSeparatedStringArray.safeParse([
        "id,name",
        "dueDate",
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(["id", "name", "dueDate"]);
      }
    });
  });

  describe("optional handling", () => {
    it("accepts undefined (field is optional)", () => {
      const result = commaSeparatedStringArray.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }
    });

    it("passes through non-array values unchanged for Zod to validate", () => {
      // A non-array that is not undefined is not valid for z.array(), Zod
      // should reject it. The preprocessor passes it through as-is.
      const result = commaSeparatedStringArray.safeParse("id,name");
      // z.preprocess + z.array().optional() — string is not an array, not undefined
      expect(result.success).toBe(false);
    });
  });

  describe("whitespace trimming", () => {
    it("trims whitespace in comma-separated values", () => {
      const result = commaSeparatedStringArray.safeParse([
        "id , name , dueDate",
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(["id", "name", "dueDate"]);
      }
    });
  });

  describe("empty string handling", () => {
    it("drops empty segments from trailing commas", () => {
      const result = commaSeparatedStringArray.safeParse(["id,name,"]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(["id", "name"]);
      }
    });
  });
});

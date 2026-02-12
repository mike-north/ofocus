import { describe, it, expect } from "vitest";
import { formatResult } from "../src/utils.js";

describe("formatResult", () => {
  describe("success cases", () => {
    it("should format successful result with data", () => {
      const result = formatResult({
        success: true,
        data: { id: "123", name: "Test Task" },
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text as string)).toEqual({
        id: "123",
        name: "Test Task",
      });
    });

    it("should format successful result with array data", () => {
      const result = formatResult({
        success: true,
        data: [{ id: "1" }, { id: "2" }],
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed).toHaveLength(2);
    });

    it("should format successful result with null data", () => {
      const result = formatResult({
        success: true,
        data: null,
      });

      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text as string)).toBeNull();
    });
  });

  describe("error cases", () => {
    it("should format error result with error object", () => {
      const result = formatResult({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Task not found",
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(JSON.parse(result.content[0].text as string)).toEqual({
        code: "NOT_FOUND",
        message: "Task not found",
      });
    });

    it("should provide fallback error when error is undefined", () => {
      const result = formatResult({
        success: false,
        error: undefined,
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.code).toBe("UNKNOWN_ERROR");
      expect(parsed.message).toBe("An unknown error occurred");
    });

    it("should provide fallback error when error is null", () => {
      const result = formatResult({
        success: false,
        error: null as unknown as undefined,
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.code).toBe("UNKNOWN_ERROR");
    });
  });
});

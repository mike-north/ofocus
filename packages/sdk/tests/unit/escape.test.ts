import { describe, it, expect } from "vitest";
import { escapeAppleScript } from "../../src/escape.js";

describe("escapeAppleScript", () => {
  describe("positive cases", () => {
    it("should return empty string unchanged", () => {
      expect(escapeAppleScript("")).toBe("");
    });

    it("should return plain text unchanged", () => {
      expect(escapeAppleScript("hello world")).toBe("hello world");
    });

    it("should handle numbers and special characters", () => {
      expect(escapeAppleScript("task #1 @ 5:00")).toBe("task #1 @ 5:00");
    });

    it("should handle unicode characters", () => {
      expect(escapeAppleScript("café résumé")).toBe("café résumé");
    });

    it("should handle emojis", () => {
      expect(escapeAppleScript("task 📝 done ✅")).toBe("task 📝 done ✅");
    });
  });

  describe("escape sequences", () => {
    it("should escape double quotes", () => {
      expect(escapeAppleScript('say "hello"')).toBe('say \\"hello\\"');
    });

    it("should escape backslashes", () => {
      expect(escapeAppleScript("path\\to\\file")).toBe("path\\\\to\\\\file");
    });

    it("should escape backslashes before quotes", () => {
      expect(escapeAppleScript('path\\"file')).toBe('path\\\\\\"file');
    });

    it("should handle multiple quotes", () => {
      expect(escapeAppleScript('"a" and "b"')).toBe('\\"a\\" and \\"b\\"');
    });

    it("should handle multiple backslashes", () => {
      expect(escapeAppleScript("a\\\\b")).toBe("a\\\\\\\\b");
    });
  });

  describe("edge cases", () => {
    it("should handle only quotes", () => {
      expect(escapeAppleScript('""')).toBe('\\"\\"');
    });

    it("should handle only backslashes", () => {
      expect(escapeAppleScript("\\\\")).toBe("\\\\\\\\");
    });

    it("should handle mixed escape sequences", () => {
      const input = 'He said "C:\\Users\\test"';
      const expected = 'He said \\"C:\\\\Users\\\\test\\"';
      expect(escapeAppleScript(input)).toBe(expected);
    });

    it("should handle newlines (passed through)", () => {
      expect(escapeAppleScript("line1\nline2")).toBe("line1\nline2");
    });

    it("should handle tabs (passed through)", () => {
      expect(escapeAppleScript("col1\tcol2")).toBe("col1\tcol2");
    });
  });
});

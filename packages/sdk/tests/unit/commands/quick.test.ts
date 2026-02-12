import { describe, it, expect } from "vitest";
import { parseQuickInput } from "../../../src/commands/quick.js";

describe("parseQuickInput", () => {
  describe("title extraction", () => {
    it("should parse a simple title", () => {
      const result = parseQuickInput("Buy milk");
      expect(result.title).toBe("Buy milk");
    });

    it("should handle empty input", () => {
      const result = parseQuickInput("");
      expect(result.title).toBe("");
    });

    it("should handle only whitespace", () => {
      const result = parseQuickInput("   ");
      expect(result.title).toBe("");
    });
  });

  describe("tags (@)", () => {
    it("should parse single tag", () => {
      const result = parseQuickInput("Buy milk @errands");
      expect(result.title).toBe("Buy milk");
      expect(result.tags).toEqual(["errands"]);
    });

    it("should parse multiple tags", () => {
      const result = parseQuickInput("Buy milk @errands @shopping");
      expect(result.title).toBe("Buy milk");
      expect(result.tags).toEqual(["errands", "shopping"]);
    });

    it("should ignore empty tags", () => {
      const result = parseQuickInput("Buy milk @");
      expect(result.title).toBe("Buy milk");
      expect(result.tags).toEqual([]);
    });
  });

  describe("project (#)", () => {
    it("should parse project", () => {
      const result = parseQuickInput("Buy milk #groceries");
      expect(result.title).toBe("Buy milk");
      expect(result.project).toBe("groceries");
    });

    it("should use last project if multiple specified", () => {
      const result = parseQuickInput("Buy milk #home #groceries");
      expect(result.project).toBe("groceries");
    });

    it("should ignore empty project", () => {
      const result = parseQuickInput("Buy milk #");
      expect(result.title).toBe("Buy milk");
      expect(result.project).toBeNull();
    });
  });

  describe("flags (!)", () => {
    it("should parse single exclamation as flag", () => {
      const result = parseQuickInput("Buy milk !");
      expect(result.title).toBe("Buy milk");
      expect(result.flagged).toBe(true);
    });

    it("should parse double exclamation as flag", () => {
      const result = parseQuickInput("Buy milk !!");
      expect(result.title).toBe("Buy milk");
      expect(result.flagged).toBe(true);
    });

    it("should not flag by default", () => {
      const result = parseQuickInput("Buy milk");
      expect(result.flagged).toBe(false);
    });
  });

  describe("duration (~)", () => {
    it("should parse minutes", () => {
      const result = parseQuickInput("Call mom ~30m");
      expect(result.title).toBe("Call mom");
      expect(result.estimatedMinutes).toBe(30);
    });

    it("should parse hours", () => {
      const result = parseQuickInput("Meeting ~2h");
      expect(result.title).toBe("Meeting");
      expect(result.estimatedMinutes).toBe(120);
    });

    it("should parse fractional hours", () => {
      const result = parseQuickInput("Meeting ~1.5h");
      expect(result.estimatedMinutes).toBe(90);
    });

    it("should handle hour spelling variations", () => {
      expect(parseQuickInput("Task ~1hour").estimatedMinutes).toBe(60);
      expect(parseQuickInput("Task ~2hours").estimatedMinutes).toBe(120);
    });

    it("should handle minute spelling variations", () => {
      expect(parseQuickInput("Task ~30min").estimatedMinutes).toBe(30);
      expect(parseQuickInput("Task ~15minute").estimatedMinutes).toBe(15);
      expect(parseQuickInput("Task ~45minutes").estimatedMinutes).toBe(45);
    });

    it("should include invalid duration in title", () => {
      const result = parseQuickInput("Task ~invalid");
      expect(result.title).toBe("Task ~invalid");
      expect(result.estimatedMinutes).toBeNull();
    });
  });

  describe("due dates (due:)", () => {
    it("should parse due:today", () => {
      const result = parseQuickInput("Buy milk due:today");
      expect(result.title).toBe("Buy milk");
      expect(result.due).not.toBeNull();
      // Should contain current date formatted
      expect(result.due).toMatch(/^\w+ \d+, \d{4}$/);
    });

    it("should parse due:tomorrow", () => {
      const result = parseQuickInput("Buy milk due:tomorrow");
      expect(result.due).not.toBeNull();
    });

    it("should parse day names", () => {
      const result = parseQuickInput("Meeting due:monday");
      expect(result.due).not.toBeNull();
      expect(result.due).toMatch(/^\w+ \d+, \d{4}$/);
    });

    it("should handle literal dates", () => {
      const result = parseQuickInput("Buy milk due:2024-12-25");
      expect(result.due).toBe("2024-12-25");
    });

    it("should be case-insensitive", () => {
      const result = parseQuickInput("Buy milk DUE:Tomorrow");
      expect(result.due).not.toBeNull();
    });
  });

  describe("defer dates (defer:)", () => {
    it("should parse defer:tomorrow", () => {
      const result = parseQuickInput("Buy milk defer:tomorrow");
      expect(result.title).toBe("Buy milk");
      expect(result.defer).not.toBeNull();
    });

    it("should parse day names", () => {
      const result = parseQuickInput("Task defer:friday");
      expect(result.defer).not.toBeNull();
    });

    it("should handle literal dates", () => {
      const result = parseQuickInput("Task defer:2024-12-20");
      expect(result.defer).toBe("2024-12-20");
    });
  });

  describe("repetition (repeat:)", () => {
    it("should parse repeat:daily", () => {
      const result = parseQuickInput("Water plants repeat:daily");
      expect(result.title).toBe("Water plants");
      expect(result.repeat).toEqual({
        frequency: "daily",
        interval: 1,
        repeatMethod: "due-again",
      });
    });

    it("should parse repeat:weekly", () => {
      const result = parseQuickInput("Review goals repeat:weekly");
      expect(result.repeat).toEqual({
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
      });
    });

    it("should parse repeat:monthly", () => {
      const result = parseQuickInput("Pay rent repeat:monthly");
      expect(result.repeat).toEqual({
        frequency: "monthly",
        interval: 1,
        repeatMethod: "due-again",
      });
    });

    it("should parse repeat:yearly", () => {
      const result = parseQuickInput("Birthday repeat:yearly");
      expect(result.repeat).toEqual({
        frequency: "yearly",
        interval: 1,
        repeatMethod: "due-again",
      });
    });

    it("should parse repeat:annually", () => {
      const result = parseQuickInput("Anniversary repeat:annually");
      expect(result.repeat).toEqual({
        frequency: "yearly",
        interval: 1,
        repeatMethod: "due-again",
      });
    });

    it("should parse 'every N days' with quotes", () => {
      // Multi-word patterns need quotes since tokenizer splits on spaces
      const result = parseQuickInput('Water plants "repeat:every 3 days"');
      expect(result.repeat).toEqual({
        frequency: "daily",
        interval: 3,
        repeatMethod: "due-again",
      });
    });

    it("should parse 'every N weeks' with quotes", () => {
      const result = parseQuickInput('Review "repeat:every 2 weeks"');
      expect(result.repeat).toEqual({
        frequency: "weekly",
        interval: 2,
        repeatMethod: "due-again",
      });
    });

    it("should handle invalid repetition", () => {
      const result = parseQuickInput("Task repeat:invalid");
      expect(result.repeat).toBeNull();
    });
  });

  describe("quoted strings", () => {
    it("should preserve spaces in double-quoted strings", () => {
      const result = parseQuickInput('"Buy milk and eggs" @errands');
      expect(result.title).toBe("Buy milk and eggs");
      expect(result.tags).toEqual(["errands"]);
    });

    it("should preserve spaces in single-quoted strings", () => {
      const result = parseQuickInput("'Call John Smith' @phone");
      expect(result.title).toBe("Call John Smith");
      expect(result.tags).toEqual(["phone"]);
    });

    it("should handle quoted project names", () => {
      const result = parseQuickInput('Task #"My Project"');
      expect(result.project).toBe("My Project");
    });
  });

  describe("complex inputs", () => {
    it("should parse all components together", () => {
      const result = parseQuickInput(
        "Buy milk @errands #groceries ! ~30m due:tomorrow"
      );
      expect(result.title).toBe("Buy milk");
      expect(result.tags).toEqual(["errands"]);
      expect(result.project).toBe("groceries");
      expect(result.flagged).toBe(true);
      expect(result.estimatedMinutes).toBe(30);
      expect(result.due).not.toBeNull();
    });

    it("should handle components in any order", () => {
      const result = parseQuickInput(
        "! @tag due:monday Task title #project ~1h"
      );
      expect(result.title).toBe("Task title");
      expect(result.flagged).toBe(true);
      expect(result.tags).toEqual(["tag"]);
      expect(result.project).toBe("project");
      expect(result.estimatedMinutes).toBe(60);
      expect(result.due).not.toBeNull();
    });
  });
});

import { describe, it, expect } from "vitest";
import { buildRRule } from "../../../src/commands/repetition.js";
import type { RepetitionRule } from "../../../src/types.js";

describe("buildRRule", () => {
  describe("frequency handling", () => {
    it("should build daily RRULE", () => {
      const rule: RepetitionRule = {
        frequency: "daily",
        interval: 1,
        repeatMethod: "due-again",
      };
      expect(buildRRule(rule)).toBe("FREQ=DAILY");
    });

    it("should build weekly RRULE", () => {
      const rule: RepetitionRule = {
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY");
    });

    it("should build monthly RRULE", () => {
      const rule: RepetitionRule = {
        frequency: "monthly",
        interval: 1,
        repeatMethod: "due-again",
      };
      expect(buildRRule(rule)).toBe("FREQ=MONTHLY");
    });

    it("should build yearly RRULE", () => {
      const rule: RepetitionRule = {
        frequency: "yearly",
        interval: 1,
        repeatMethod: "due-again",
      };
      expect(buildRRule(rule)).toBe("FREQ=YEARLY");
    });
  });

  describe("interval handling", () => {
    it("should not include interval for interval=1", () => {
      const rule: RepetitionRule = {
        frequency: "daily",
        interval: 1,
        repeatMethod: "due-again",
      };
      expect(buildRRule(rule)).toBe("FREQ=DAILY");
    });

    it("should include interval for interval > 1", () => {
      const rule: RepetitionRule = {
        frequency: "weekly",
        interval: 2,
        repeatMethod: "due-again",
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY;INTERVAL=2");
    });

    it("should handle large intervals", () => {
      const rule: RepetitionRule = {
        frequency: "monthly",
        interval: 6,
        repeatMethod: "due-again",
      };
      expect(buildRRule(rule)).toBe("FREQ=MONTHLY;INTERVAL=6");
    });
  });

  describe("daysOfWeek handling", () => {
    it("should include single day of week", () => {
      const rule: RepetitionRule = {
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
        daysOfWeek: [1], // Monday
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY;BYDAY=MO");
    });

    it("should include multiple days of week", () => {
      const rule: RepetitionRule = {
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
        daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    });

    it("should map all day values correctly", () => {
      const rule: RepetitionRule = {
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA");
    });

    it("should not include BYDAY for empty array", () => {
      const rule: RepetitionRule = {
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
        daysOfWeek: [],
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY");
    });

    it("should not include BYDAY when undefined", () => {
      const rule: RepetitionRule = {
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY");
    });
  });

  describe("dayOfMonth handling", () => {
    it("should include day of month", () => {
      const rule: RepetitionRule = {
        frequency: "monthly",
        interval: 1,
        repeatMethod: "due-again",
        dayOfMonth: 15,
      };
      expect(buildRRule(rule)).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
    });

    it("should handle first day of month", () => {
      const rule: RepetitionRule = {
        frequency: "monthly",
        interval: 1,
        repeatMethod: "due-again",
        dayOfMonth: 1,
      };
      expect(buildRRule(rule)).toBe("FREQ=MONTHLY;BYMONTHDAY=1");
    });

    it("should handle last day (31)", () => {
      const rule: RepetitionRule = {
        frequency: "monthly",
        interval: 1,
        repeatMethod: "due-again",
        dayOfMonth: 31,
      };
      expect(buildRRule(rule)).toBe("FREQ=MONTHLY;BYMONTHDAY=31");
    });
  });

  describe("complex rules", () => {
    it("should combine interval and daysOfWeek", () => {
      const rule: RepetitionRule = {
        frequency: "weekly",
        interval: 2,
        repeatMethod: "due-again",
        daysOfWeek: [1, 5], // Mon, Fri
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR");
    });

    it("should combine interval and dayOfMonth", () => {
      const rule: RepetitionRule = {
        frequency: "monthly",
        interval: 3,
        repeatMethod: "due-again",
        dayOfMonth: 1,
      };
      expect(buildRRule(rule)).toBe("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1");
    });
  });
});


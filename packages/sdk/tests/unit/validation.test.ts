import { describe, it, expect } from "vitest";
import {
  validateId,
  validateDateString,
  validateTags,
  validateProjectName,
  validateFolderName,
  validateTagName,
  validateRepetitionRule,
  validateEstimatedMinutes,
  validateSearchQuery,
  validatePaginationParams,
  MAX_PAGINATION_LIMIT,
} from "../../src/validation.js";
import { ErrorCode } from "../../src/errors.js";

describe("validateId", () => {
  describe("valid IDs", () => {
    it("should accept alphanumeric IDs", () => {
      expect(validateId("abc123", "task")).toBeNull();
    });

    it("should accept IDs with dashes", () => {
      expect(validateId("abc-123-def", "task")).toBeNull();
    });

    it("should accept IDs with underscores", () => {
      expect(validateId("abc_123_def", "task")).toBeNull();
    });

    it("should accept mixed alphanumeric with dashes and underscores", () => {
      expect(validateId("Task-ID_123", "task")).toBeNull();
    });

    it("should accept for different entity types", () => {
      expect(validateId("proj123", "project")).toBeNull();
      expect(validateId("tag456", "tag")).toBeNull();
    });
  });

  describe("invalid IDs", () => {
    it("should reject empty string", () => {
      const error = validateId("", "task");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(error?.message).toContain("cannot be empty");
    });

    it("should reject whitespace-only string", () => {
      const error = validateId("   ", "task");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject IDs with spaces", () => {
      const error = validateId("abc 123", "task");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject IDs with quotes (injection attempt)", () => {
      const error = validateId('abc"123', "task");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject IDs with backslashes (injection attempt)", () => {
      const error = validateId("abc\\123", "task");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject IDs with special characters", () => {
      expect(validateId("abc@123", "task")).not.toBeNull();
      expect(validateId("abc#123", "task")).not.toBeNull();
      expect(validateId("abc$123", "task")).not.toBeNull();
    });

    it("should include type in error message", () => {
      const taskError = validateId("", "task");
      expect(taskError?.message).toContain("Task");

      const projectError = validateId("", "project");
      expect(projectError?.message).toContain("Project");
    });
  });
});

describe("validateDateString", () => {
  describe("valid date strings", () => {
    it("should accept empty string", () => {
      expect(validateDateString("")).toBeNull();
    });

    it("should accept standard date format", () => {
      expect(validateDateString("January 15, 2024")).toBeNull();
    });

    it("should accept short date format", () => {
      expect(validateDateString("1/15/2024")).toBeNull();
    });

    it("should accept date with time", () => {
      expect(validateDateString("January 15, 2024 5:00 PM")).toBeNull();
    });

    it("should accept ISO-like format", () => {
      expect(validateDateString("2024-01-15")).toBeNull();
    });

    it("should accept time-only", () => {
      expect(validateDateString("5:00 PM")).toBeNull();
    });
  });

  describe("invalid date strings", () => {
    it("should reject strings with double quotes", () => {
      const error = validateDateString('January "15", 2024');
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject strings with backslashes", () => {
      const error = validateDateString("January\\15\\2024");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject strings with injection characters", () => {
      const error = validateDateString("2024; delete all tasks");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject strings with parentheses", () => {
      const error = validateDateString("date(2024)");
      expect(error).not.toBeNull();
    });
  });
});

describe("validateTags", () => {
  describe("valid tags", () => {
    it("should accept undefined", () => {
      expect(validateTags(undefined)).toBeNull();
    });

    it("should accept empty array", () => {
      expect(validateTags([])).toBeNull();
    });

    it("should accept single tag", () => {
      expect(validateTags(["work"])).toBeNull();
    });

    it("should accept multiple tags", () => {
      expect(validateTags(["work", "urgent", "home"])).toBeNull();
    });

    it("should accept tags with spaces", () => {
      expect(validateTags(["work tasks", "home chores"])).toBeNull();
    });

    it("should accept tags with numbers", () => {
      expect(validateTags(["priority1", "q4-2024"])).toBeNull();
    });
  });

  describe("invalid tags", () => {
    it("should reject empty tag name", () => {
      const error = validateTags(["work", ""]);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("cannot be empty");
    });

    it("should reject whitespace-only tag", () => {
      const error = validateTags(["   "]);
      expect(error).not.toBeNull();
    });

    it("should reject tags with quotes", () => {
      const error = validateTags(['tag"name']);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject tags with backslashes", () => {
      const error = validateTags(["tag\\name"]);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});

describe("validateProjectName", () => {
  describe("valid project names", () => {
    it("should accept undefined", () => {
      expect(validateProjectName(undefined)).toBeNull();
    });

    it("should accept empty string", () => {
      expect(validateProjectName("")).toBeNull();
    });

    it("should accept simple name", () => {
      expect(validateProjectName("My Project")).toBeNull();
    });

    it("should accept name with special characters", () => {
      expect(validateProjectName("Project #1 - Q4")).toBeNull();
    });
  });

  describe("invalid project names", () => {
    it("should reject names with quotes", () => {
      const error = validateProjectName('My "Project"');
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject names with backslashes", () => {
      const error = validateProjectName("My\\Project");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});

describe("validateFolderName", () => {
  describe("valid folder names", () => {
    it("should accept undefined", () => {
      expect(validateFolderName(undefined)).toBeNull();
    });

    it("should accept empty string", () => {
      expect(validateFolderName("")).toBeNull();
    });

    it("should accept simple name", () => {
      expect(validateFolderName("My Folder")).toBeNull();
    });

    it("should accept name with special characters", () => {
      expect(validateFolderName("Folder #1 - Work")).toBeNull();
    });
  });

  describe("invalid folder names", () => {
    it("should reject names with quotes", () => {
      const error = validateFolderName('My "Folder"');
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("folder name");
    });

    it("should reject names with backslashes", () => {
      const error = validateFolderName("My\\Folder");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});

describe("validateTagName", () => {
  describe("valid tag names", () => {
    it("should accept simple name", () => {
      expect(validateTagName("work")).toBeNull();
    });

    it("should accept name with spaces", () => {
      expect(validateTagName("urgent tasks")).toBeNull();
    });

    it("should accept name with numbers", () => {
      expect(validateTagName("priority1")).toBeNull();
    });

    it("should accept name with special characters", () => {
      expect(validateTagName("@home")).toBeNull();
    });
  });

  describe("invalid tag names", () => {
    it("should reject empty string", () => {
      const error = validateTagName("");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("cannot be empty");
    });

    it("should reject whitespace-only string", () => {
      const error = validateTagName("   ");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject names with quotes", () => {
      const error = validateTagName('my "tag"');
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject names with backslashes", () => {
      const error = validateTagName("my\\tag");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});

describe("validateRepetitionRule", () => {
  describe("valid rules", () => {
    it("should accept undefined", () => {
      expect(validateRepetitionRule(undefined)).toBeNull();
    });

    it("should accept daily rule", () => {
      expect(
        validateRepetitionRule({
          frequency: "daily",
          interval: 1,
          repeatMethod: "due-again",
        })
      ).toBeNull();
    });

    it("should accept weekly rule", () => {
      expect(
        validateRepetitionRule({
          frequency: "weekly",
          interval: 2,
          repeatMethod: "defer-another",
        })
      ).toBeNull();
    });

    it("should accept monthly rule", () => {
      expect(
        validateRepetitionRule({
          frequency: "monthly",
          interval: 1,
          repeatMethod: "due-again",
        })
      ).toBeNull();
    });

    it("should accept yearly rule", () => {
      expect(
        validateRepetitionRule({
          frequency: "yearly",
          interval: 1,
          repeatMethod: "due-again",
        })
      ).toBeNull();
    });

    it("should accept rule with daysOfWeek", () => {
      expect(
        validateRepetitionRule({
          frequency: "weekly",
          interval: 1,
          repeatMethod: "due-again",
          daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
        })
      ).toBeNull();
    });

    it("should accept rule with dayOfMonth", () => {
      expect(
        validateRepetitionRule({
          frequency: "monthly",
          interval: 1,
          repeatMethod: "due-again",
          dayOfMonth: 15,
        })
      ).toBeNull();
    });
  });

  describe("invalid frequency", () => {
    it("should reject invalid frequency", () => {
      const error = validateRepetitionRule({
        frequency: "hourly",
        interval: 1,
        repeatMethod: "due-again",
      });
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("frequency");
    });
  });

  describe("invalid interval", () => {
    it("should reject zero interval", () => {
      const error = validateRepetitionRule({
        frequency: "daily",
        interval: 0,
        repeatMethod: "due-again",
      });
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("interval");
    });

    it("should reject negative interval", () => {
      const error = validateRepetitionRule({
        frequency: "daily",
        interval: -1,
        repeatMethod: "due-again",
      });
      expect(error).not.toBeNull();
    });

    it("should reject non-integer interval", () => {
      const error = validateRepetitionRule({
        frequency: "daily",
        interval: 1.5,
        repeatMethod: "due-again",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("invalid repeatMethod", () => {
    it("should reject invalid repeat method", () => {
      const error = validateRepetitionRule({
        frequency: "daily",
        interval: 1,
        repeatMethod: "invalid",
      });
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("repeat method");
    });
  });

  describe("invalid daysOfWeek", () => {
    it("should reject empty daysOfWeek array", () => {
      const error = validateRepetitionRule({
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
        daysOfWeek: [],
      });
      expect(error).not.toBeNull();
      expect(error?.message).toContain("daysOfWeek");
    });

    it("should reject day value less than 0", () => {
      const error = validateRepetitionRule({
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
        daysOfWeek: [-1],
      });
      expect(error).not.toBeNull();
    });

    it("should reject day value greater than 6", () => {
      const error = validateRepetitionRule({
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
        daysOfWeek: [7],
      });
      expect(error).not.toBeNull();
    });

    it("should reject non-integer day value", () => {
      const error = validateRepetitionRule({
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
        daysOfWeek: [1.5],
      });
      expect(error).not.toBeNull();
    });
  });

  describe("invalid dayOfMonth", () => {
    it("should reject day less than 1", () => {
      const error = validateRepetitionRule({
        frequency: "monthly",
        interval: 1,
        repeatMethod: "due-again",
        dayOfMonth: 0,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toContain("day of month");
    });

    it("should reject day greater than 31", () => {
      const error = validateRepetitionRule({
        frequency: "monthly",
        interval: 1,
        repeatMethod: "due-again",
        dayOfMonth: 32,
      });
      expect(error).not.toBeNull();
    });

    it("should reject non-integer day", () => {
      const error = validateRepetitionRule({
        frequency: "monthly",
        interval: 1,
        repeatMethod: "due-again",
        dayOfMonth: 15.5,
      });
      expect(error).not.toBeNull();
    });
  });
});

describe("validateEstimatedMinutes", () => {
  describe("valid values", () => {
    it("should accept undefined", () => {
      expect(validateEstimatedMinutes(undefined)).toBeNull();
    });

    it("should accept zero", () => {
      expect(validateEstimatedMinutes(0)).toBeNull();
    });

    it("should accept positive integer", () => {
      expect(validateEstimatedMinutes(30)).toBeNull();
    });

    it("should accept large value", () => {
      expect(validateEstimatedMinutes(1000)).toBeNull();
    });
  });

  describe("invalid values", () => {
    it("should reject negative number", () => {
      const error = validateEstimatedMinutes(-10);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("estimated minutes");
    });

    it("should reject non-integer", () => {
      const error = validateEstimatedMinutes(30.5);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});

describe("validateSearchQuery", () => {
  describe("valid queries", () => {
    it("should accept simple query", () => {
      expect(validateSearchQuery("meeting")).toBeNull();
    });

    it("should accept query with spaces", () => {
      expect(validateSearchQuery("team meeting")).toBeNull();
    });

    it("should accept query with numbers", () => {
      expect(validateSearchQuery("q4 planning 2024")).toBeNull();
    });
  });

  describe("invalid queries", () => {
    it("should reject empty string", () => {
      const error = validateSearchQuery("");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("cannot be empty");
    });

    it("should reject whitespace-only string", () => {
      const error = validateSearchQuery("   ");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject query with quotes (injection attempt)", () => {
      const error = validateSearchQuery('search "or 1=1');
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject query with backslashes (injection attempt)", () => {
      const error = validateSearchQuery("search\\injection");
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});

describe("validatePaginationParams", () => {
  describe("valid parameters", () => {
    it("should accept undefined limit and offset", () => {
      expect(validatePaginationParams(undefined, undefined)).toBeNull();
    });

    it("should accept valid limit with undefined offset", () => {
      expect(validatePaginationParams(50, undefined)).toBeNull();
    });

    it("should accept undefined limit with valid offset", () => {
      expect(validatePaginationParams(undefined, 100)).toBeNull();
    });

    it("should accept valid limit and offset", () => {
      expect(validatePaginationParams(100, 200)).toBeNull();
    });

    it("should accept minimum limit of 1", () => {
      expect(validatePaginationParams(1, 0)).toBeNull();
    });

    it("should accept zero offset", () => {
      expect(validatePaginationParams(100, 0)).toBeNull();
    });

    it("should accept maximum allowed limit", () => {
      expect(validatePaginationParams(MAX_PAGINATION_LIMIT, 0)).toBeNull();
    });

    it("should accept large offset", () => {
      expect(validatePaginationParams(100, 10000)).toBeNull();
    });
  });

  describe("invalid limit", () => {
    it("should reject zero limit", () => {
      const error = validatePaginationParams(0, 0);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("limit");
    });

    it("should reject negative limit", () => {
      const error = validatePaginationParams(-10, 0);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("limit");
    });

    it("should reject non-integer limit", () => {
      const error = validatePaginationParams(10.5, 0);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("limit");
    });

    it("should reject limit exceeding maximum", () => {
      const error = validatePaginationParams(MAX_PAGINATION_LIMIT + 1, 0);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("exceeds maximum");
    });
  });

  describe("invalid offset", () => {
    it("should reject negative offset", () => {
      const error = validatePaginationParams(100, -1);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("offset");
    });

    it("should reject non-integer offset", () => {
      const error = validatePaginationParams(100, 10.5);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error?.message).toContain("offset");
    });
  });
});

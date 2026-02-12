import { describe, it, expect } from "@jest/globals";
import {
  validateId,
  validateDateString,
  validateTags,
  validateProjectName,
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

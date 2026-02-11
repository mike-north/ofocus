import { describe, it, expect } from "@jest/globals";
import {
  ErrorCode,
  createError,
  parseAppleScriptError,
} from "../../lib/errors.js";

describe("ErrorCode", () => {
  it("should have all expected error codes", () => {
    expect(ErrorCode.TASK_NOT_FOUND).toBe("TASK_NOT_FOUND");
    expect(ErrorCode.PROJECT_NOT_FOUND).toBe("PROJECT_NOT_FOUND");
    expect(ErrorCode.TAG_NOT_FOUND).toBe("TAG_NOT_FOUND");
    expect(ErrorCode.OMNIFOCUS_NOT_RUNNING).toBe("OMNIFOCUS_NOT_RUNNING");
    expect(ErrorCode.INVALID_DATE_FORMAT).toBe("INVALID_DATE_FORMAT");
    expect(ErrorCode.INVALID_ID_FORMAT).toBe("INVALID_ID_FORMAT");
    expect(ErrorCode.APPLESCRIPT_ERROR).toBe("APPLESCRIPT_ERROR");
    expect(ErrorCode.JSON_PARSE_ERROR).toBe("JSON_PARSE_ERROR");
    expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ErrorCode.UNKNOWN_ERROR).toBe("UNKNOWN_ERROR");
  });
});

describe("createError", () => {
  it("should create error without details", () => {
    const error = createError(ErrorCode.TASK_NOT_FOUND, "Task not found");
    expect(error).toEqual({
      code: "TASK_NOT_FOUND",
      message: "Task not found",
    });
  });

  it("should create error with details", () => {
    const error = createError(
      ErrorCode.TASK_NOT_FOUND,
      "Task not found",
      "ID: abc123"
    );
    expect(error).toEqual({
      code: "TASK_NOT_FOUND",
      message: "Task not found",
      details: "ID: abc123",
    });
  });

  it("should not include details key when undefined", () => {
    const error = createError(ErrorCode.UNKNOWN_ERROR, "Something went wrong");
    expect("details" in error).toBe(false);
  });
});

describe("parseAppleScriptError", () => {
  describe("OmniFocus not running", () => {
    it("should detect 'application isn't running' error", () => {
      const error = parseAppleScriptError(
        "OmniFocus got an error: Application isn't running."
      );
      expect(error.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
      expect(error.message).toBe("OmniFocus is not running");
    });

    it("should detect 'connection is invalid' error", () => {
      const error = parseAppleScriptError(
        "execution error: connection is invalid (-609)"
      );
      expect(error.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should detect 'not running' error", () => {
      const error = parseAppleScriptError(
        "OmniFocus is not running"
      );
      expect(error.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });
  });

  describe("task not found", () => {
    it("should detect 'can't get first flattened task' error", () => {
      const error = parseAppleScriptError(
        "OmniFocus got an error: Can't get first flattened task whose id is \"invalid-id\"."
      );
      expect(error.code).toBe(ErrorCode.TASK_NOT_FOUND);
      expect(error.message).toBe("Task not found");
    });

    it("should detect 'no task' error", () => {
      const error = parseAppleScriptError("No task matches the criteria");
      expect(error.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should detect 'task doesn't exist' error", () => {
      const error = parseAppleScriptError("The task doesn't exist anymore");
      expect(error.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });
  });

  describe("project not found", () => {
    it("should detect 'can't get first flattened project' error", () => {
      const error = parseAppleScriptError(
        "OmniFocus got an error: Can't get first flattened project whose name is \"NonExistent\"."
      );
      expect(error.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
      expect(error.message).toBe("Project not found");
    });

    it("should detect 'no project' error", () => {
      const error = parseAppleScriptError("No project found");
      expect(error.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
    });
  });

  describe("tag not found", () => {
    it("should detect 'can't get first flattened tag' error", () => {
      const error = parseAppleScriptError(
        "OmniFocus got an error: Can't get first flattened tag whose name is \"NonExistent\"."
      );
      expect(error.code).toBe(ErrorCode.TAG_NOT_FOUND);
      expect(error.message).toBe("Tag not found");
    });

    it("should detect 'no tag' error", () => {
      const error = parseAppleScriptError("No tag exists with that name");
      expect(error.code).toBe(ErrorCode.TAG_NOT_FOUND);
    });
  });

  describe("invalid date format", () => {
    it("should detect date conversion error", () => {
      const error = parseAppleScriptError(
        "OmniFocus got an error: Can't make \"not-a-date\" into type date."
      );
      expect(error.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(error.message).toBe("Invalid date format");
    });
  });

  describe("generic AppleScript error", () => {
    it("should return APPLESCRIPT_ERROR for unknown errors", () => {
      const error = parseAppleScriptError("Some unknown AppleScript error");
      expect(error.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
      expect(error.message).toBe("AppleScript execution failed");
      expect(error.details).toBe("Some unknown AppleScript error");
    });
  });

  describe("case insensitivity", () => {
    it("should handle uppercase error messages", () => {
      const error = parseAppleScriptError(
        "CAN'T GET FIRST FLATTENED TASK"
      );
      expect(error.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle mixed case error messages", () => {
      const error = parseAppleScriptError(
        "Application Isn't Running"
      );
      expect(error.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });
  });
});

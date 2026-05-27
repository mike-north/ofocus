import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  createError,
  parseScriptError,
} from "../../src/errors.js";

describe("ErrorCode", () => {
  it("exposes all expected error codes", () => {
    expect(ErrorCode.TASK_NOT_FOUND).toBe("TASK_NOT_FOUND");
    expect(ErrorCode.PROJECT_NOT_FOUND).toBe("PROJECT_NOT_FOUND");
    expect(ErrorCode.TAG_NOT_FOUND).toBe("TAG_NOT_FOUND");
    expect(ErrorCode.FOLDER_NOT_FOUND).toBe("FOLDER_NOT_FOUND");
    expect(ErrorCode.PERSPECTIVE_NOT_FOUND).toBe("PERSPECTIVE_NOT_FOUND");
    expect(ErrorCode.OMNIFOCUS_NOT_RUNNING).toBe("OMNIFOCUS_NOT_RUNNING");
    expect(ErrorCode.INVALID_DATE_FORMAT).toBe("INVALID_DATE_FORMAT");
    expect(ErrorCode.INVALID_ID_FORMAT).toBe("INVALID_ID_FORMAT");
    expect(ErrorCode.SCRIPT_ERROR).toBe("SCRIPT_ERROR");
    expect(ErrorCode.JSON_PARSE_ERROR).toBe("JSON_PARSE_ERROR");
    expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ErrorCode.UNKNOWN_ERROR).toBe("UNKNOWN_ERROR");
  });
});

describe("createError", () => {
  it("creates an error without details", () => {
    const error = createError(ErrorCode.TASK_NOT_FOUND, "Task not found");
    expect(error).toEqual({
      code: "TASK_NOT_FOUND",
      message: "Task not found",
    });
  });

  it("creates an error with details", () => {
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

  it("omits the details key when undefined", () => {
    const error = createError(ErrorCode.UNKNOWN_ERROR, "Something went wrong");
    expect("details" in error).toBe(false);
  });
});

describe("parseScriptError", () => {
  describe("OmniFocus not running", () => {
    it("detects 'application isn't running'", () => {
      const error = parseScriptError(
        "OmniFocus got an error: Application isn't running."
      );
      expect(error.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
      expect(error.message).toBe("OmniFocus is not running");
    });

    it("detects 'connection is invalid'", () => {
      const error = parseScriptError(
        "execution error: connection is invalid (-609)"
      );
      expect(error.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("detects 'not running'", () => {
      const error = parseScriptError("OmniFocus is not running");
      expect(error.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });
  });

  describe("entity-not-found", () => {
    it("maps 'Task not found' to TASK_NOT_FOUND", () => {
      const error = parseScriptError("Error: Task not found");
      expect(error.code).toBe(ErrorCode.TASK_NOT_FOUND);
      expect(error.message).toBe("Task not found");
    });

    it("maps 'Project not found' to PROJECT_NOT_FOUND", () => {
      const error = parseScriptError("Error: Project not found");
      expect(error.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
    });

    it("maps 'Tag not found' to TAG_NOT_FOUND", () => {
      const error = parseScriptError("Error: Tag not found");
      expect(error.code).toBe(ErrorCode.TAG_NOT_FOUND);
    });

    it("maps 'Folder not found' to FOLDER_NOT_FOUND", () => {
      const error = parseScriptError("Error: Folder not found");
      expect(error.code).toBe(ErrorCode.FOLDER_NOT_FOUND);
    });

    it("maps 'Perspective not found' to PERSPECTIVE_NOT_FOUND", () => {
      const error = parseScriptError("Error: Perspective not found");
      expect(error.code).toBe(ErrorCode.PERSPECTIVE_NOT_FOUND);
    });
  });

  describe("generic script error", () => {
    it("returns SCRIPT_ERROR for unrecognised messages", () => {
      const error = parseScriptError("Some unknown failure");
      expect(error.code).toBe(ErrorCode.SCRIPT_ERROR);
      expect(error.message).toBe("Script execution failed");
      expect(error.details).toBe("Some unknown failure");
    });
  });

  describe("case insensitivity", () => {
    it("handles uppercase 'TASK NOT FOUND'", () => {
      const error = parseScriptError("ERROR: TASK NOT FOUND");
      expect(error.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("handles mixed case 'Application Isn't Running'", () => {
      const error = parseScriptError("Application Isn't Running");
      expect(error.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });
  });
});

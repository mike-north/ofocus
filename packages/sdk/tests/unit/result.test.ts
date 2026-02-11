import { describe, it, expect } from "@jest/globals";
import { success, failure, failureMessage } from "../../src/result.js";
import { ErrorCode, createError } from "../../src/errors.js";

describe("success", () => {
  it("should create a successful result with data", () => {
    const data = { id: "123", name: "Test Task" };
    const result = success(data);

    expect(result).toEqual({
      success: true,
      data,
      error: null,
    });
  });

  it("should handle null data", () => {
    const result = success(null);

    expect(result).toEqual({
      success: true,
      data: null,
      error: null,
    });
  });

  it("should handle primitive data", () => {
    const result = success("simple string");

    expect(result).toEqual({
      success: true,
      data: "simple string",
      error: null,
    });
  });

  it("should handle array data", () => {
    const data = [{ id: "1" }, { id: "2" }];
    const result = success(data);

    expect(result).toEqual({
      success: true,
      data,
      error: null,
    });
  });

  it("should handle empty array", () => {
    const result = success([]);

    expect(result).toEqual({
      success: true,
      data: [],
      error: null,
    });
  });
});

describe("failure", () => {
  it("should create a failed result with error", () => {
    const error = createError(ErrorCode.TASK_NOT_FOUND, "Task not found");
    const result = failure(error);

    expect(result).toEqual({
      success: false,
      data: null,
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task not found",
      },
    });
  });

  it("should preserve error details", () => {
    const error = createError(
      ErrorCode.APPLESCRIPT_ERROR,
      "Script failed",
      "Line 42: syntax error"
    );
    const result = failure(error);

    expect(result).toEqual({
      success: false,
      data: null,
      error: {
        code: "APPLESCRIPT_ERROR",
        message: "Script failed",
        details: "Line 42: syntax error",
      },
    });
  });

  it("should handle all error codes", () => {
    const errorCodes = [
      ErrorCode.TASK_NOT_FOUND,
      ErrorCode.PROJECT_NOT_FOUND,
      ErrorCode.TAG_NOT_FOUND,
      ErrorCode.OMNIFOCUS_NOT_RUNNING,
      ErrorCode.INVALID_DATE_FORMAT,
      ErrorCode.INVALID_ID_FORMAT,
      ErrorCode.APPLESCRIPT_ERROR,
      ErrorCode.JSON_PARSE_ERROR,
      ErrorCode.VALIDATION_ERROR,
      ErrorCode.UNKNOWN_ERROR,
    ];

    for (const code of errorCodes) {
      const error = createError(code, `Error: ${code}`);
      const result = failure(error);

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe(code);
    }
  });
});

describe("failureMessage", () => {
  it("should create a failed result with UNKNOWN_ERROR code", () => {
    const result = failureMessage("Something went wrong");

    expect(result).toEqual({
      success: false,
      data: null,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Something went wrong",
      },
    });
  });

  it("should handle empty message", () => {
    const result = failureMessage("");

    expect(result).toEqual({
      success: false,
      data: null,
      error: {
        code: "UNKNOWN_ERROR",
        message: "",
      },
    });
  });

  it("should handle long messages", () => {
    const longMessage = "A".repeat(1000);
    const result = failureMessage(longMessage);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe(longMessage);
  });
});

describe("type safety", () => {
  it("success result should have success: true", () => {
    const result = success({ id: "123" });
    // Type guard check
    if (result.success) {
      expect(result.data).not.toBeNull();
      expect(result.error).toBeNull();
    } else {
      // This branch should never execute
      expect(true).toBe(false);
    }
  });

  it("failure result should have success: false", () => {
    const result = failure(createError(ErrorCode.UNKNOWN_ERROR, "Error"));
    // Type guard check
    if (!result.success) {
      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    } else {
      // This branch should never execute
      expect(true).toBe(false);
    }
  });
});

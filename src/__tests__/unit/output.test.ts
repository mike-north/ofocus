import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { success, failure, failureMessage, output } from "../../lib/output.js";
import { ErrorCode, createError } from "../../lib/errors.js";

describe("success", () => {
  it("should create successful output with data", () => {
    const result = success({ id: "123", name: "Test" });
    expect(result).toEqual({
      success: true,
      data: { id: "123", name: "Test" },
      error: null,
    });
  });

  it("should create successful output with array data", () => {
    const result = success([1, 2, 3]);
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.error).toBeNull();
  });

  it("should create successful output with null data", () => {
    const result = success(null);
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it("should create successful output with primitive data", () => {
    const stringResult = success("done");
    expect(stringResult.data).toBe("done");

    const numberResult = success(42);
    expect(numberResult.data).toBe(42);

    const boolResult = success(true);
    expect(boolResult.data).toBe(true);
  });
});

describe("failure", () => {
  it("should create failed output with CliError", () => {
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

  it("should create failed output with error details", () => {
    const error = createError(
      ErrorCode.APPLESCRIPT_ERROR,
      "Script failed",
      "Line 42: syntax error"
    );
    const result = failure(error);
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    expect(result.error?.details).toBe("Line 42: syntax error");
  });

  it("should preserve error code type", () => {
    const error = createError(
      ErrorCode.OMNIFOCUS_NOT_RUNNING,
      "OmniFocus is not running"
    );
    const result = failure(error);
    expect(result.error?.code).toBe("OMNIFOCUS_NOT_RUNNING");
  });
});

describe("failureMessage", () => {
  it("should create failed output with string message", () => {
    const result = failureMessage("Something went wrong");
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(result.error?.message).toBe("Something went wrong");
  });

  it("should not include details", () => {
    const result = failureMessage("Error occurred");
    expect(result.error && "details" in result.error).toBe(false);
  });
});

describe("output", () => {
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("JSON output (json=true)", () => {
    it("should output success as JSON", () => {
      const result = success({ id: "123" });
      output(result, true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(result, null, 2)
      );
    });

    it("should output failure as JSON", () => {
      const error = createError(ErrorCode.TASK_NOT_FOUND, "Task not found");
      const result = failure(error);
      output(result, true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(result, null, 2)
      );
    });

    it("should include error details in JSON output", () => {
      const error = createError(
        ErrorCode.APPLESCRIPT_ERROR,
        "Failed",
        "Details here"
      );
      const result = failure(error);
      output(result, true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Details here")
      );
    });
  });

  describe("Human output (json=false)", () => {
    it("should output error message to stderr", () => {
      const error = createError(ErrorCode.TASK_NOT_FOUND, "Task not found");
      const result = failure(error);
      output(result, false);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Task not found");
    });

    it("should output error details to stderr", () => {
      const error = createError(
        ErrorCode.APPLESCRIPT_ERROR,
        "Script failed",
        "syntax error on line 5"
      );
      const result = failure(error);
      output(result, false);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Script failed");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Details: syntax error on line 5"
      );
    });

    it("should handle missing error gracefully", () => {
      const result = { success: false, data: null, error: null };
      output(result, false);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Unknown error");
    });

    it("should output 'Success (no data)' for null data", () => {
      const result = success(null);
      output(result, false);
      expect(consoleLogSpy).toHaveBeenCalledWith("Success (no data)");
    });

    it("should output 'No results found.' for empty array", () => {
      const result = success([]);
      output(result, false);
      expect(consoleLogSpy).toHaveBeenCalledWith("No results found.");
    });
  });
});

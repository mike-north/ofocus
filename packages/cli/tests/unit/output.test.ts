import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { success, failure, createError, ErrorCode } from "@ofocus/sdk";
import { output } from "../../src/output.js";

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

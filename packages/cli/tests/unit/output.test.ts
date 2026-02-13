import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import {
  success,
  failure,
  createError,
  ErrorCode,
  type OFTask,
  type PaginatedResult,
} from "@ofocus/sdk";
import { output } from "../../src/output.js";

describe("output", () => {
  let consoleLogSpy: MockInstance<typeof console.log>;
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleLogSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
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

  describe("Paginated results", () => {
    const createMockTask = (id: string, name: string): OFTask => ({
      id,
      name,
      note: null,
      flagged: false,
      completed: false,
      dueDate: null,
      deferDate: null,
      completionDate: null,
      projectId: null,
      projectName: null,
      tags: [],
      estimatedMinutes: null,
    });

    it("should format paginated tasks with pagination info", () => {
      const paginatedResult: PaginatedResult<OFTask> = {
        items: [createMockTask("task-1", "Task One")],
        totalCount: 10,
        returnedCount: 1,
        hasMore: true,
        offset: 0,
        limit: 1,
      };
      const result = success(paginatedResult);
      output(result, false);

      // Should show task
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Task One")
      );
      // Should show pagination info
      expect(consoleLogSpy).toHaveBeenCalledWith("Showing 1-1 of 10 items");
      // Should show "more available" message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "(9 more available, use --offset 1 to see next page)"
      );
    });

    it("should format paginated results without hasMore message when no more results", () => {
      const paginatedResult: PaginatedResult<OFTask> = {
        items: [createMockTask("task-1", "Task One")],
        totalCount: 1,
        returnedCount: 1,
        hasMore: false,
        offset: 0,
        limit: 10,
      };
      const result = success(paginatedResult);
      output(result, false);

      expect(consoleLogSpy).toHaveBeenCalledWith("Showing 1-1 of 1 items");
      // Should NOT show "more available" message
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("more available")
      );
    });

    it("should show 'No results found' for empty paginated results", () => {
      const paginatedResult: PaginatedResult<OFTask> = {
        items: [],
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
        offset: 0,
        limit: 10,
      };
      const result = success(paginatedResult);
      output(result, false);

      expect(consoleLogSpy).toHaveBeenCalledWith("No results found.");
      expect(consoleLogSpy).toHaveBeenCalledWith("Total: 0 items");
    });

    it("should show correct offset when paginating", () => {
      const paginatedResult: PaginatedResult<OFTask> = {
        items: [
          createMockTask("task-11", "Task Eleven"),
          createMockTask("task-12", "Task Twelve"),
        ],
        totalCount: 50,
        returnedCount: 2,
        hasMore: true,
        offset: 10,
        limit: 2,
      };
      const result = success(paginatedResult);
      output(result, false);

      // Should show correct range (offset+1 to offset+returnedCount)
      expect(consoleLogSpy).toHaveBeenCalledWith("Showing 11-12 of 50 items");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "(38 more available, use --offset 12 to see next page)"
      );
    });

    it("should output paginated result as JSON when json=true", () => {
      const paginatedResult: PaginatedResult<OFTask> = {
        items: [createMockTask("task-1", "Task One")],
        totalCount: 1,
        returnedCount: 1,
        hasMore: false,
        offset: 0,
        limit: 10,
      };
      const result = success(paginatedResult);
      output(result, true);

      const outputStr = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(outputStr) as {
        success: boolean;
        data: PaginatedResult<OFTask>;
      };
      expect(parsed.success).toBe(true);
      expect(parsed.data.items).toHaveLength(1);
      expect(parsed.data.totalCount).toBe(1);
      expect(parsed.data.hasMore).toBe(false);
    });

    it("should not detect objects missing required paginated fields", () => {
      // Object that looks similar but isn't a PaginatedResult
      const notPaginated = {
        items: [{ id: "123" }],
        totalCount: 1,
        // Missing: returnedCount, hasMore, offset, limit
      };
      const result = success(notPaginated);
      output(result, false);

      // Should fall through to generic JSON output, not pagination formatter
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Showing")
      );
    });
  });
});

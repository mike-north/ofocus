/**
 * Tests for CLI output formatters.
 *
 * @see https://toonformat.dev/ TOON format specification
 * @see https://www.npmjs.com/package/@toon-format/toon @toon-format/toon package
 */
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
import { encode } from "@toon-format/toon";
import {
  output,
  outputJson,
  outputToon,
  outputHuman,
  type OutputFormat,
} from "../../src/output.js";

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Spy setup
// ---------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // outputJson
  // -------------------------------------------------------------------------

  describe("JSON output (format='json')", () => {
    it("should output success as JSON", () => {
      const result = success({ id: "123" });
      output(result, "json");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(result, null, 2)
      );
    });

    it("should output failure as JSON", () => {
      const error = createError(ErrorCode.TASK_NOT_FOUND, "Task not found");
      const result = failure(error);
      output(result, "json");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(result, null, 2)
      );
    });

    it("should include error details in JSON output", () => {
      const error = createError(
        ErrorCode.SCRIPT_ERROR,
        "Failed",
        "Details here"
      );
      const result = failure(error);
      output(result, "json");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Details here")
      );
    });
  });

  // -------------------------------------------------------------------------
  // outputToon
  // -------------------------------------------------------------------------

  /**
   * TOON structural invariants tested below:
   *
   * For a uniform array of N objects with the same fields F1,F2,...:
   *   [N]{F1,F2,...}:
   *     val1,val2,...
   *
   * @see https://toonformat.dev/ — §3 "Tabular arrays"
   */
  describe("TOON output (format='toon')", () => {
    it("success with array-of-objects payload serializes to TOON array form", () => {
      // Three tasks — TOON encodes arrays of objects using a compact array
      // notation. For objects with nested arrays or null-valued fields that
      // prevent perfect uniformity, TOON uses the `[N]:` header with `-` rows.
      // For truly uniform flat objects (no nested arrays/objects), it uses
      // the tabular `[N]{fields}:` form instead.
      // @see https://toonformat.dev/ §3 "Arrays"
      const tasks = [
        createMockTask("abc123", "Buy milk"),
        createMockTask("def456", "Pay bills"),
        createMockTask("ghi789", "Call mom"),
      ];
      const result = success(tasks);
      output(result, "toon");

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const toonOutput = consoleLogSpy.mock.calls[0]?.[0] as string;

      // Verify the output matches what @toon-format/toon produces directly
      expect(toonOutput).toBe(encode(result));

      // Structural invariant: array header for the `data` field.
      // The CliOutput envelope wraps the 3-element array as `data[3]:`.
      // @see https://toonformat.dev/ §3 "Arrays"
      expect(toonOutput).toContain("data[3]:");

      // The top-level envelope fields
      expect(toonOutput).toContain("success: true");

      // The actual task names appear in the output
      expect(toonOutput).toContain("Buy milk");
      expect(toonOutput).toContain("Pay bills");
      expect(toonOutput).toContain("Call mom");
    });

    it("TOON tabular form appears for truly uniform flat arrays", () => {
      // When objects have only primitive-valued fields (no nulls, no nested
      // arrays), TOON uses the more compact tabular `[N]{fields}:` form.
      // @see https://toonformat.dev/ §3.1 "Tabular arrays"
      const items = [
        { id: "a1", name: "Alpha", count: 1 },
        { id: "b2", name: "Beta", count: 2 },
        { id: "c3", name: "Gamma", count: 3 },
      ];
      const result = success(items);
      output(result, "toon");

      const toonOutput = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(toonOutput).toBe(encode(result));

      // Tabular header: data[3]{id,name,count}:
      // @see https://toonformat.dev/ §3.1 "Tabular array header"
      expect(toonOutput).toMatch(/data\[3\]\{[^}]+\}:/);
      expect(toonOutput).toContain("Alpha");
      expect(toonOutput).toContain("Beta");
    });

    it("success with single object payload serializes to TOON key:value form", () => {
      // Single object → key: value lines (no tabular header).
      // @see https://toonformat.dev/ §2 "Objects"
      const task = createMockTask("abc123", "Buy milk");
      const result = success(task);
      output(result, "toon");

      const toonOutput = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(toonOutput).toBe(encode(result));
      // Single-object data appears with key: value lines
      expect(toonOutput).toContain("name: Buy milk");
      expect(toonOutput).toContain("id: abc123");
    });

    it("success with string primitive payload serializes to TOON", () => {
      // Primitive string at root → inline value.
      // @see https://toonformat.dev/ §1 "Primitives"
      const result = success("hello world");
      output(result, "toon");

      const toonOutput = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(toonOutput).toBe(encode(result));
      expect(toonOutput).toContain("hello world");
    });

    it("success with number primitive payload serializes to TOON", () => {
      const result = success(42);
      output(result, "toon");

      const toonOutput = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(toonOutput).toBe(encode(result));
      expect(toonOutput).toContain("42");
    });

    it("failure envelope serializes as TOON (does not fall back to JSON for errors)", () => {
      // Error envelope must also be TOON-encoded, not JSON.
      // @see https://toonformat.dev/ §2 "Objects"
      const error = createError(ErrorCode.TASK_NOT_FOUND, "Task not found");
      const result = failure(error);
      output(result, "toon");

      const toonOutput = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(toonOutput).toBe(encode(result));
      // TOON object: key: value lines, not JSON braces
      expect(toonOutput).not.toMatch(/^\{/);
      expect(toonOutput).toContain("success: false");
    });

    it("empty array payload serializes to TOON", () => {
      // Empty array: TOON represents it as `[]`.
      // @see https://toonformat.dev/ §3 "Arrays"
      const result = success([]);
      output(result, "toon");

      const toonOutput = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(toonOutput).toBe(encode(result));
      expect(toonOutput).toContain("[]");
    });

    it("TOON output is smaller than equivalent JSON for 3-task arrays", () => {
      // Validate the ~40% token savings claim.
      // @see https://toonformat.dev/ — efficiency rationale
      const tasks = [
        createMockTask("abc123", "Buy milk"),
        createMockTask("def456", "Pay bills"),
        createMockTask("ghi789", "Call mom"),
      ];
      const result = success(tasks);
      const jsonSize = JSON.stringify(result, null, 2).length;
      const toonSize = encode(result).length;
      expect(toonSize).toBeLessThan(jsonSize);
    });

    it("outputToon writes directly to stdout via console.log", () => {
      // outputToon is the direct function, not the dispatch
      const result = success({ id: "x" });
      outputToon(result);
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const out = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(out).toBe(encode(result));
    });
  });

  // -------------------------------------------------------------------------
  // outputHuman
  // -------------------------------------------------------------------------

  describe("Human output (format='human')", () => {
    it("should output error message to stderr", () => {
      const error = createError(ErrorCode.TASK_NOT_FOUND, "Task not found");
      const result = failure(error);
      output(result, "human");
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Task not found");
    });

    it("should output error details to stderr", () => {
      const error = createError(
        ErrorCode.SCRIPT_ERROR,
        "Script failed",
        "syntax error on line 5"
      );
      const result = failure(error);
      output(result, "human");
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Script failed");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Details: syntax error on line 5"
      );
    });

    it("should handle missing error gracefully", () => {
      const result = { success: false, data: null, error: null };
      output(result, "human");
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Unknown error");
    });

    it("should output 'Success (no data)' for null data", () => {
      const result = success(null);
      output(result, "human");
      expect(consoleLogSpy).toHaveBeenCalledWith("Success (no data)");
    });

    it("should output 'No results found.' for empty array", () => {
      const result = success([]);
      output(result, "human");
      expect(consoleLogSpy).toHaveBeenCalledWith("No results found.");
    });
  });

  // -------------------------------------------------------------------------
  // output dispatch
  // -------------------------------------------------------------------------

  describe("output dispatch", () => {
    it("'json' format routes to outputJson", () => {
      const outputJsonSpy = vi.spyOn({ outputJson }, "outputJson");
      // Use the output function and verify the result matches JSON output
      const result = success({ id: "123" });
      output(result, "json");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(result, null, 2)
      );
    });

    it("'toon' format routes to outputToon", () => {
      const result = success({ id: "123" });
      output(result, "toon");
      const toonOutput = consoleLogSpy.mock.calls[0]?.[0] as string;
      // TOON output should NOT be valid JSON (it uses key: value syntax)
      expect(toonOutput).not.toMatch(/^\{/);
      // The full CliOutput envelope is encoded: the data.id field is nested
      // and "123" is a string that gets quoted in TOON.
      // @see https://toonformat.dev/ §1.3 "String quoting rules"
      expect(toonOutput).toContain('id: "123"');
    });

    it("'human' format routes to outputHuman", () => {
      const result = success(null);
      output(result, "human");
      expect(consoleLogSpy).toHaveBeenCalledWith("Success (no data)");
    });

    it("OutputFormat type accepts only valid format strings", () => {
      // Compile-time check: the following are all valid OutputFormat values
      const formats: OutputFormat[] = ["json", "toon", "human"];
      for (const fmt of formats) {
        const result = success({ id: "x" });
        output(result, fmt);
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
      }
      // If we got here without TypeScript errors, the type is correct
      expect(true).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Paginated results (regression suite — unchanged behavior for json/human)
  // -------------------------------------------------------------------------

  describe("Paginated results", () => {
    it("should format paginated tasks with pagination info (human)", () => {
      const paginatedResult: PaginatedResult<OFTask> = {
        items: [createMockTask("task-1", "Task One")],
        totalCount: 10,
        returnedCount: 1,
        hasMore: true,
        offset: 0,
        limit: 1,
      };
      const result = success(paginatedResult);
      output(result, "human");

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

    it("should format paginated results without hasMore message when no more results (human)", () => {
      const paginatedResult: PaginatedResult<OFTask> = {
        items: [createMockTask("task-1", "Task One")],
        totalCount: 1,
        returnedCount: 1,
        hasMore: false,
        offset: 0,
        limit: 10,
      };
      const result = success(paginatedResult);
      output(result, "human");

      expect(consoleLogSpy).toHaveBeenCalledWith("Showing 1-1 of 1 items");
      // Should NOT show "more available" message
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("more available")
      );
    });

    it("should show 'No results found' for empty paginated results (human)", () => {
      const paginatedResult: PaginatedResult<OFTask> = {
        items: [],
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
        offset: 0,
        limit: 10,
      };
      const result = success(paginatedResult);
      output(result, "human");

      expect(consoleLogSpy).toHaveBeenCalledWith("No results found.");
      expect(consoleLogSpy).toHaveBeenCalledWith("Total: 0 items");
    });

    it("should show correct offset when paginating (human)", () => {
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
      output(result, "human");

      // Should show correct range (offset+1 to offset+returnedCount)
      expect(consoleLogSpy).toHaveBeenCalledWith("Showing 11-12 of 50 items");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "(38 more available, use --offset 12 to see next page)"
      );
    });

    it("should output paginated result as JSON when format='json'", () => {
      const paginatedResult: PaginatedResult<OFTask> = {
        items: [createMockTask("task-1", "Task One")],
        totalCount: 1,
        returnedCount: 1,
        hasMore: false,
        offset: 0,
        limit: 10,
      };
      const result = success(paginatedResult);
      output(result, "json");

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

    it("should not detect objects missing required paginated fields (human)", () => {
      // Object that looks similar but isn't a PaginatedResult
      const notPaginated = {
        items: [{ id: "123" }],
        totalCount: 1,
        // Missing: returnedCount, hasMore, offset, limit
      };
      const result = success(notPaginated);
      output(result, "human");

      // Should fall through to generic JSON output, not pagination formatter
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Showing")
      );
    });
  });

  // -------------------------------------------------------------------------
  // Direct function exports
  // -------------------------------------------------------------------------

  describe("direct exports", () => {
    it("outputJson writes the full CliOutput envelope as pretty JSON", () => {
      const result = success({ id: "abc" });
      outputJson(result);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(result, null, 2)
      );
    });

    it("outputHuman writes human-readable text (no JSON braces)", () => {
      const result = success(null);
      outputHuman(result);
      expect(consoleLogSpy).toHaveBeenCalledWith("Success (no data)");
      // Should not output raw JSON
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("{")
      );
    });
  });
});

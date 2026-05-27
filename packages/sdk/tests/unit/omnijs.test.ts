import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runOmniJS,
  runOmniJSWrapped,
  wrapOmniJS,
  toOmniJSDate,
  escapeJSString,
  escapeJSForAppleScript,
} from "../../src/omnijs.js";
import { execFile } from "node:child_process";

// Mock node:child_process execFile
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

// Helper to simulate successful execFile callback
function mockExecFileSuccess(stdout: string, stderr = "") {
  mockExecFile.mockImplementation(
    (
      _file: string,
      _args: unknown,
      _opts: unknown,
      callback: (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void
    ) => {
      callback(null, { stdout, stderr });
    }
  );
}

// Helper to simulate execFile error
function mockExecFileError(errorMessage: string, killed = false) {
  mockExecFile.mockImplementation(
    (
      _file: string,
      _args: unknown,
      _opts: unknown,
      callback: (
        error: Error | null,
        result: { stdout: string; stderr: string } | null
      ) => void
    ) => {
      const error = new Error(errorMessage) as Error & { killed?: boolean };
      if (killed) {
        error.killed = true;
      }
      callback(error, null);
    }
  );
}

describe("omnijs", () => {
  describe("escapeJSString", () => {
    it("should escape backslashes", () => {
      expect(escapeJSString("path\\to\\file")).toBe("path\\\\to\\\\file");
    });

    it("should escape double quotes", () => {
      expect(escapeJSString('say "hello"')).toBe('say \\"hello\\"');
    });

    it("should escape single quotes", () => {
      expect(escapeJSString("it's")).toBe("it\\'s");
    });

    it("should escape newlines", () => {
      expect(escapeJSString("line1\nline2")).toBe("line1\\nline2");
    });

    it("should escape tabs", () => {
      expect(escapeJSString("col1\tcol2")).toBe("col1\\tcol2");
    });

    it("should handle combined special characters", () => {
      expect(escapeJSString('a "b"\nc')).toBe('a \\"b\\"\\nc');
    });

    it("should handle empty string", () => {
      expect(escapeJSString("")).toBe("");
    });
  });

  describe("escapeJSForAppleScript", () => {
    it("should escape backslashes (double, not quadruple)", () => {
      expect(escapeJSForAppleScript("C:\\Users\\docs")).toBe(
        "C:\\\\Users\\\\docs"
      );
    });

    it("should escape double quotes", () => {
      expect(escapeJSForAppleScript('He said "hello"')).toBe(
        'He said \\"hello\\"'
      );
    });

    it("should escape newlines", () => {
      expect(escapeJSForAppleScript("line1\nline2")).toBe("line1\\nline2");
    });

    it("should escape tabs", () => {
      expect(escapeJSForAppleScript("col1\tcol2")).toBe("col1\\tcol2");
    });

    it("should escape carriage returns", () => {
      expect(escapeJSForAppleScript("line1\rline2")).toBe("line1\\rline2");
    });

    it("should not escape single quotes (no shell layer)", () => {
      expect(escapeJSForAppleScript("it's done")).toBe("it's done");
    });

    it("should handle combined special characters", () => {
      const input = 'She said "it\'s a backslash: \\" today';
      const result = escapeJSForAppleScript(input);
      // backslash becomes \\, double quote becomes \", single quote unchanged
      expect(result).toBe('She said \\"it\'s a backslash: \\\\\\" today');
    });

    it("should handle empty string", () => {
      expect(escapeJSForAppleScript("")).toBe("");
    });
  });

  describe("toOmniJSDate", () => {
    it("should convert ISO date to Date constructor", () => {
      const result = toOmniJSDate("2024-12-31");
      expect(result).toBe("new Date(2024, 11, 31, 0, 0, 0)");
    });

    it("should convert ISO datetime to Date constructor", () => {
      const result = toOmniJSDate("2024-06-15T14:30:00");
      expect(result).toBe("new Date(2024, 5, 15, 14, 30, 0)");
    });

    it("should handle non-ISO format with Date constructor", () => {
      const result = toOmniJSDate("December 31, 2024");
      expect(result).toBe('new Date("December 31, 2024")');
    });

    it("should handle month indexing correctly (0-based)", () => {
      // January = 0, December = 11
      const jan = toOmniJSDate("2024-01-15");
      expect(jan).toContain("0"); // month
      expect(jan).toBe("new Date(2024, 0, 15, 0, 0, 0)");

      const dec = toOmniJSDate("2024-12-25");
      expect(dec).toBe("new Date(2024, 11, 25, 0, 0, 0)");
    });
  });

  describe("wrapOmniJS", () => {
    it("should wrap body in a try/catch IIFE", () => {
      const result = wrapOmniJS("return JSON.stringify({ok: true});");
      expect(result).toContain("(function() {");
      expect(result).toContain("try {");
      expect(result).toContain("return JSON.stringify({ok: true});");
      expect(result).toContain("} catch (err) {");
      expect(result).toContain("__omnijs_error");
      expect(result).toContain("})()");
    });
  });

  describe("runOmniJS", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should execute script and parse JSON response", async () => {
      mockExecFileSuccess('{"result": 42}');

      const result = await runOmniJS<{ result: number }>(
        "JSON.stringify({result: 42})"
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 42 });
    });

    it("should use osascript with evaluate javascript via execFile", async () => {
      mockExecFileSuccess('{"ok": true}');

      await runOmniJS<unknown>("1+1");

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const [file, args] = mockExecFile.mock.calls[0]! as [
        string,
        string[],
        unknown,
        unknown,
      ];
      expect(file).toBe("osascript");
      expect(args).toHaveLength(2);
      expect(args[0]).toBe("-e");
      expect(args[1]).toContain('tell application "OmniFocus"');
      expect(args[1]).toContain("evaluate javascript");
    });

    it("should fail on non-JSON output instead of type-lying", async () => {
      mockExecFileSuccess("hello world");

      const result = await runOmniJS<string>("'hello world'");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Unexpected non-JSON output");
    });

    it("should handle stderr as error", async () => {
      mockExecFileSuccess("", "Script error: something went wrong");

      const result = await runOmniJS<unknown>("bad code");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should fail on empty response", async () => {
      mockExecFileSuccess("");

      const result = await runOmniJS<unknown>("undefined");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("empty");
    });

    it("should handle execution errors", async () => {
      mockExecFileError("Command failed: osascript");

      const result = await runOmniJS<unknown>("bad");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should detect OmniFocus not running", async () => {
      mockExecFileError("application isn't running");

      const result = await runOmniJS<unknown>("test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("OMNIFOCUS_NOT_RUNNING");
    });

    it("should handle timeout with killed flag", async () => {
      mockExecFileError("Command timed out", true);

      const result = await runOmniJS<unknown>("slow script");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("timed out");
    });

    it("should pass timeout option to execFile", async () => {
      mockExecFileSuccess('{"ok": true}');

      await runOmniJS<unknown>("test");

      const opts = mockExecFile.mock.calls[0]![2] as {
        timeout: number;
        maxBuffer: number;
      };
      expect(opts.timeout).toBe(30_000);
      expect(opts.maxBuffer).toBe(10 * 1024 * 1024);
    });
  });

  describe("runOmniJSWrapped", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should detect caught errors from wrapped script", async () => {
      mockExecFileSuccess(
        '{"__omnijs_error": true, "message": "Task not found: xyz"}'
      );

      const result = await runOmniJSWrapped<unknown>(
        'throw new Error("Task not found: xyz");'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should pass through successful results", async () => {
      mockExecFileSuccess('{"id": "abc-123", "name": "Test"}');

      const result = await runOmniJSWrapped<{ id: string; name: string }>(
        'return JSON.stringify({id: "abc-123", name: "Test"});'
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "abc-123", name: "Test" });
    });

    it("should pass through transport-level failures", async () => {
      mockExecFileError("Connection refused");

      const result = await runOmniJSWrapped<unknown>("test");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

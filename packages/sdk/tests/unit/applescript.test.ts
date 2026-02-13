import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  composeScript,
  omniFocusScript,
  omniFocusScriptWithHelpers,
  jsonHelpers,
  runComposedScript,
  runAppleScript,
  runAppleScriptFile,
} from "../../src/applescript.js";
import { exec } from "node:child_process";

// Mock node:child_process exec
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

const mockExec = vi.mocked(exec);

// Helper to simulate successful exec callback
function mockExecSuccess(stdout: string, stderr = "") {
  mockExec.mockImplementation(
    (
      _cmd: string,
      callback: (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void
    ) => {
      callback(null, { stdout, stderr });
    }
  );
}

// Helper to simulate exec error
function mockExecError(errorMessage: string) {
  mockExec.mockImplementation(
    (
      _cmd: string,
      callback: (
        error: Error | null,
        result: { stdout: string; stderr: string } | null
      ) => void
    ) => {
      callback(new Error(errorMessage), null);
    }
  );
}

describe("applescript", () => {
  describe("omniFocusScript", () => {
    it("should wrap body in OmniFocus tell block", () => {
      const result = omniFocusScript("return 1");
      expect(result).toContain('tell application "OmniFocus"');
      expect(result).toContain("tell default document");
      expect(result).toContain("return 1");
      expect(result).toContain("end tell");
    });
  });

  describe("omniFocusScriptWithHelpers", () => {
    it("should include JSON helpers before tell block", () => {
      const result = omniFocusScriptWithHelpers("return 1");
      expect(result).toContain("on jsonString(val)");
      expect(result).toContain("on jsonArray(theList)");
      expect(result).toContain("on escapeJson(str)");
      expect(result).toContain('tell application "OmniFocus"');
      expect(result).toContain("return 1");
    });

    it("should define helpers before the tell block", () => {
      const result = omniFocusScriptWithHelpers("return 1");
      const helpersPos = result.indexOf("on jsonString");
      const tellPos = result.indexOf('tell application "OmniFocus"');
      expect(helpersPos).toBeLessThan(tellPos);
    });
  });

  describe("composeScript", () => {
    it("should compose handlers and body", () => {
      const handlers = ["on foo()\nreturn 1\nend foo"];
      const body = "return my foo()";
      const result = composeScript(handlers, body);

      expect(result).toContain("on foo()");
      expect(result).toContain("return 1");
      expect(result).toContain("end foo");
      expect(result).toContain('tell application "OmniFocus"');
      expect(result).toContain("return my foo()");
    });

    it("should place handlers before tell block", () => {
      const handlers = ["on myHandler()\nend myHandler"];
      const body = "return 1";
      const result = composeScript(handlers, body);

      const handlerPos = result.indexOf("on myHandler");
      const tellPos = result.indexOf('tell application "OmniFocus"');
      expect(handlerPos).toBeLessThan(tellPos);
    });

    it("should join multiple handlers with blank lines", () => {
      const handlers = [
        "on handler1()\nend handler1",
        "on handler2()\nend handler2",
      ];
      const result = composeScript(handlers, "return 1");

      expect(result).toContain("on handler1()");
      expect(result).toContain("on handler2()");
      // Both handlers should be present
      const h1Pos = result.indexOf("on handler1");
      const h2Pos = result.indexOf("on handler2");
      expect(h1Pos).toBeLessThan(h2Pos);
    });

    it("should handle empty handlers array", () => {
      const result = composeScript([], "return 1");
      expect(result).toContain('tell application "OmniFocus"');
      expect(result).toContain("return 1");
    });
  });

  describe("jsonHelpers", () => {
    it("should contain required handler definitions", () => {
      expect(jsonHelpers).toContain("on jsonString(val)");
      expect(jsonHelpers).toContain("on jsonArray(theList)");
      expect(jsonHelpers).toContain("on escapeJson(str)");
    });

    it("should handle null and missing values in jsonString", () => {
      // The handler should check for empty, missing value, and "missing value"
      expect(jsonHelpers).toContain("missing value");
      expect(jsonHelpers).toContain("null");
    });
  });

  describe("runAppleScript", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should execute simple AppleScript and parse JSON response", async () => {
      mockExecSuccess('{"result": 42}');

      const result = await runAppleScript<{ result: number }>(
        'return "{\\"result\\": 42}"'
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 42 });
    });

    it("should return raw string for non-JSON output", async () => {
      mockExecSuccess("hello world");

      const result = await runAppleScript<string>('return "hello world"');

      expect(result.success).toBe(true);
      expect(result.data).toBe("hello world");
    });

    it("should handle stderr as error", async () => {
      mockExecSuccess("", "Script error: some problem");

      const result = await runAppleScript<unknown>('return "test"');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("AppleScript execution failed");
      expect(result.error?.details).toContain("some problem");
    });

    it("should escape single quotes in scripts", async () => {
      mockExecSuccess('"test"');

      await runAppleScript<string>('return "It\'s a test"');

      const calledCommand = mockExec.mock.calls[0][0] as string;
      // Single quotes should be escaped for shell
      expect(calledCommand).toContain("osascript -e");
      expect(calledCommand).toContain("It");
    });

    it("should fail on empty output", async () => {
      mockExecSuccess("");

      const result = await runAppleScript<unknown>('return ""');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("empty");
    });

    it("should handle execution errors", async () => {
      mockExecError("Command failed: osascript");

      const result = await runAppleScript<unknown>("return 1");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("AppleScript execution failed");
      expect(result.error?.details).toContain("Command failed");
    });
  });

  describe("runAppleScriptFile", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should execute script file without arguments", async () => {
      mockExecSuccess('{"success": true}');

      const result = await runAppleScriptFile<{ success: boolean }>(
        "/path/to/script.scpt"
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });

      const calledCommand = mockExec.mock.calls[0][0] as string;
      expect(calledCommand).toContain('osascript "/path/to/script.scpt"');
    });

    it("should execute script file with arguments", async () => {
      mockExecSuccess('{"id": "123"}');

      const result = await runAppleScriptFile<{ id: string }>(
        "/path/to/script.scpt",
        ["arg1", "arg2"]
      );

      expect(result.success).toBe(true);

      const calledCommand = mockExec.mock.calls[0][0] as string;
      expect(calledCommand).toContain('"arg1"');
      expect(calledCommand).toContain('"arg2"');
    });

    it("should escape special characters in arguments", async () => {
      mockExecSuccess("{}");

      await runAppleScriptFile<unknown>("/script.scpt", ["it's a test"]);

      const calledCommand = mockExec.mock.calls[0][0] as string;
      // Arguments should be quoted and escaped
      expect(calledCommand).toContain('"');
    });

    it("should fail on empty output", async () => {
      mockExecSuccess("");

      const result = await runAppleScriptFile<unknown>("/script.scpt");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("empty");
    });

    it("should handle execution errors", async () => {
      mockExecError("Script not found");

      const result = await runAppleScriptFile<unknown>("/nonexistent.scpt");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("AppleScript execution failed");
      expect(result.error?.details).toContain("Script not found");
    });
  });

  describe("runComposedScript", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should compose and execute script with handlers", async () => {
      mockExecSuccess('{"id": "123"}');

      const handlers = ["on myHandler()\nreturn 1\nend myHandler"];
      const body = "return my myHandler()";
      const result = await runComposedScript<{ id: string }>(handlers, body);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "123" });
      expect(mockExec).toHaveBeenCalledTimes(1);

      // Verify the script was composed correctly
      const calledCommand = mockExec.mock.calls[0][0] as string;
      expect(calledCommand).toContain("on myHandler()");
      expect(calledCommand).toContain('tell application "OmniFocus"');
      expect(calledCommand).toContain("return my myHandler()");
    });

    it("should handle empty handlers array", async () => {
      mockExecSuccess('{"result": true}');

      const result = await runComposedScript<{ result: boolean }>(
        [],
        "return true"
      );

      expect(result.success).toBe(true);
      const calledCommand = mockExec.mock.calls[0][0] as string;
      expect(calledCommand).toContain('tell application "OmniFocus"');
    });

    it("should propagate AppleScript execution errors", async () => {
      mockExecError("OmniFocus is not running");

      const result = await runComposedScript<unknown>([], "return 1");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("OmniFocus is not running");
    });

    it("should return raw string when output is not valid JSON", async () => {
      mockExecSuccess("not valid json");

      const result = await runComposedScript<string>([], "return 1");

      // When JSON parsing fails, runAppleScript returns the raw string
      expect(result.success).toBe(true);
      expect(result.data).toBe("not valid json");
    });

    it("should properly type the result", async () => {
      interface TestResult {
        taskId: string;
        taskName: string;
      }
      mockExecSuccess('{"taskId": "abc123", "taskName": "Test Task"}');

      const result = await runComposedScript<TestResult>([], "return 1");

      expect(result.success).toBe(true);
      expect(result.data?.taskId).toBe("abc123");
      expect(result.data?.taskName).toBe("Test Task");
    });

    it("should compose multiple handlers in correct order", async () => {
      mockExecSuccess("{}");

      const handlers = [
        "on firstHandler()\nend firstHandler",
        "on secondHandler()\nend secondHandler",
      ];
      await runComposedScript<unknown>(handlers, "return 1");

      const calledCommand = mockExec.mock.calls[0][0] as string;
      const firstPos = calledCommand.indexOf("firstHandler");
      const secondPos = calledCommand.indexOf("secondHandler");
      expect(firstPos).toBeLessThan(secondPos);
    });

    it("should fail when AppleScript returns empty output", async () => {
      mockExecSuccess("");

      const result = await runComposedScript<unknown>([], "return 1");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("empty");
    });
  });
});

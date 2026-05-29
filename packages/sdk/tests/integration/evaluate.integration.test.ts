/**
 * Integration tests for `evaluateScript` against live OmniFocus.
 *
 * These tests require OmniFocus to be running and accessible via osascript.
 * They are skipped in CI environments.
 *
 * @see https://omni-automation.com/omnifocus/index.html
 */

import { describe, it, expect } from "vitest";
import { evaluateScript } from "../../src/commands/evaluate.js";

const CI = process.env["CI"] === "true";

describe.skipIf(CI)("evaluateScript — integration", () => {
  it("evaluates a trivial known-good script and returns a number >= 0", async () => {
    const result = await evaluateScript({
      script: "return flattenedTasks.length;",
    });
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe("number");
    expect(result.data as number).toBeGreaterThanOrEqual(0);
  });

  it("injects args and uses them in the script", async () => {
    const result = await evaluateScript({
      script: 'return args.greeting + ", world";',
      args: { greeting: "hello" },
    });
    expect(result.success).toBe(true);
    expect(result.data).toBe("hello, world");
  });
});

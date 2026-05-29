/**
 * Unit tests for the `evaluateScript` command and `evaluateScriptDescriptor`.
 *
 * @see https://omni-automation.com/omnifocus/index.html
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, rm } from "node:fs/promises";
import {
  evaluateScript,
  evaluateScriptDescriptor,
} from "../../../src/commands/evaluate.js";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";

// ---------------------------------------------------------------------------
// Mock the omnijs module so tests don't require OmniFocus.
// ---------------------------------------------------------------------------

vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
  toOmniJSDate: vi.fn((s: string) => `new Date("${s}")`),
  wrapOmniJS: vi.fn((body: string) => body),
}));

import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResult<T>(data: T): OmniJSResult<T> {
  return { success: true, data };
}

function errResult(message: string): OmniJSResult<never> {
  return { success: false, error: { code: ErrorCode.SCRIPT_ERROR, message } };
}

// ---------------------------------------------------------------------------
// Descriptor metadata
// ---------------------------------------------------------------------------

describe("evaluateScriptDescriptor metadata", () => {
  it("has the correct canonical name", () => {
    expect(evaluateScriptDescriptor.name).toBe("evaluateScript");
  });

  it("has the correct CLI name", () => {
    expect(evaluateScriptDescriptor.cliName).toBe("eval");
  });

  it("has the correct MCP name", () => {
    expect(evaluateScriptDescriptor.mcpName).toBe("omnifocus_eval");
  });

  it("declares 'script' as the positional field", () => {
    expect(evaluateScriptDescriptor.cliPositional).toContain("script");
  });

  it("has a non-empty description", () => {
    expect(evaluateScriptDescriptor.description.trim().length).toBeGreaterThan(
      0
    );
  });

  it("description mentions 'last-resort' or 'Last-resort' (steering text present)", () => {
    expect(evaluateScriptDescriptor.description.toLowerCase()).toContain(
      "last-resort"
    );
  });

  it("description steers agents toward declarative commands", () => {
    expect(evaluateScriptDescriptor.description).toContain("tasks");
    expect(evaluateScriptDescriptor.description).toContain("projects");
  });

  it("inputSchema has script, file, and args fields", () => {
    const shape = evaluateScriptDescriptor.inputSchema.shape as Record<
      string,
      unknown
    >;
    expect(shape).toHaveProperty("script");
    expect(shape).toHaveProperty("file");
    expect(shape).toHaveProperty("args");
  });
});

// ---------------------------------------------------------------------------
// Schema-level validation (via descriptor.inputSchema.safeParse)
// Note: mutual-exclusion of script/file is enforced in the handler, not the
// schema, because defineCommand requires a plain ZodObject (not ZodEffects).
// ---------------------------------------------------------------------------

describe("input schema validation", () => {
  it("rejects when inline script exceeds 64 KB (schema-level)", () => {
    // 64 KB + 1 byte = too large
    const oversized = "x".repeat(65537);
    const result = evaluateScriptDescriptor.inputSchema.safeParse({
      script: oversized,
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 64 KB inline script (schema-level)", () => {
    const atLimit = "x".repeat(65536);
    const result = evaluateScriptDescriptor.inputSchema.safeParse({
      script: atLimit,
    });
    // Passes schema validation (return-statement check is in the handler)
    expect(result.success).toBe(true);
  });

  it("accepts script-only input", () => {
    const result = evaluateScriptDescriptor.inputSchema.safeParse({
      script: "return 1;",
    });
    expect(result.success).toBe(true);
  });

  it("accepts file-only input", () => {
    const result = evaluateScriptDescriptor.inputSchema.safeParse({
      file: "/tmp/script.js",
    });
    expect(result.success).toBe(true);
  });

  it("accepts args alongside script", () => {
    const result = evaluateScriptDescriptor.inputSchema.safeParse({
      script: "return args.x;",
      args: { x: 42 },
    });
    expect(result.success).toBe(true);
  });

  // --- Regression tests for PR #40: size cap must count UTF-8 bytes, not code units ---
  // MAX_SCRIPT_BYTES = 65536 (64 KB).

  it("rejects an inline script whose UTF-8 byte length exceeds 64 KB even if code-unit count is under the limit (schema-level)", () => {
    // Each emoji is 4 UTF-8 bytes but 2 UTF-16 code units.
    // 16384 emoji → exactly 65536 bytes, then "return 1;" (9 bytes) pushes it over.
    // Code-unit count: 32768 + 9 = 32777 (well under 65536 — old .length check would accept this).
    const emoji = "😀"; // 😀 — 4 UTF-8 bytes, 2 UTF-16 code units
    const oversized = emoji.repeat(16384) + "return 1;";
    const result = evaluateScriptDescriptor.inputSchema.safeParse({
      script: oversized,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an inline script whose UTF-8 byte length is exactly at the 64 KB limit (schema-level)", () => {
    // 65536 ASCII bytes → byteLength === 65536 === MAX_SCRIPT_BYTES exactly.
    const atLimit = "x".repeat(65536);
    const result = evaluateScriptDescriptor.inputSchema.safeParse({
      script: atLimit,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Handler-level mutual-exclusion validation
// ---------------------------------------------------------------------------

describe("evaluateScript — mutual-exclusion of script and file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when both script and file are provided", async () => {
    const result = await evaluateScript({
      script: "return 1;",
      file: "/tmp/foo.js",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toMatch(/not both/i);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("rejects when neither script nor file is provided", async () => {
    const result = await evaluateScript({});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toMatch(/script.*file|file.*script/i);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Handler: return-statement validation
// ---------------------------------------------------------------------------

describe("evaluateScript — return statement validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a script with no return statement", async () => {
    const result = await evaluateScript({
      script: "var x = 1;\nvar y = 2;",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toMatch(/return/i);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("rejects an empty script body", async () => {
    const result = await evaluateScript({ script: "   \n   \n  " });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("rejects a script where 'return' appears mid-body but not at the end", async () => {
    const result = await evaluateScript({
      script: "function f() { return 1; }\nvar x = f();",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toMatch(/return/i);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("accepts a script ending with 'return <expr>;' (with semicolon)", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(42));
    const result = await evaluateScript({
      script: "return flattenedTasks.length;",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a script ending with 'return <expr>' (no semicolon)", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(42));
    const result = await evaluateScript({
      script: "return flattenedTasks.length",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a script with trailing blank lines after the return", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(42));
    const result = await evaluateScript({
      script: "return 42;\n\n\n",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a multi-line script ending with return JSON.stringify(...)", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult({ count: 5 }));
    const result = await evaluateScript({
      script:
        "var tasks = flattenedTasks.filter(t => t.flagged);\nreturn JSON.stringify({ count: tasks.length });",
    });
    expect(result.success).toBe(true);
  });

  // --- Regression tests for PR #40: multi-line return expressions were rejected ---

  it("accepts multi-line return expressions (regression: PR #40 single-line bug) — object literal", async () => {
    // Previously, the validator only checked the last non-empty line ("}" after
    // stripping the trailing ";"), which fails the /^return\s+/ pattern.
    mockRunOmniJS.mockResolvedValueOnce(okResult({ foo: 1, bar: 2 }));
    const result = await evaluateScript({
      script: "return {\n  foo: 1,\n  bar: 2\n};",
    });
    expect(result.success).toBe(true);
  });

  it("accepts multi-line return with JSON.stringify spanning multiple lines (regression: PR #40 single-line bug)", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult({ items: [] }));
    const result = await evaluateScript({
      script:
        "const tasks = flattenedTasks;\n" +
        "return JSON.stringify({\n" +
        "  items: tasks.map(t => ({ id: t.id, name: t.name }))\n" +
        "});",
    });
    expect(result.success).toBe(true);
  });

  it("accepts single-line script followed by a multi-line return (regression: PR #40 single-line bug)", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(1));
    const result = await evaluateScript({
      script: "const x = 1;\nreturn x;",
    });
    expect(result.success).toBe(true);
  });

  it("accepts return followed by a multi-line array literal (regression: PR #40 single-line bug)", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult([1, 2, 3]));
    const result = await evaluateScript({
      script: "return [\n  1,\n  2,\n  3\n];",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a script where return has no expression (bare 'return' keyword)", async () => {
    const result = await evaluateScript({ script: "return" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Handler: file reading
// ---------------------------------------------------------------------------

describe("evaluateScript — file reading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the script body from a real temp file", async () => {
    const tmpFile = join(tmpdir(), `ofocus-eval-test-${Date.now()}.js`);
    await writeFile(tmpFile, "return 99;", "utf-8");
    try {
      mockRunOmniJS.mockResolvedValueOnce(okResult(99));
      const result = await evaluateScript({ file: tmpFile });
      expect(result.success).toBe(true);
      // The composed body passed to runOmniJSWrapped should contain the script text.
      const calledBody = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(calledBody).toContain("return 99;");
    } finally {
      await rm(tmpFile, { force: true });
    }
  });

  it("returns VALIDATION_ERROR for a non-existent file", async () => {
    const result = await evaluateScript({
      file: "/nonexistent/path/script.js",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toMatch(/cannot read/i);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_ERROR for a file that is too large", async () => {
    const tmpFile = join(tmpdir(), `ofocus-eval-oversized-${Date.now()}.js`);
    // Write 64 KB + 2 bytes (oversized content that still ends with return for safety)
    const oversized = "x".repeat(65535) + "\nreturn 1;";
    await writeFile(tmpFile, oversized, "utf-8");
    try {
      const result = await evaluateScript({ file: tmpFile });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toMatch(/64 KB/i);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    } finally {
      await rm(tmpFile, { force: true });
    }
  });

  // --- Regression tests for PR #40: handler must use byte-accurate size check ---

  it("rejects a file whose UTF-8 byte length exceeds 64 KB even if code-unit count is under the limit (handler, --file path)", async () => {
    // 16384 emoji × 4 bytes = 65536 bytes; "return 1;" = 9 bytes → 65545 bytes total.
    // Old body.length check: 32768 + 9 = 32777 code units → would have accepted.
    const tmpFile = join(
      tmpdir(),
      `ofocus-eval-emoji-oversized-${Date.now()}.js`
    );
    const emoji = "😀";
    const oversized = emoji.repeat(16384) + "return 1;";
    await writeFile(tmpFile, oversized, "utf-8");
    try {
      const result = await evaluateScript({ file: tmpFile });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toMatch(/64 KB/i);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    } finally {
      await rm(tmpFile, { force: true });
    }
  });

  it("accepts a file that is just under the 64 KB byte limit (handler, --file path)", async () => {
    // 65536 - 10 = 65526 ASCII bytes + "return 1;" (9 bytes) = 65535 bytes → under limit.
    const tmpFile = join(tmpdir(), `ofocus-eval-near-limit-${Date.now()}.js`);
    const body = "x".repeat(65536 - 10) + "\nreturn 1;";
    await writeFile(tmpFile, body, "utf-8");
    try {
      mockRunOmniJS.mockResolvedValueOnce(okResult(1));
      const result = await evaluateScript({ file: tmpFile });
      expect(result.success).toBe(true);
    } finally {
      await rm(tmpFile, { force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Handler: args injection
// ---------------------------------------------------------------------------

describe("evaluateScript — args injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("injects an empty args object when args is undefined", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(null));
    await evaluateScript({ script: "return null;" });

    const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
    expect(body).toContain(`const args = JSON.parse("{}")`);
  });

  it("injects args as a JSON.parse of double-stringified JSON", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult("hello, world"));
    await evaluateScript({
      script: "return args.greeting + ', world';",
      args: { foo: 1, bar: "baz" },
    });

    const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
    // The injected line should be a const args = JSON.parse("<json-string>");
    // where <json-string> is the double-stringified JSON.
    const expectedJson = JSON.stringify({ foo: 1, bar: "baz" });
    const expectedLiteral = JSON.stringify(expectedJson);
    expect(body).toContain(`const args = JSON.parse(${expectedLiteral})`);
  });

  it("handles args with nested objects", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(null));
    const args = { nested: { a: 1, b: [2, 3] }, top: "value" };
    await evaluateScript({ script: "return null;", args });

    const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
    const expectedJson = JSON.stringify(args);
    const expectedLiteral = JSON.stringify(expectedJson);
    expect(body).toContain(`const args = JSON.parse(${expectedLiteral})`);
  });

  it("safely handles args with strings containing double quotes", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(null));
    const args = { key: '"quoted"' };
    await evaluateScript({ script: "return null;", args });

    const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
    // The double-stringify ensures the quotes are escaped inside the JS string literal.
    const expectedJson = JSON.stringify(args);
    const expectedLiteral = JSON.stringify(expectedJson);
    expect(body).toContain(`const args = JSON.parse(${expectedLiteral})`);
  });

  it("safely handles adversarial args: injection attempt in value", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(null));
    // Adversarial: a value that tries to break out of a naive string interpolation.
    const args = {
      key: '"); eval("badstuff"); var x = "',
      "a\\b": "c\\nd",
    };
    await evaluateScript({ script: "return null;", args });

    const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
    // The body must contain the safely-encoded args prefix, not raw injection text.
    const expectedJson = JSON.stringify(args);
    const expectedLiteral = JSON.stringify(expectedJson);
    expect(body).toContain(`const args = JSON.parse(${expectedLiteral})`);
    // The dangerous string must NOT appear unencoded in the body.
    expect(body).not.toContain('"); eval("badstuff");');
  });

  it("safely handles args with backslashes and newlines in values", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(null));
    const args = { path: "C:\\Users\\foo", multiline: "line1\nline2" };
    await evaluateScript({ script: "return null;", args });

    const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
    const expectedJson = JSON.stringify(args);
    const expectedLiteral = JSON.stringify(expectedJson);
    expect(body).toContain(`const args = JSON.parse(${expectedLiteral})`);
  });

  it("places the user script after the args prefix", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(42));
    const userScript = "return flattenedTasks.length;";
    await evaluateScript({ script: userScript, args: { x: 1 } });

    const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
    const argsLineEnd = body.indexOf(";");
    const argsPrefix = body.slice(0, argsLineEnd + 1);
    const rest = body.slice(argsLineEnd + 1).trimStart();
    expect(argsPrefix).toContain("const args = JSON.parse(");
    expect(rest).toBe(userScript);
  });
});

// ---------------------------------------------------------------------------
// Handler: happy path and OmniJS failure propagation
// ---------------------------------------------------------------------------

describe("evaluateScript — execution results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success with the script's return value", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult({ count: 5 }));
    const result = await evaluateScript({
      script: "return JSON.stringify({ count: flattenedTasks.length });",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ count: 5 });
  });

  it("propagates OmniJS errors verbatim as SCRIPT_ERROR", async () => {
    mockRunOmniJS.mockResolvedValueOnce(
      errResult("TypeError: flattenedTasks is not defined")
    );
    const result = await evaluateScript({
      script: "return flattenedTasks.length;",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    expect(result.error?.message).toBe(
      "TypeError: flattenedTasks is not defined"
    );
  });

  it("handles scripts that return null", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(null));
    const result = await evaluateScript({ script: "return null;" });
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it("handles scripts that return a string", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult("hello"));
    const result = await evaluateScript({ script: 'return "hello";' });
    expect(result.success).toBe(true);
    expect(result.data).toBe("hello");
  });

  it("handles scripts that return a number", async () => {
    mockRunOmniJS.mockResolvedValueOnce(okResult(42));
    const result = await evaluateScript({ script: "return 42;" });
    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
  });
});

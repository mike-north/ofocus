import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

const plain = String.raw;

/** Maximum script size enforced at the handler level (covers both inline and file paths). */
const MAX_SCRIPT_BYTES = 65536;

/**
 * Input for the `evaluateScript` command.
 *
 * Exactly one of `script` or `file` must be provided.
 *
 * @public
 */
export interface EvaluateScriptInput {
  /** Inline OmniJS source code. Mutually exclusive with `file`. */
  script?: string | undefined;
  /** Path to a file containing OmniJS source. Mutually exclusive with `script`. */
  file?: string | undefined;
  /** Arguments injected as a `const args` global inside the script. */
  args?: Record<string, unknown> | undefined;
}

/**
 * Result from evaluating an OmniJS script.
 *
 * The payload type is intentionally `unknown` — the user wrote arbitrary code;
 * the SDK cannot promise a shape.
 *
 * @public
 */
export type EvaluateScriptResult = unknown;

// ---------------------------------------------------------------------------
// Zod input schema
// ---------------------------------------------------------------------------

/**
 * The base schema is a plain ZodObject so `defineCommand`'s `z.AnyZodObject`
 * constraint is satisfied. The mutual-exclusion check between `script` and
 * `file` is performed in the handler rather than via `.superRefine()`, which
 * would produce a `ZodEffects` and violate the constraint.
 */
const inputSchema = z.object({
  script: z
    .string()
    .refine(
      (s) => Buffer.byteLength(s, "utf-8") <= MAX_SCRIPT_BYTES,
      `Script must be ${String(MAX_SCRIPT_BYTES / 1024)} KB or less`
    )
    .optional()
    .describe(
      "OmniJS source code to evaluate against the user's OmniFocus database. " +
        "Must end with a `return <expression>` statement. Mutually exclusive with --file."
    ),
  file: z
    .string()
    .optional()
    .describe(
      "Path to a file containing OmniJS source. Read at execution time. " +
        "Mutually exclusive with --script. CLI: --file <path>"
    ),
  // The CLI passes `--args` as a raw JSON string, while MCP passes an object.
  // Preprocess JSON-parses a string input into an object before validation so
  // both adapters work. On parse failure the raw string is returned unchanged
  // so Zod emits a clean "Expected object, received string" error rather than
  // the preprocess throwing.
  args: z
    .preprocess(
      (v) => {
        if (typeof v !== "string") return v;
        try {
          return JSON.parse(v) as unknown;
        } catch {
          return v;
        }
      },
      z.record(z.string(), z.unknown())
    )
    .optional()
    .describe(
      "Arguments injected into the script as a global `args` constant " +
        "(deserialized from JSON). Use this instead of string-interpolating " +
        "values into the script body — args go through JSON.stringify and avoid escaping issues."
    ),
});

// ---------------------------------------------------------------------------
// Return-expression validation
// ---------------------------------------------------------------------------

/**
 * Check whether a script body ends with a `return <expression>` statement.
 *
 * The heuristic works in three steps:
 *
 * 1. Strip trailing whitespace, then strip one optional trailing `;`.
 * 2. Scan backwards through the stripped string for the **last** `return`
 *    keyword that is preceded by a statement boundary (start of string,
 *    newline, `;`, or `}`).
 * 3. Verify that the substring from that `return` to the end of the stripped
 *    string is bracket-balanced (`(`, `[`, `{`).  Balanced means we never see
 *    a closing bracket without a matching opener, and all openers are closed
 *    by the end.
 *
 * This correctly handles multi-line return expressions such as:
 *
 * ```js
 * return {
 *   foo: 1,
 *   bar: 2
 * };
 * ```
 *
 * **Known limitation**: the heuristic does not tokenise JS, so a `return`
 * that appears inside a string literal or comment is treated as real. In
 * practice agent-authored scripts don't hit this case, and the OmniJS runtime
 * would reject syntactically broken code anyway.
 *
 * @returns `true` if the body ends with a return statement, `false` otherwise.
 */
function endsWithReturn(body: string): boolean {
  // Step 1: strip trailing whitespace, then one optional trailing semicolon.
  let stripped = body.trimEnd();
  if (stripped.endsWith(";")) {
    stripped = stripped.slice(0, -1).trimEnd();
  }

  if (stripped.length === 0) {
    return false;
  }

  // Step 2: find the last `return` keyword preceded by a statement boundary.
  // Boundaries: start-of-string (^), newline (\n), semicolon (;), or `}`.
  const returnPattern = /(?:^|[\n;}\s])return(?:\s|$)/g;
  let lastReturnIndex = -1;
  let match: RegExpExecArray | null;

  while ((match = returnPattern.exec(stripped)) !== null) {
    // The actual `return` keyword may be offset by the boundary character.
    const returnStart = match.index + match[0].indexOf("return");
    lastReturnIndex = returnStart;
  }

  if (lastReturnIndex === -1) {
    return false;
  }

  // Step 3: verify the substring from `return` to end is bracket-balanced.
  const tail = stripped.slice(lastReturnIndex);

  // `return` alone (no expression) is not valid.
  const afterReturn = tail.slice("return".length).trimStart();
  if (afterReturn.length === 0) {
    return false;
  }

  let depth = 0;
  for (const ch of tail) {
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth < 0) {
        // Closing bracket without matching opener — not a valid tail.
        return false;
      }
    }
  }

  return depth === 0;
}

/**
 * Check that a script body ends with a `return <expression>` statement.
 *
 * Uses {@link endsWithReturn} for multi-line–safe detection.
 *
 * @returns `null` if valid, or an error string if invalid.
 */
function validateReturnStatement(body: string): string | null {
  const trimmed = body.trimEnd();

  if (trimmed.length === 0) {
    return (
      "Script body is empty. The last statement must be `return <expression>;` so " +
      "the result can be returned as JSON."
    );
  }

  if (!endsWithReturn(trimmed)) {
    return (
      "Script must end with a `return <expression>;` statement. " +
      "Add `return JSON.stringify(...);` or `return <value>;` as the final statement."
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Args injection
// ---------------------------------------------------------------------------

/**
 * Compose the OmniJS body to be passed to `runOmniJSWrapped`.
 *
 * The `args` object is double-stringified so it is safely embedded as a JS
 * string literal:
 *   - Inner `JSON.stringify(args)` produces the JSON text, e.g. `{"foo":1}`
 *   - Outer `JSON.stringify(...)` wraps that text as a JS string literal,
 *     e.g. `"{\"foo\":1}"` — safe against any key/value content.
 *
 * The user's script body is then appended after the injected `const args` line.
 */
function composeBody(
  scriptBody: string,
  args: Record<string, unknown> | undefined
): string {
  const argsJson = JSON.stringify(args ?? {});
  // Double-stringify: the outer stringify produces a JS string literal that,
  // when parsed by JSON.parse at runtime, yields the original args object.
  const argsLiteral = JSON.stringify(argsJson);
  const argsPrefix = `const args = JSON.parse(${argsLiteral});`;
  return `${argsPrefix}\n${scriptBody}`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Evaluate arbitrary OmniJS source against the user's OmniFocus database.
 *
 * @param input - Validated input (one of `script` / `file` must be set).
 * @returns A `CliOutput` whose `data` is the JSON-decoded return value of the
 *          script.  The type is `unknown` because the user wrote arbitrary code.
 *
 * @public
 */
export async function evaluateScript(
  input: EvaluateScriptInput
): Promise<CliOutput<EvaluateScriptResult>> {
  // Validate mutual exclusion of script / file.
  const hasScript = input.script !== undefined;
  const hasFile = input.file !== undefined;

  if (hasScript && hasFile) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "Provide either `script` (inline source) or `file` (path), not both."
      )
    );
  }

  if (!hasScript && !hasFile) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "Provide either `script` (inline OmniJS source) or `file` (path to a script file)."
      )
    );
  }

  // Resolve script body from inline source or file.
  let body: string;

  if (input.file !== undefined) {
    try {
      body = await readFile(input.file, "utf-8");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown file read error";
      return failure(
        createError(
          ErrorCode.VALIDATION_ERROR,
          `Cannot read script file "${input.file}": ${message}`
        )
      );
    }
  } else if (input.script !== undefined) {
    body = input.script;
  } else {
    // This branch is unreachable: the mutual-exclusion check above either
    // returns a failure or guarantees one of file/script is defined.
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        "Internal error: no script body resolved"
      )
    );
  }

  // Enforce 64 KB byte cap on the resolved body (covers files read from disk
  // and emoji-heavy inline scripts that would exceed 64 KB despite having
  // fewer than MAX_SCRIPT_BYTES UTF-16 code units).
  const byteLength = Buffer.byteLength(body, "utf-8");
  if (byteLength > MAX_SCRIPT_BYTES) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        `Script must be ${String(MAX_SCRIPT_BYTES / 1024)} KB or less (got ${String(Math.ceil(byteLength / 1024))} KB)`
      )
    );
  }

  // Validate that the script ends with a return statement.
  const returnError = validateReturnStatement(body);
  if (returnError !== null) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, returnError));
  }

  // Compose the full OmniJS body with injected args.
  const composedBody = composeBody(body, input.args);

  // Execute via the wrapped runner (handles try/catch and JSON decoding).
  const result = await runOmniJSWrapped<EvaluateScriptResult>(composedBody);

  if (!result.success) {
    return failure(
      result.error ??
        createError(
          ErrorCode.SCRIPT_ERROR,
          "OmniJS script execution failed with no error details"
        )
    );
  }

  return success(result.data);
}

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

/**
 * Centralized descriptor for the `eval` command.
 *
 * Drives the CLI subcommand `ofocus eval` and the MCP tool `omnifocus_eval`.
 *
 * ## Agent guidance
 *
 * This tool is an **escape hatch for edge cases**. Before reaching for it,
 * agents should prefer the deterministic query commands (`tasks`, `projects`,
 * `folders`, `tags`, `forecast`, `search`, `deferred`, and their filter /
 * sort / projection flags). Those commands cover the vast majority of
 * read and write operations with no scripting required.
 *
 * Use `omnifocus_eval` only when no combination of flags on the existing
 * commands covers the need. When `eval` is genuinely necessary, narrate the
 * intent in plain language first, then show the script — the user should be
 * able to read the explanation and verify it matches the code before it runs.
 *
 * **Security note**: The script runs unsandboxed in the user's OmniFocus and
 * can mutate any task, project, folder, tag, or perspective. Treat this like
 * running shell code on the user's machine.
 *
 * @public
 */
export const evaluateScriptDescriptor = defineCommand({
  name: "evaluateScript",
  cliName: "eval",
  mcpName: "omnifocus_eval",
  description: plain`Evaluate arbitrary OmniJS against the user's OmniFocus database. Last-resort tool.

Before using this tool, prefer the declarative commands (tasks, projects, folders, tags, forecast, search, deferred, etc.) with --filter, --sort, --fields, --group-by, --count — they cover the vast majority of queries with no scripting required.

If eval is genuinely necessary, narrate the intent in plain language first, then show the script — the user should be able to read the explanation and verify it matches the code before running it.

The script runs unsandboxed in the user's OmniFocus and can mutate any task, project, folder, tag, or perspective. Treat this like running shell code on the user's machine.

Scripts must end with a return <expression>; statement and are capped at 64 KB. The return value must be JSON-serializable. Errors from OmniJS are surfaced verbatim.`,
  cliPositional: ["script"],
  inputSchema,
  handler: async (input) =>
    evaluateScript({
      script: input.script,
      file: input.file,
      args: input.args,
    }),
});

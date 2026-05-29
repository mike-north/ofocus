/**
 * UAT subprocess tests for the --format CLI flag.
 *
 * These tests spawn the CLI binary as a child process (the real user-facing
 * surface), assert on exit codes and stdout, and verify that the TOON and JSON
 * output formats meet their structural invariants.
 *
 * The tests use `list-commands` because it is purely local (no OmniFocus side
 * effects or network calls) and always succeeds deterministically.
 *
 * @see https://toonformat.dev/ TOON format specification
 * @see https://www.npmjs.com/package/@toon-format/toon @toon-format/toon package
 *
 * Prerequisite: run `pnpm build` before running these tests. The tests skip
 * automatically when the built binary is absent.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { decode } from "@toon-format/toon";

// Resolve the path to the built CLI entry point relative to this test file.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLI_PATH = resolve(__dirname, "../../dist/index.js");

const cliAvailable = existsSync(CLI_PATH);

/**
 * Spawn the CLI with the given args and return stdout, stderr, and exit code.
 */
function runCli(args: string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf-8",
    timeout: 10_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

describe.skipIf(!cliAvailable)(
  "CLI --format flag (UAT — requires built binary)",
  () => {
    // ------------------------------------------------------------------
    // --format toon
    // ------------------------------------------------------------------

    it("list-commands --format toon exits with code 0", () => {
      const { exitCode } = runCli(["list-commands", "--format", "toon"]);
      expect(exitCode).toBe(0);
    });

    it("list-commands --format toon produces valid TOON output", () => {
      // The output must be parseable by the @toon-format/toon decoder.
      // @see https://toonformat.dev/ §3 "Arrays"
      const { stdout } = runCli(["list-commands", "--format", "toon"]);
      expect(stdout.trim()).not.toBe("");
      // decode() throws ToonDecodeError if the input is invalid TOON
      expect(() => decode(stdout)).not.toThrow();
    });

    it("list-commands --format toon output starts with 'success: true'", () => {
      // TOON object output: top-level key:value lines, not JSON braces.
      // @see https://toonformat.dev/ §2 "Objects"
      const { stdout } = runCli(["list-commands", "--format", "toon"]);
      expect(stdout.trim()).toMatch(/^success: true/);
    });

    it("list-commands --format toon contains TOON array header for commands", () => {
      // list-commands returns a uniform array of CommandInfo objects.
      // TOON should use the compact `data.commands[N]{...}:` form.
      // @see https://toonformat.dev/ §3.1 "Tabular arrays"
      const { stdout } = runCli(["list-commands", "--format", "toon"]);
      // The array header pattern: fieldname[N]{...}: or fieldname[N]:
      expect(stdout).toMatch(/commands\[\d+\]/);
    });

    it("list-commands --format toon output is smaller than --format json for the same data", () => {
      // Verify the token-efficiency claim for the list-commands output.
      // @see https://toonformat.dev/ — ~40% smaller for uniform arrays
      const toonOut = runCli(["list-commands", "--format", "toon"]).stdout;
      const jsonOut = runCli(["list-commands", "--format", "json"]).stdout;

      expect(toonOut.length).toBeGreaterThan(0);
      expect(jsonOut.length).toBeGreaterThan(0);
      expect(toonOut.length).toBeLessThan(jsonOut.length);
    });

    // ------------------------------------------------------------------
    // --format json (default / explicit)
    // ------------------------------------------------------------------

    it("list-commands --format json exits with code 0", () => {
      const { exitCode } = runCli(["list-commands", "--format", "json"]);
      expect(exitCode).toBe(0);
    });

    it("list-commands --format json produces valid JSON", () => {
      const { stdout } = runCli(["list-commands", "--format", "json"]);
      expect(() => JSON.parse(stdout)).not.toThrow();
      const parsed = JSON.parse(stdout) as { success: boolean };
      expect(parsed.success).toBe(true);
    });

    it("list-commands (no --format flag) defaults to JSON", () => {
      // Default format is JSON when neither --format nor --human is specified.
      const { stdout, exitCode } = runCli(["list-commands"]);
      expect(exitCode).toBe(0);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    // ------------------------------------------------------------------
    // --format <invalid>
    // ------------------------------------------------------------------

    it("list-commands --format invalid exits with code 1", () => {
      const { exitCode } = runCli(["list-commands", "--format", "invalid"]);
      expect(exitCode).toBe(1);
    });

    it("list-commands --format invalid prints a VALIDATION_ERROR JSON envelope", () => {
      const { stdout } = runCli(["list-commands", "--format", "invalid"]);
      // Error is rendered as JSON (safe fallback) even for unrecognised formats
      const parsed = JSON.parse(stdout) as {
        success: boolean;
        error: { code: string; message: string };
      };
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
      expect(parsed.error.message).toContain("invalid");
    });

    it("list-commands --format invalid does not print command results", () => {
      // Only the error envelope should appear — not a second output block
      const { stdout } = runCli(["list-commands", "--format", "invalid"]);
      // Valid JSON parses cleanly: exactly one JSON object
      const parsed = JSON.parse(stdout) as { success: boolean };
      expect(parsed.success).toBe(false);
    });

    // ------------------------------------------------------------------
    // --human overrides --format
    // ------------------------------------------------------------------

    it("list-commands --human overrides any --format value", () => {
      // --human takes precedence over --format; output is human-readable.
      const { stdout: toonOut, exitCode: toonCode } = runCli([
        "list-commands",
        "--human",
        "--format",
        "toon",
      ]);
      const { stdout: humanOnly, exitCode: humanCode } = runCli([
        "list-commands",
        "--human",
      ]);
      // Both should succeed
      expect(toonCode).toBe(0);
      expect(humanCode).toBe(0);
      // --human --format toon should produce the same output as --human alone
      // (format is ignored when --human is set)
      expect(toonOut).toBe(humanOnly);
      // The human output is NOT the TOON envelope (which starts with "success:")
      expect(toonOut.trim()).not.toMatch(/^success:/);
    });
  }
);

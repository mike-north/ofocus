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
 * Agent-detection environment markers consulted by `is-agentic-tui`, plus
 * `OFOCUS_FORMAT`. Output-format resolution keys off these, so a UAT that
 * asserts a specific default MUST control them — otherwise the result depends
 * on whether the suite runs inside an agentic harness (CLAUDECODE=1, etc.) or a
 * plain CI shell, making the "default format" assertions non-deterministic.
 *
 * @see https://github.com/mike-north/is-agentic-tui — detection signals
 */
const AGENT_ENV_MARKERS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_PATH",
  "CURSOR_AGENT",
  "CURSOR_INVOKED_AS",
  "GEMINI_CLI",
  "AIDER",
  "OFOCUS_FORMAT",
] as const;

/**
 * A deterministic base environment: the real `process.env` with every
 * agent-detection marker and `OFOCUS_FORMAT` removed. Spawning the CLI with
 * this env makes it behave as a non-agent caller by default, regardless of
 * where the suite runs. Individual cases re-introduce specific markers via the
 * `env` override to exercise the agentic code paths on purpose.
 */
function baseDeterministicEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const marker of AGENT_ENV_MARKERS) {
    delete env[marker];
  }
  return env;
}

/**
 * Spawn the CLI with the given args and return stdout, stderr, and exit code.
 *
 * The child always starts from {@link baseDeterministicEnv} (no agent markers,
 * no `OFOCUS_FORMAT`); pass `env` to layer specific overrides on top — e.g.
 * `{ CLAUDECODE: "1" }` to simulate an agentic harness, or
 * `{ OFOCUS_FORMAT: "json" }` to exercise the env override.
 */
function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = {}
): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf-8",
    timeout: 10_000,
    env: { ...baseDeterministicEnv(), ...env },
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

    it("list-commands (no --format flag, non-agent env) defaults to JSON", () => {
      // Spec: for a non-agent caller with no --format/--human, the default is
      // JSON. `runCli` strips all agent-detection markers, so this asserts the
      // true non-agent default regardless of where the suite runs (it used to
      // flake under an agentic harness, where the real default is TOON).
      // @see docs/specs/2026-06-06-pagination-list-only-design.md (format precedence)
      const { stdout, exitCode } = runCli(["list-commands"]);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout) as { success: boolean };
      expect(parsed.success).toBe(true);
    });

    // ------------------------------------------------------------------
    // Agent-detected default (the resolution path introduced in #85)
    // ------------------------------------------------------------------
    //
    // Precedence under test (highest first): --human > --format > --json >
    // $OFOCUS_FORMAT > agent detection. These cases drive the agent path
    // deterministically by injecting CLAUDECODE=1 into the child env.

    it("list-commands under an agent (CLAUDECODE=1), no flags → TOON", () => {
      // Spec: machine output defaults to token-efficient TOON when an AI agent
      // is detected. TOON object output is top-level `key: value` lines, not a
      // JSON object — so stdout starts with `success:`, never `{`.
      const { stdout, exitCode } = runCli(["list-commands"], {
        CLAUDECODE: "1",
      });
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^success: true/);
      expect(stdout.trim().startsWith("{")).toBe(false);
      // And it must be valid TOON.
      expect(() => decode(stdout)).not.toThrow();
    });

    it("list-commands under an agent + --json → JSON (explicit flag wins)", () => {
      // Spec: an explicit --json beats agent detection.
      const { stdout, exitCode } = runCli(["list-commands", "--json"], {
        CLAUDECODE: "1",
      });
      expect(exitCode).toBe(0);
      expect(stdout.trim().startsWith("{")).toBe(true);
      const parsed = JSON.parse(stdout) as { success: boolean };
      expect(parsed.success).toBe(true);
    });

    it("list-commands under an agent + $OFOCUS_FORMAT=json → JSON (env wins over detection)", () => {
      // Spec: $OFOCUS_FORMAT=json|toon overrides agent detection (the escape
      // hatch for scripts/CI running inside an agent environment).
      const { stdout, exitCode } = runCli(["list-commands"], {
        CLAUDECODE: "1",
        OFOCUS_FORMAT: "json",
      });
      expect(exitCode).toBe(0);
      expect(stdout.trim().startsWith("{")).toBe(true);
      const parsed = JSON.parse(stdout) as { success: boolean };
      expect(parsed.success).toBe(true);
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

    // ------------------------------------------------------------------
    // --format ids — raw newline-delimited id list (issue #83 §3)
    // ------------------------------------------------------------------
    //
    // The raw id output is only emittable for an `--ids-only` payload, which
    // requires a live OmniFocus database — so these UATs cover the parts of the
    // contract that are deterministic without OmniFocus: that `ids` is accepted
    // as a valid --format value, that it errors cleanly (not "unknown format")
    // when the payload is not an id list, and that --human still wins over it.
    // The happy-path raw-line emission is covered by the outputIds unit tests.

    it("--format ids is a recognised value (not an 'unknown format' error)", () => {
      // list-commands returns a non-ids payload, so --format ids must report a
      // payload-mismatch error — NOT the "Unknown --format value" error that an
      // unrecognised format would produce.
      const { stdout } = runCli(["list-commands", "--format", "ids"]);
      const parsed = JSON.parse(stdout) as {
        success: boolean;
        error: { code: string; message: string };
      };
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
      // The message is the payload-mismatch message, mentioning --ids-only.
      expect(parsed.error.message).toContain("--ids-only");
      expect(parsed.error.message).not.toContain("Unknown --format value");
    });

    it("--format ids on a non-ids payload exits with code 1", () => {
      const { exitCode } = runCli(["list-commands", "--format", "ids"]);
      expect(exitCode).toBe(1);
    });

    it("--human overrides --format ids", () => {
      // Precedence: --human wins over --format ids (just like over toon/json).
      const { stdout: humanWithIds, exitCode } = runCli([
        "list-commands",
        "--human",
        "--format",
        "ids",
      ]);
      const { stdout: humanOnly } = runCli(["list-commands", "--human"]);
      expect(exitCode).toBe(0);
      expect(humanWithIds).toBe(humanOnly);
    });
  }
);

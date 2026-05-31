/**
 * UAT: drive the four temporal CLI commands as a user/script would.
 * Uses a temp OFOCUS_STATE_DIR so no real ~/.ofocus is touched. If the CLI
 * dist is not built, this suite SKIPS (keeps `pnpm test` green pre-build).
 * Live tests additionally require the OmniFocus app and are skipped where
 * absent (CI).
 *
 * Commands under test:
 *   - `next-occurrences <taskId> [--count N] [--from <date>]`
 *   - `occurrences [--days N]`
 *   - `today`
 *   - `this-week`
 *
 * @see packages/productivity/src/commands/next-occurrences.ts
 * @see packages/productivity/src/commands/occurrences.ts
 * @see packages/productivity/src/commands/digests.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, "../../../cli/dist/index.js");
const cliBuilt = existsSync(CLI);
const omniFocusPresent = existsSync("/Applications/OmniFocus.app");

// Env vars that `is-agentic-tui` inspects to detect an agentic TUI (Claude Code,
// Cursor, Codex, etc). When this suite runs under such a tool, the CLI's
// `--help` formatter returns generic agent-mode text instead of the real
// command help. Clearing these vars for the `--help` invocation forces the
// human help output so we can assert on the documented flags. Command
// EXECUTION (JSON output) is unaffected by agent detection, so the live tests
// keep the inherited env.
const AGENTIC_ENV_VARS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_PATH",
  "CURSOR_AGENT",
  "CURSOR_INVOKED_AS",
  "GEMINI_CLI",
  "AIDER",
  "OR_APP_NAME",
  "OR_SITE_URL",
  "CODEX_SANDBOX",
  "CODEX_THREAD_ID",
  "CLINE_ACTIVE",
  "Q_TERM",
  "QTERM_SESSION_ID",
  "OPENCODE",
] as const;

function nonAgenticEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of AGENTIC_ENV_VARS) {
    delete env[key];
  }
  return env;
}

let stateDir = "";
beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "ofocus-uat-"));
});
afterEach(() => {
  if (stateDir) rmSync(stateDir, { recursive: true, force: true });
});

/**
 * Run the CLI with the given args plus `--format json`, using a temp
 * OFOCUS_STATE_DIR. Returns the parsed stdout and the exit code.
 */
function run(args: string[]): { stdout: string; code: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args, "--format", "json"], {
      env: { ...process.env, OFOCUS_STATE_DIR: stateDir },
      encoding: "utf8",
    });
    return { stdout, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", code: err.status ?? 1 };
  }
}

// ---------------------------------------------------------------------------
// Output envelope shapes (shape-only — live data values vary run-to-run).
// ---------------------------------------------------------------------------

interface Envelope<T> {
  success: boolean;
  data: T;
  error: unknown;
}

interface TodayData {
  date: string;
  counts: { overdue: number; dueToday: number; flagged: number };
  overdue: unknown[];
  dueToday: unknown[];
  flagged: unknown[];
}

interface OccurrenceItem {
  taskId: string;
  name: string;
  occurrenceDate: string;
  dueIn: unknown;
}

interface OccurrencesData {
  window: { from: string; until: string; days: number };
  count: number;
  occurrences: OccurrenceItem[];
}

interface WeekData {
  from: string;
  until: string;
  days: unknown[];
  count: number;
}

interface NextOccurrencesData {
  taskId: string;
  name: string;
  repeating: boolean;
  occurrences: string[];
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const suite = cliBuilt ? describe : describe.skip;

suite("ofocus temporal commands (UAT)", () => {
  // -------------------------------------------------------------------------
  // --help: assert documented flags without live OmniFocus (always runs when
  // the CLI is built). Agentic env vars are stripped to force human-mode help.
  // -------------------------------------------------------------------------
  it("next-occurrences --help documents --count and --from", () => {
    const stdout = execFileSync("node", [CLI, "next-occurrences", "--help"], {
      env: nonAgenticEnv(),
      encoding: "utf8",
    });
    expect(stdout).toMatch(/--count/);
    expect(stdout).toMatch(/--from/);
  });

  // -------------------------------------------------------------------------
  // Live tests — require OmniFocus.app.
  // -------------------------------------------------------------------------

  (omniFocusPresent ? it : it.skip)(
    "today → envelope shape with numeric counts and YYYY-MM-DD date",
    () => {
      const result = run(["today"]);
      expect(result.code).toBe(0);

      const envelope = JSON.parse(result.stdout) as Envelope<TodayData>;
      // Top-level envelope must not indicate failure.
      expect(envelope.success).not.toBe(false);

      const { data } = envelope;
      // date must be a calendar day string.
      expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // counts must have numeric fields (values vary; shape is the contract).
      expect(typeof data.counts.overdue).toBe("number");
      expect(typeof data.counts.dueToday).toBe("number");
      expect(typeof data.counts.flagged).toBe("number");
    },
  );

  (omniFocusPresent ? it : it.skip)(
    "occurrences --days 30 → ascending array with count === occurrences.length",
    () => {
      const result = run(["occurrences", "--days", "30"]);
      expect(result.code).toBe(0);

      const envelope = JSON.parse(result.stdout) as Envelope<OccurrencesData>;
      const { data } = envelope;

      // occurrences must be an array.
      expect(Array.isArray(data.occurrences)).toBe(true);

      // count must equal array length (spec contract).
      expect(data.count).toBe(data.occurrences.length);

      // occurrences must be ascending by occurrenceDate (lexical ISO compare is
      // correct for canonical UTC instants).
      const dates = data.occurrences.map((o) => o.occurrenceDate);
      const sorted = [...dates].sort((a, b) => a.localeCompare(b));
      expect(dates).toEqual(sorted);
    },
  );

  (omniFocusPresent ? it : it.skip)(
    "this-week → data.days is an array with ISO from/until strings",
    () => {
      const result = run(["this-week"]);
      expect(result.code).toBe(0);

      const envelope = JSON.parse(result.stdout) as Envelope<WeekData>;
      const { data } = envelope;

      // days must be an array.
      expect(Array.isArray(data.days)).toBe(true);

      // from and until must be ISO 8601 strings (rough check: contain T and Z).
      expect(data.from).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(data.until).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    },
  );

  (omniFocusPresent ? it : it.skip)(
    "next-occurrences on a real repeating task → repeating true, ascending ISO occurrences",
    () => {
      // Derive a real repeating task id from occurrences --days 365.
      const scanResult = run(["occurrences", "--days", "365"]);
      expect(scanResult.code).toBe(0);

      const scanEnvelope = JSON.parse(
        scanResult.stdout,
      ) as Envelope<OccurrencesData>;
      const firstOccurrence = scanEnvelope.data.occurrences[0];

      // If no repeating tasks exist in the database, there is nothing to assert
      // against. Return early — this is not a failure of the command.
      if (firstOccurrence === undefined) {
        return;
      }

      const { taskId } = firstOccurrence;

      // Run next-occurrences for the discovered task.
      const result = run(["next-occurrences", taskId, "--count", "3"]);
      expect(result.code).toBe(0);

      const envelope = JSON.parse(
        result.stdout,
      ) as Envelope<NextOccurrencesData>;
      const { data } = envelope;

      // The task must be repeating (we sourced it from the repeating-task scan).
      expect(data.repeating).toBe(true);

      // occurrences must be a non-empty array of ISO strings.
      expect(Array.isArray(data.occurrences)).toBe(true);
      expect(data.occurrences.length).toBeGreaterThan(0);
      for (const occ of data.occurrences) {
        expect(typeof occ).toBe("string");
        expect(occ).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }

      // occurrences must be in ascending order.
      const sorted = [...data.occurrences].sort((a, b) =>
        a.localeCompare(b),
      );
      expect(data.occurrences).toEqual(sorted);
    },
  );
});

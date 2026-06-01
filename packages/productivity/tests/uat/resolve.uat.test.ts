/**
 * UAT: drive the `resolve` CLI command as a user/script would.
 * Uses a temp OFOCUS_STATE_DIR so no real ~/.ofocus is touched. If the CLI
 * dist is not built, this suite SKIPS (keeps `pnpm test` green pre-build).
 * Live tests additionally require the OmniFocus app and are skipped where
 * absent (CI).
 *
 * Command under test:
 *   `ofocus resolve <query> [--kind project|task|tag|folder|temporal-anchor|any] [--limit N]`
 *
 * Output envelope (--format json):
 *   { success, data, error }
 *   where `data` is the disambiguation contract:
 *     { status: "resolved"|"ambiguous"|"none", ... }
 *
 * Tests assert on shape/contract only — live data values vary run-to-run.
 * Live fragments are derived dynamically from other CLI commands so no
 * machine-specific strings are hardcoded.
 *
 * @see packages/productivity/src/commands/resolve.ts
 * @see packages/productivity/src/resolve/types.ts
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

interface ResolveCandidate {
  id: string;
  name: string;
  kind: string;
  score: number;
}

interface ResolvedAnchor extends ResolveCandidate {
  nextOccurrence: string | null;
}

type DisambiguationResult<T extends ResolveCandidate> =
  | { status: "resolved"; resolved: T; confidence: "high" }
  | { status: "ambiguous"; candidates: T[] }
  | { status: "none"; suggestions: T[]; note?: string };

interface ProjectItem {
  id: string;
  name: string;
  status: string;
  kind?: string;
}

interface ProjectsData {
  kind: string;
  items: ProjectItem[];
}

interface OccurrenceItem {
  taskId: string;
  name: string;
  occurrenceDate: string;
}

interface OccurrencesData {
  window: { from: string; until: string; days: number };
  count: number;
  occurrences: OccurrenceItem[];
}

// ---------------------------------------------------------------------------
// Suite — skipped entirely when CLI dist is not built
// ---------------------------------------------------------------------------

const suite = cliBuilt ? describe : describe.skip;

suite("ofocus resolve (UAT)", () => {
  // -------------------------------------------------------------------------
  // --help: assert documented flags without live OmniFocus (always runs when
  // the CLI is built). Agentic env vars are stripped to force human-mode help.
  // -------------------------------------------------------------------------
  it("resolve --help documents --kind and --limit", () => {
    const stdout = execFileSync("node", [CLI, "resolve", "--help"], {
      env: nonAgenticEnv(),
      encoding: "utf8",
    });
    expect(stdout).toMatch(/--kind/);
    expect(stdout).toMatch(/--limit/);
  });

  // -------------------------------------------------------------------------
  // Live tests — require OmniFocus.app
  // -------------------------------------------------------------------------

  (omniFocusPresent ? it : it.skip)(
    "resolve with a real project-name fragment → status is resolved, ambiguous, or none; resolved shape has id/name/kind",
    () => {
      // Derive a real project name fragment dynamically from the projects list.
      const projectsResult = run(["projects"]);
      expect(projectsResult.code).toBe(0);

      const projectsEnvelope = JSON.parse(
        projectsResult.stdout,
      ) as Envelope<ProjectsData>;
      const items = projectsEnvelope.data.items;

      // If the database has no projects, there is nothing to assert. Return
      // early — this is not a failure of the resolve command.
      if (items.length === 0) {
        return;
      }

      const firstProject = items[0];
      // Use the first word of the first project name as a fuzzy fragment.
      const fragment = firstProject.name.split(/\s+/)[0] ?? firstProject.name;

      const result = run(["resolve", fragment, "--kind", "project"]);
      expect(result.code).toBe(0);

      const envelope = JSON.parse(
        result.stdout,
      ) as Envelope<DisambiguationResult<ResolveCandidate>>;
      const { data } = envelope;

      // Top-level envelope must not indicate failure.
      expect(envelope.success).not.toBe(false);

      // Status must be one of the three known values.
      expect(["resolved", "ambiguous", "none"]).toContain(data.status);

      if (data.status === "resolved") {
        // Resolved shape must have id, name, and kind === "project".
        expect(typeof data.resolved.id).toBe("string");
        expect(data.resolved.id.length).toBeGreaterThan(0);
        expect(typeof data.resolved.name).toBe("string");
        expect(data.resolved.kind).toBe("project");
      } else if (data.status === "ambiguous") {
        // Each candidate must have id, name, kind, and a numeric score.
        expect(Array.isArray(data.candidates)).toBe(true);
        for (const candidate of data.candidates) {
          expect(typeof candidate.id).toBe("string");
          expect(typeof candidate.name).toBe("string");
          expect(typeof candidate.kind).toBe("string");
          expect(typeof candidate.score).toBe("number");
        }
      }
      // "none" has no shape constraints beyond the status itself.
    },
    30000,
  );

  (omniFocusPresent ? it : it.skip)(
    "resolve with a nonexistent query → status none",
    () => {
      const result = run([
        "resolve",
        "zzzqqxnonexistent",
        "--kind",
        "project",
      ]);
      expect(result.code).toBe(0);

      const envelope = JSON.parse(
        result.stdout,
      ) as Envelope<DisambiguationResult<ResolveCandidate>>;

      expect(envelope.success).not.toBe(false);
      expect(envelope.data.status).toBe("none");
    },
    30000,
  );

  (omniFocusPresent ? it : it.skip)(
    "resolve --kind temporal-anchor with a real repeating-task fragment → status is resolved/ambiguous/none; resolved shape has id/name/nextOccurrence",
    () => {
      // Derive a real repeating-task name fragment from occurrences --days 365.
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

      // Use the first word of the first occurrence's name as a fuzzy fragment.
      const fragment =
        firstOccurrence.name.split(/\s+/)[0] ?? firstOccurrence.name;

      const result = run(["resolve", fragment, "--kind", "temporal-anchor"]);
      expect(result.code).toBe(0);

      const envelope = JSON.parse(
        result.stdout,
      ) as Envelope<DisambiguationResult<ResolvedAnchor>>;
      const { data } = envelope;

      // Top-level envelope must not indicate failure.
      expect(envelope.success).not.toBe(false);

      // Status must be one of the three known values.
      expect(["resolved", "ambiguous", "none"]).toContain(data.status);

      if (data.status === "resolved") {
        // Resolved shape must have id, name, and a nextOccurrence that is
        // either a string (ISO date) or null.
        expect(typeof data.resolved.id).toBe("string");
        expect(data.resolved.id.length).toBeGreaterThan(0);
        expect(typeof data.resolved.name).toBe("string");
        expect(
          data.resolved.nextOccurrence === null ||
            typeof data.resolved.nextOccurrence === "string",
        ).toBe(true);
      }
      // ambiguous/none shapes are also valid outcomes for a single-word fragment.
    },
    30000,
  );
});

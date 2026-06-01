/**
 * UAT: drive the real `ofocus changes` CLI as a user/script would.
 * Uses a temp OFOCUS_STATE_DIR so no real ~/.ofocus is touched. If the CLI dist
 * is not built, this suite SKIPS (keeps `pnpm test` green pre-build). The live
 * scan additionally requires the OmniFocus app and is skipped where absent (CI).
 *
 * @see ../../../../docs/superpowers/specs/2026-05-30-ofocus-changes-primitive-design.md
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
// human help output so we can assert on the documented read modes. Command
// EXECUTION (JSON output) is unaffected by agent detection, so the live test
// keeps the inherited env.
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

// Discovered JSON shape (Step 1): the CLI emits the standard
// `{ success, data, error }` envelope, so the read-mode flags live at
// `data.baselined` / `data.notModified`.
interface ChangesEnvelope {
  success: boolean;
  data: {
    baselined: boolean;
    notModified: boolean;
  };
  error: unknown;
}

const suite = cliBuilt ? describe : describe.skip;

suite("ofocus changes (UAT)", () => {
  it("--help documents the read modes", () => {
    const stdout = execFileSync("node", [CLI, "changes", "--help"], {
      env: nonAgenticEnv(),
      encoding: "utf8",
    });
    expect(stdout).toMatch(/--watch/);
    expect(stdout).toMatch(/--fresh/);
    expect(stdout).toMatch(/--pending/);
  });

  (omniFocusPresent ? it : it.skip)(
    "--fresh baselines on first run then reports notModified",
    () => {
      // Spec: a brand-new watch's first `--fresh` baselines the watch.
      const first = run(["changes", "--watch", "uat", "--fresh"]);
      expect(first.code).toBe(0);
      const p1 = JSON.parse(first.stdout) as ChangesEnvelope;
      expect(p1.success).toBe(true);
      expect(p1.data.baselined).toBe(true);

      // Spec: a second immediate `--fresh` with nothing changed is notModified.
      const second = run(["changes", "--watch", "uat", "--fresh"]);
      expect(second.code).toBe(0);
      const p2 = JSON.parse(second.stdout) as ChangesEnvelope;
      expect(p2.success).toBe(true);
      expect(p2.data.notModified).toBe(true);
    },
    // Live OmniFocus scans take ~4-5s and can exceed vitest's default 5s
    // per-test timeout under concurrent JXA load; allow generous headroom.
    30_000,
  );
});

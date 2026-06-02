/**
 * UAT: drive the four calendar-conversance CLI commands as a user/script would.
 * Uses a temp OFOCUS_STATE_DIR so no real ~/.ofocus is touched. If the CLI dist
 * is not built, this suite SKIPS (keeps `pnpm test` green pre-build). The live
 * round-trip additionally requires the OmniFocus app and is skipped where absent
 * (CI).
 *
 * Commands under test:
 *   - `link <taskId> --type <prep-for|time-block> --event '<json>'`
 *   - `links --event-id <id>`
 *   - `readiness --event-id <id>`
 *   - `unlink <taskId> --event-id <id> --type <type>`
 *
 * @see packages/productivity/src/commands/link.ts
 * @see packages/productivity/src/commands/readiness.ts
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, "../../../cli/dist/index.js");
const cliBuilt = existsSync(CLI);
const omniFocusPresent = existsSync("/Applications/OmniFocus.app");

let stateDir = "";
beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "ofocus-uat-links-"));
});
afterEach(() => {
  if (stateDir) rmSync(stateDir, { recursive: true, force: true });
});

/**
 * Run the CLI with the given args plus `--format json`, using a temp
 * OFOCUS_STATE_DIR. Returns the parsed stdout and exit code.
 */
function run(args: string[]): { stdout: string; code: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args, "--format", "json"], {
      env: { ...process.env, OFOCUS_STATE_DIR: stateDir },
      encoding: "utf8",
      timeout: 30000,
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

interface TaskListData {
  kind: string;
  items: Array<{ id: string; name: string }>;
}

interface LinkData {
  link: {
    taskId: string;
    linkType: string;
    event: {
      eventId: string;
      title: string;
      start: string;
      end: string;
    };
  };
  taskVerified: boolean;
  refresh: unknown;
}

interface ListedLink {
  link: {
    taskId: string;
    linkType: string;
    event: { eventId: string };
  };
  refresh: unknown;
}

interface LinksData {
  links: ListedLink[];
  pruned: number;
}

interface ReadinessData {
  eventId: string;
  verdict: string;
  done: number;
  total: number;
  tasks: unknown[];
  refresh: unknown;
}

interface UnlinkData {
  removed: boolean;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const suite = cliBuilt ? describe : describe.skip;

suite("ofocus calendar-links commands (UAT)", () => {
  // Discover a real incomplete task id once per suite (only when both CLI and
  // OmniFocus are present). Placed in beforeAll so it runs once regardless of
  // how many tests run.
  let taskId: string | null = null;

  beforeAll(() => {
    if (!cliBuilt || !omniFocusPresent) return;
    // `--not-completed` maps to the `notCompleted` boolean flag in the tasks
    // command inputSchema — camelCase schema fields become kebab-case CLI flags.
    const scanResult = run([
      "tasks",
      "--not-completed",
      "--limit",
      "1",
    ]);
    if (scanResult.code !== 0) return;
    let parsed: Envelope<TaskListData>;
    try {
      parsed = JSON.parse(scanResult.stdout) as Envelope<TaskListData>;
    } catch {
      return;
    }
    if (!parsed.success) return;
    const first = parsed.data?.items?.[0];
    if (first !== undefined) {
      taskId = first.id;
    }
  });

  // -------------------------------------------------------------------------
  // Live round-trip test — requires OmniFocus.app.
  // -------------------------------------------------------------------------

  (cliBuilt && omniFocusPresent ? it : it.skip)(
    "link → links → readiness → unlink round-trip against a synthetic event",
    () => {
      // No-op gracefully when no incomplete task was found (empty database).
      if (taskId === null) return;

      const EVENT_ID = "uat-evt-1";
      const EVENT_JSON = JSON.stringify({
        eventId: EVENT_ID,
        title: "UAT Test Event",
        start: "2026-06-10T14:00:00.000Z",
        end: "2026-06-10T15:00:00.000Z",
        source: "uat",
      });

      // ── 1. link ────────────────────────────────────────────────────────────
      const linkResult = run([
        "link",
        taskId,
        "--type",
        "prep-for",
        "--event",
        EVENT_JSON,
      ]);
      expect(linkResult.code, "link should exit 0").toBe(0);

      let linkEnvelope: Envelope<LinkData>;
      try {
        linkEnvelope = JSON.parse(linkResult.stdout) as Envelope<LinkData>;
      } catch {
        throw new Error(
          `link returned non-JSON stdout: ${linkResult.stdout.slice(0, 200)}`,
        );
      }
      expect(linkEnvelope.success, "link envelope.success should be true").toBe(
        true,
      );
      expect(
        linkEnvelope.data.link.taskId,
        "link.taskId should match the requested task",
      ).toBe(taskId);
      expect(
        linkEnvelope.data.link.linkType,
        "link.linkType should be prep-for",
      ).toBe("prep-for");
      expect(
        linkEnvelope.data.link.event.eventId,
        "link.event.eventId should match",
      ).toBe(EVENT_ID);

      // ── 2. links --event-id ────────────────────────────────────────────────
      const linksResult = run(["links", "--event-id", EVENT_ID]);
      expect(linksResult.code, "links should exit 0").toBe(0);

      let linksEnvelope: Envelope<LinksData>;
      try {
        linksEnvelope = JSON.parse(linksResult.stdout) as Envelope<LinksData>;
      } catch {
        throw new Error(
          `links returned non-JSON stdout: ${linksResult.stdout.slice(0, 200)}`,
        );
      }
      expect(
        linksEnvelope.success,
        "links envelope.success should be true",
      ).toBe(true);
      expect(
        linksEnvelope.data.links.length,
        "links.data.links should have exactly 1 entry",
      ).toBe(1);
      expect(
        linksEnvelope.data.links[0]?.link.taskId,
        "listed link taskId should match",
      ).toBe(taskId);

      // ── 3. readiness --event-id ────────────────────────────────────────────
      const readinessResult = run(["readiness", "--event-id", EVENT_ID]);
      expect(readinessResult.code, "readiness should exit 0").toBe(0);

      let readinessEnvelope: Envelope<ReadinessData>;
      try {
        readinessEnvelope = JSON.parse(
          readinessResult.stdout,
        ) as Envelope<ReadinessData>;
      } catch {
        throw new Error(
          `readiness returned non-JSON stdout: ${readinessResult.stdout.slice(0, 200)}`,
        );
      }
      expect(
        readinessEnvelope.success,
        "readiness envelope.success should be true",
      ).toBe(true);
      expect(
        readinessEnvelope.data.total,
        "readiness.data.total should be 1 (one prep-for link)",
      ).toBe(1);
      expect(
        ["ready", "not-ready", "at-risk"],
        "readiness.data.verdict should be a valid verdict",
      ).toContain(readinessEnvelope.data.verdict);

      // ── 4. unlink ─────────────────────────────────────────────────────────
      const unlinkResult = run([
        "unlink",
        taskId,
        "--event-id",
        EVENT_ID,
        "--type",
        "prep-for",
      ]);
      expect(unlinkResult.code, "unlink should exit 0").toBe(0);

      let unlinkEnvelope: Envelope<UnlinkData>;
      try {
        unlinkEnvelope = JSON.parse(
          unlinkResult.stdout,
        ) as Envelope<UnlinkData>;
      } catch {
        throw new Error(
          `unlink returned non-JSON stdout: ${unlinkResult.stdout.slice(0, 200)}`,
        );
      }
      expect(
        unlinkEnvelope.success,
        "unlink envelope.success should be true",
      ).toBe(true);
      expect(
        unlinkEnvelope.data.removed,
        "unlink.data.removed should be true",
      ).toBe(true);
    },
    30000,
  );
});

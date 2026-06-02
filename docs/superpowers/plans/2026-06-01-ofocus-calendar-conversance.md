# A4b Calendar-Conversance & Task↔Event Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `ofocus` store and reason about task↔calendar-event links (agent-supplied event data only — `ofocus` never reads a calendar), computing meeting readiness, lead-time, and time-block coverage deterministically.

**Architecture:** A new `src/links/` area in `@ofocus/productivity` (L2): pure types, a pluggable `LinkStore` (default local-JSON), pure readiness/coverage computations, and an OmniJS read of task state by id. Four command descriptors (`link`, `unlink`, `links`, `readiness`) wire those together with injected dependencies, surfaced through CLI + MCP + generated docs exactly like A4a's `resolve`.

**Tech Stack:** TypeScript (ESM/NodeNext, strict + `exactOptionalPropertyTypes`), zod, vitest, the `@ofocus/sdk` descriptor/`CliOutput` framework, A2 duration helpers, Node `fs`/`os`/`path` for the file store.

**Spec:** `docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md`

**Branch:** `claude/ofocus-calendar` (already created off `main`; the spec is already committed there).

---

## Conventions every task follows

- **Run commands from the worktree root:** `/Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16`.
- **ESM imports** use `.js` extensions even for `.ts` files (NodeNext).
- **`exactOptionalPropertyTypes`:** never assign `undefined` to an optional property — omit the key instead (spread-conditional: `...(x ? { k: x } : {})`).
- **No `Date.now()` / `new Date()` / `Math.random()` in pure modules** (`src/links/types.ts`, `readiness.ts`) or in tests — inject `now` as an ISO string. `new Date().toISOString()` is allowed only in the descriptor `realDeps()` wiring.
- **Test runner:** `pnpm --filter @ofocus/productivity test` runs all productivity tests; `npx vitest run <path>` runs one file. A single live UAT timeout flake in `tests/uat/changes.uat.test.ts` may appear locally under OmniFocus load — it is pre-existing and CI skips live UATs; ignore it.
- **Commit author:** `--author="Mike North <michael.l.north@gmail.com>"` (personal github.com remote), `GIT_EDITOR=true`, no AI attribution trailers.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/productivity/src/links/types.ts` | Shared types: `LinkType`, `EventSnapshot`, `EventInput`, `TaskEventLink`, `TaskState`, `RefreshStatus`, `BlockCoverage`, readiness result types. No logic. |
| `packages/productivity/src/links/store.ts` | `LinkStore` interface + `FileLinkStore` (atomic JSON under `OFOCUS_STATE_DIR`). |
| `packages/productivity/src/links/readiness.ts` | Pure computations: `eventNeedsRefresh`/`needsRefresh`, `suggestedDue`, `blockCoverage`, `readiness`. |
| `packages/productivity/src/links/scan-task-state.ts` | OmniJS read of task state (`name`, `completed`, `estimatedMinutes`, `dueDate`) for a set of ids. |
| `packages/productivity/src/commands/link.ts` | `link` / `unlink` / `links` descriptors + handlers + `realLinkDeps()`. |
| `packages/productivity/src/commands/readiness.ts` | `readiness` descriptor + handler. |
| `packages/productivity/tests/unit/links-store.test.ts` | `FileLinkStore` + reusable `LinkStore` conformance suite. |
| `packages/productivity/tests/unit/readiness.test.ts` | Pure-computation unit tests. |
| `packages/productivity/tests/unit/scan-task-state.test.ts` | `buildTaskStateScript` + `parseTaskStates` unit tests. |
| `packages/productivity/tests/unit/link-commands.test.ts` | Command-handler unit tests (injected deps). |
| `packages/productivity/tests/uat/links.uat.test.ts` | Live UAT (auto-skip without OmniFocus). |
| `packages/productivity/src/index.ts` | Add descriptors to `productivityDescriptors` + exports. |
| `packages/cli/src/cli.ts` | Register the 4 CLI commands. |
| `packages/mcp/tests/fixtures/expected-tools.ts` | Add the 4 MCP tool names. |
| `packages/productivity/README.md` | Document the commands. |

---

### Task 1: Shared link types

**Files:**
- Create: `packages/productivity/src/links/types.ts`

- [ ] **Step 1: Create the types module**

```typescript
/**
 * Shared types for task↔calendar-event linkage (A4b).
 *
 * `ofocus` never reads a calendar — every {@link EventSnapshot} is supplied by
 * the agent from its own calendar tool. These types model the stored links and
 * the inputs/outputs of the deterministic readiness/coverage computations.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md
 */
import type { DurationInfo } from "../recurrence/duration.js";

/** The kind of task↔event relationship. */
export type LinkType = "prep-for" | "time-block";

/** Agent-supplied event data, as accepted by the `link`/`readiness` commands (no `capturedAt`). */
export interface EventInput {
  /** Stable id from the agent's calendar source. */
  eventId: string;
  title: string;
  /** Event start (ISO 8601). */
  start: string;
  /** Event end (ISO 8601). */
  end: string;
  location?: string;
  /** Optional provenance, e.g. "google" | "ms365". */
  source?: string;
}

/** A stored event snapshot: an {@link EventInput} plus when the agent supplied it. */
export interface EventSnapshot extends EventInput {
  /** When the agent supplied this snapshot (ISO 8601). */
  capturedAt: string;
}

/** A persisted task↔event link. Identity is `${taskId}::${linkType}::${event.eventId}`. */
export interface TaskEventLink {
  taskId: string;
  linkType: LinkType;
  event: EventSnapshot;
  note?: string;
  /** When the link was first created (ISO 8601). */
  createdAt: string;
}

/** Live state of a single OmniFocus task, read by id. */
export interface TaskState {
  taskId: string;
  name: string;
  completed: boolean;
  /** Estimated minutes, or `null` when unset. */
  estimatedMinutes: number | null;
  /** Due date (ISO 8601), or `null`. */
  dueDate: string | null;
}

/** Whether a stored event snapshot can still be trusted. */
export interface RefreshStatus {
  needsRefresh: boolean;
  reason?: string;
}

/** Does a time-block reserve enough time for the task's estimate? */
export interface BlockCoverage {
  blockMinutes: number;
  estimateMinutes: number | null;
  covers: boolean;
}

/** Per-task readiness within an event. */
export interface PrepTaskReadiness {
  taskId: string;
  /** Task name, or `null` when the task no longer exists. */
  name: string | null;
  status: "done" | "pending";
  /** True when the linked task no longer exists in OmniFocus. */
  taskMissing: boolean;
  /** Time from `now` until the event, or `null` if the event is past or the task is done. */
  timeUntilEvent: DurationInfo | null;
  /** When this prep task should be finished (event.start − estimate), or `null` without an estimate. */
  suggestedDue: string | null;
  /** True when the task's due date is absent or later than `suggestedDue`. */
  late: boolean;
}

/** Overall verdict for an event's preparation. */
export type ReadinessVerdict = "ready" | "not-ready" | "at-risk";

/** Result of the `readiness` command. */
export interface ReadinessResult {
  eventId: string;
  verdict: ReadinessVerdict;
  /** Count of prep tasks that are completed. */
  done: number;
  /** Total prep tasks. */
  total: number;
  tasks: PrepTaskReadiness[];
  refresh: RefreshStatus;
}

/** One prep task and its (possibly missing) live state, fed into {@link readiness}. */
export interface PrepEntry {
  taskId: string;
  state: TaskState | null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && pnpm --filter @ofocus/productivity exec tsc --noEmit`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add packages/productivity/src/links/types.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(links): shared task-event link types"
```

---

### Task 2: LinkStore interface + FileLinkStore + conformance suite

**Files:**
- Create: `packages/productivity/src/links/store.ts`
- Test: `packages/productivity/tests/unit/links-store.test.ts`

- [ ] **Step 1: Write the failing test (conformance suite + FileLinkStore)**

```typescript
/**
 * Tests for the LinkStore contract and the default FileLinkStore.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.2
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileLinkStore, type LinkStore } from "../../src/links/store.js";
import type { TaskEventLink } from "../../src/links/types.js";

const CAPTURED_AT = "2026-06-01T09:00:00.000Z";
const CREATED_AT = "2026-06-01T09:00:00.000Z";

function link(overrides: Partial<TaskEventLink> = {}): TaskEventLink {
  return {
    taskId: overrides.taskId ?? "task-1",
    linkType: overrides.linkType ?? "prep-for",
    event: overrides.event ?? {
      eventId: "evt-1",
      title: "1:1 with Sarah",
      start: "2026-06-02T15:00:00.000Z",
      end: "2026-06-02T15:30:00.000Z",
      capturedAt: CAPTURED_AT,
    },
    createdAt: overrides.createdAt ?? CREATED_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
  };
}

/** Reusable conformance suite: any LinkStore implementation must satisfy it. */
export function runLinkStoreConformance(
  name: string,
  makeStore: () => LinkStore,
): void {
  describe(`LinkStore conformance: ${name}`, () => {
    it("upsert then byTask / byEvent returns the link", async () => {
      const store = makeStore();
      const l = link();
      await store.upsert(l);
      expect(await store.byTask("task-1")).toEqual([l]);
      expect(await store.byEvent("evt-1")).toEqual([l]);
    });

    it("upsert is idempotent on composite key (refreshes, does not duplicate)", async () => {
      const store = makeStore();
      await store.upsert(link());
      const refreshed = link({
        event: {
          eventId: "evt-1",
          title: "1:1 with Sarah (moved)",
          start: "2026-06-02T16:00:00.000Z",
          end: "2026-06-02T16:30:00.000Z",
          capturedAt: "2026-06-01T12:00:00.000Z",
        },
      });
      await store.upsert(refreshed);
      const all = await store.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.event.title).toBe("1:1 with Sarah (moved)");
    });

    it("different linkType for same task+event are distinct links", async () => {
      const store = makeStore();
      await store.upsert(link({ linkType: "prep-for" }));
      await store.upsert(link({ linkType: "time-block" }));
      expect(await store.byTask("task-1")).toHaveLength(2);
    });

    it("remove returns true when present, false when absent", async () => {
      const store = makeStore();
      await store.upsert(link());
      expect(await store.remove("task-1", "prep-for", "evt-1")).toBe(true);
      expect(await store.remove("task-1", "prep-for", "evt-1")).toBe(false);
      expect(await store.byTask("task-1")).toEqual([]);
    });

    it("byTask / byEvent return empty arrays for unknown keys", async () => {
      const store = makeStore();
      expect(await store.byTask("nope")).toEqual([]);
      expect(await store.byEvent("nope")).toEqual([]);
      expect(await store.all()).toEqual([]);
    });
  });
}

describe("FileLinkStore", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ofocus-links-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  runLinkStoreConformance("FileLinkStore", () => new FileLinkStore(dir));

  it("persists across instances (same state dir)", async () => {
    const a = new FileLinkStore(dir);
    await a.upsert(link());
    const b = new FileLinkStore(dir);
    expect(await b.byTask("task-1")).toHaveLength(1);
  });

  it("missing file → empty (no throw)", async () => {
    const store = new FileLinkStore(dir);
    expect(await store.all()).toEqual([]);
  });

  it("corrupt file → throws so the caller can surface a failure", async () => {
    writeFileSync(join(dir, "links.json"), "{ not json", "utf8");
    const store = new FileLinkStore(dir);
    await expect(store.all()).rejects.toThrow();
  });

  it("writes atomically (no leftover temp file)", async () => {
    const store = new FileLinkStore(dir);
    await store.upsert(link());
    const raw = readFileSync(join(dir, "links.json"), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ version: 1 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/links-store.test.ts`
Expected: FAIL — cannot find `../../src/links/store.js`.

- [ ] **Step 3: Implement the store**

```typescript
/**
 * Pluggable persistence for task↔event links.
 *
 * The {@link LinkStore} interface is the seam that lets a future cloud backend
 * (e.g. Airtable, for cloud agents) drop in behind the same contract; the
 * reusable conformance suite in the tests verifies any implementation. The
 * default {@link FileLinkStore} keeps a single atomic JSON document under
 * `OFOCUS_STATE_DIR`, reusing the conventions established by the `changes` cache.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.2
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LinkType, TaskEventLink } from "./types.js";

/** Persistence contract for task↔event links. */
export interface LinkStore {
  /** Insert or replace a link by its composite key (taskId, linkType, eventId). */
  upsert(link: TaskEventLink): Promise<void>;
  /** Remove a link by composite key; resolves `true` if one was removed. */
  remove(taskId: string, linkType: LinkType, eventId: string): Promise<boolean>;
  /** All links for a task. */
  byTask(taskId: string): Promise<TaskEventLink[]>;
  /** All links for an event. */
  byEvent(eventId: string): Promise<TaskEventLink[]>;
  /** Every link (for reconcile / prune). */
  all(): Promise<TaskEventLink[]>;
}

/** Composite identity for a link. */
function keyOf(taskId: string, linkType: LinkType, eventId: string): string {
  return `${taskId}::${linkType}::${eventId}`;
}

/** Resolve the state directory: explicit arg > OFOCUS_STATE_DIR > ~/.ofocus. */
export function resolveStateDir(stateDir?: string): string {
  if (stateDir !== undefined && stateDir.length > 0) return stateDir;
  const env = process.env["OFOCUS_STATE_DIR"];
  if (env !== undefined && env.length > 0) return env;
  return join(homedir(), ".ofocus");
}

/** On-disk shape of the links document. */
interface LinksFile {
  version: 1;
  links: TaskEventLink[];
}

/**
 * Local-JSON {@link LinkStore}. One document at `${stateDir}/links.json`.
 *
 * Reads: a missing file resolves to an empty set; a corrupt file rejects so the
 * caller surfaces a failure rather than silently discarding user state.
 * Writes: atomic (temp file + rename), creating parent dirs.
 */
export class FileLinkStore implements LinkStore {
  private readonly path: string;

  constructor(stateDir?: string) {
    this.path = join(resolveStateDir(stateDir), "links.json");
  }

  private read(): TaskEventLink[] {
    if (!existsSync(this.path)) return [];
    const raw = readFileSync(this.path, "utf8");
    const parsed = JSON.parse(raw) as LinksFile; // throws on corrupt → caller surfaces failure
    return Array.isArray(parsed.links) ? parsed.links : [];
  }

  private write(links: TaskEventLink[]): void {
    mkdirSync(join(this.path, ".."), { recursive: true });
    const doc: LinksFile = { version: 1, links };
    const tmp = `${this.path}.tmp-${String(process.pid)}`;
    writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
    renameSync(tmp, this.path);
  }

  upsert(link: TaskEventLink): Promise<void> {
    const links = this.read();
    const k = keyOf(link.taskId, link.linkType, link.event.eventId);
    const next = links.filter(
      (l) => keyOf(l.taskId, l.linkType, l.event.eventId) !== k,
    );
    next.push(link);
    this.write(next);
    return Promise.resolve();
  }

  remove(taskId: string, linkType: LinkType, eventId: string): Promise<boolean> {
    const links = this.read();
    const k = keyOf(taskId, linkType, eventId);
    const next = links.filter(
      (l) => keyOf(l.taskId, l.linkType, l.event.eventId) !== k,
    );
    if (next.length === links.length) return Promise.resolve(false);
    this.write(next);
    return Promise.resolve(true);
  }

  byTask(taskId: string): Promise<TaskEventLink[]> {
    return Promise.resolve(this.read().filter((l) => l.taskId === taskId));
  }

  byEvent(eventId: string): Promise<TaskEventLink[]> {
    return Promise.resolve(
      this.read().filter((l) => l.event.eventId === eventId),
    );
  }

  all(): Promise<TaskEventLink[]> {
    return Promise.resolve(this.read());
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/links-store.test.ts`
Expected: PASS (all conformance + FileLinkStore cases).

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/links/store.ts packages/productivity/tests/unit/links-store.test.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(links): LinkStore interface + FileLinkStore with conformance suite"
```

---

### Task 3: Pure readiness / coverage / staleness computations

**Files:**
- Create: `packages/productivity/src/links/readiness.ts`
- Test: `packages/productivity/tests/unit/readiness.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/**
 * Tests for the pure link computations: staleness, suggested due/lead-time,
 * block coverage, and the readiness verdict.
 *
 * Expected values are hand-derived from the spec, not captured from output.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.3
 */
import { describe, expect, it } from "vitest";
import {
  blockCoverage,
  eventNeedsRefresh,
  readiness,
  suggestedDue,
} from "../../src/links/readiness.js";
import type {
  EventSnapshot,
  PrepEntry,
  TaskState,
} from "../../src/links/types.js";

const NOW = "2026-06-02T10:00:00.000Z";

function event(overrides: Partial<EventSnapshot> = {}): EventSnapshot {
  return {
    eventId: overrides.eventId ?? "evt-1",
    title: overrides.title ?? "1:1 with Sarah",
    start: overrides.start ?? "2026-06-02T15:00:00.000Z",
    end: overrides.end ?? "2026-06-02T15:30:00.000Z",
    capturedAt: overrides.capturedAt ?? "2026-06-02T09:30:00.000Z",
    ...(overrides.location !== undefined ? { location: overrides.location } : {}),
    ...(overrides.source !== undefined ? { source: overrides.source } : {}),
  };
}

function state(overrides: Partial<TaskState> = {}): TaskState {
  return {
    taskId: overrides.taskId ?? "t1",
    name: overrides.name ?? "Draft agenda",
    completed: overrides.completed ?? false,
    estimatedMinutes:
      overrides.estimatedMinutes !== undefined ? overrides.estimatedMinutes : 30,
    dueDate: overrides.dueDate !== undefined ? overrides.dueDate : null,
  };
}

describe("suggestedDue", () => {
  it("event.start − estimate", () => {
    // 15:00 − 30m = 14:30
    expect(suggestedDue("2026-06-02T15:00:00.000Z", 30)).toBe(
      "2026-06-02T14:30:00.000Z",
    );
  });
  it("null estimate → null", () => {
    expect(suggestedDue("2026-06-02T15:00:00.000Z", null)).toBeNull();
  });
  it("unparseable start → null", () => {
    expect(suggestedDue("not-a-date", 30)).toBeNull();
  });
});

describe("blockCoverage", () => {
  it("covers when block ≥ estimate", () => {
    // 30-minute block, 30-minute estimate
    expect(blockCoverage(event(), 30)).toEqual({
      blockMinutes: 30,
      estimateMinutes: 30,
      covers: true,
    });
  });
  it("does not cover when block < estimate", () => {
    expect(blockCoverage(event(), 45)).toEqual({
      blockMinutes: 30,
      estimateMinutes: 45,
      covers: false,
    });
  });
  it("null estimate → covers false", () => {
    expect(blockCoverage(event(), null)).toEqual({
      blockMinutes: 30,
      estimateMinutes: null,
      covers: false,
    });
  });
});

describe("eventNeedsRefresh", () => {
  it("fresh snapshot, future event, open task → no refresh", () => {
    expect(eventNeedsRefresh(event(), NOW, true)).toEqual({ needsRefresh: false });
  });
  it("snapshot older than 24h → refresh", () => {
    const stale = event({ capturedAt: "2026-05-31T09:00:00.000Z" }); // >24h before NOW
    expect(eventNeedsRefresh(stale, NOW, true).needsRefresh).toBe(true);
  });
  it("event start in the past while task open → refresh", () => {
    const past = event({
      start: "2026-06-02T09:00:00.000Z",
      end: "2026-06-02T09:30:00.000Z",
    });
    expect(eventNeedsRefresh(past, NOW, true).needsRefresh).toBe(true);
  });
  it("event start in the past but task done → no refresh", () => {
    const past = event({
      start: "2026-06-02T09:00:00.000Z",
      end: "2026-06-02T09:30:00.000Z",
    });
    expect(eventNeedsRefresh(past, NOW, false).needsRefresh).toBe(false);
  });
});

describe("readiness", () => {
  it("all prep done → ready", () => {
    const entries: PrepEntry[] = [
      { taskId: "t1", state: state({ completed: true }) },
    ];
    const r = readiness(event(), entries, NOW);
    expect(r.verdict).toBe("ready");
    expect(r.done).toBe(1);
    expect(r.total).toBe(1);
    expect(r.tasks[0]!.status).toBe("done");
  });

  it("pending prep, comfortably early → not-ready (not at-risk)", () => {
    // NOW 10:00, event 15:00, estimate 30 → suggestedDue 14:30 (not yet passed),
    // event is >2h away → not at-risk.
    const entries: PrepEntry[] = [{ taskId: "t1", state: state() }];
    const r = readiness(event(), entries, NOW);
    expect(r.verdict).toBe("not-ready");
    expect(r.tasks[0]!.suggestedDue).toBe("2026-06-02T14:30:00.000Z");
  });

  it("pending prep past its suggested due → at-risk", () => {
    // suggestedDue 14:30; NOW 14:45 is past it.
    const entries: PrepEntry[] = [{ taskId: "t1", state: state() }];
    const r = readiness(event(), entries, "2026-06-02T14:45:00.000Z");
    expect(r.verdict).toBe("at-risk");
  });

  it("pending prep within near-term window of event → at-risk", () => {
    // NOW 13:30, event 15:00 → 1.5h away (< 2h window) → at-risk even though
    // suggestedDue (14:30) has not yet passed.
    const entries: PrepEntry[] = [{ taskId: "t1", state: state() }];
    const r = readiness(event(), entries, "2026-06-02T13:30:00.000Z");
    expect(r.verdict).toBe("at-risk");
  });

  it("missing task → taskMissing flagged, counts as pending", () => {
    const entries: PrepEntry[] = [{ taskId: "gone", state: null }];
    const r = readiness(event(), entries, NOW);
    expect(r.tasks[0]!.taskMissing).toBe(true);
    expect(r.tasks[0]!.name).toBeNull();
    expect(r.verdict).not.toBe("ready");
  });

  it("late: due after suggestedDue", () => {
    const entries: PrepEntry[] = [
      { taskId: "t1", state: state({ dueDate: "2026-06-02T14:45:00.000Z" }) },
    ];
    const r = readiness(event(), entries, NOW);
    expect(r.tasks[0]!.late).toBe(true); // due 14:45 > suggested 14:30
  });

  it("not late: due before suggestedDue", () => {
    const entries: PrepEntry[] = [
      { taskId: "t1", state: state({ dueDate: "2026-06-02T14:00:00.000Z" }) },
    ];
    const r = readiness(event(), entries, NOW);
    expect(r.tasks[0]!.late).toBe(false);
  });

  it("no prep tasks → ready (nothing blocks)", () => {
    const r = readiness(event(), [], NOW);
    expect(r.verdict).toBe("ready");
    expect(r.total).toBe(0);
  });

  it("surfaces refresh status", () => {
    const stale = event({ capturedAt: "2026-05-31T09:00:00.000Z" });
    const r = readiness(stale, [{ taskId: "t1", state: state() }], NOW);
    expect(r.refresh.needsRefresh).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/readiness.test.ts`
Expected: FAIL — cannot find `../../src/links/readiness.js`.

- [ ] **Step 3: Implement the computations**

```typescript
/**
 * Pure, deterministic computations over task↔event links: snapshot staleness,
 * lead-time / suggested due, time-block coverage, and the meeting-readiness
 * verdict. No I/O; `now` is always injected as an ISO string.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.3
 */
import { dueIn } from "../recurrence/duration.js";
import type {
  EventSnapshot,
  PrepEntry,
  PrepTaskReadiness,
  ReadinessResult,
  ReadinessVerdict,
  RefreshStatus,
  TaskEventLink,
  BlockCoverage,
} from "./types.js";

const MS_PER_MINUTE = 60_000;
/** A snapshot older than this is considered stale and worth re-supplying. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
/** When an event is within this window and prep remains, readiness is at-risk. */
const NEAR_TERM_MS = 2 * 60 * 60 * 1000;

/** When (event.start − estimate) falls, or `null` when no estimate / bad date. */
export function suggestedDue(
  eventStart: string,
  estimatedMinutes: number | null,
): string | null {
  if (estimatedMinutes === null) return null;
  const startMs = Date.parse(eventStart);
  if (Number.isNaN(startMs)) return null;
  return new Date(startMs - estimatedMinutes * MS_PER_MINUTE).toISOString();
}

/** Whether a time-block reserves at least the task's estimated minutes. */
export function blockCoverage(
  event: EventSnapshot,
  estimatedMinutes: number | null,
): BlockCoverage {
  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  const blockMinutes =
    Number.isNaN(startMs) || Number.isNaN(endMs)
      ? 0
      : Math.max(0, Math.round((endMs - startMs) / MS_PER_MINUTE));
  return {
    blockMinutes,
    estimateMinutes: estimatedMinutes,
    covers: estimatedMinutes === null ? false : blockMinutes >= estimatedMinutes,
  };
}

/**
 * Whether a stored snapshot for `event` can still be trusted, given `now` and
 * whether the related task is still open. Stale when the snapshot is older than
 * 24h, or the event start is in the past while the task remains actionable
 * (the event may have moved).
 */
export function eventNeedsRefresh(
  event: EventSnapshot,
  now: string,
  taskOpen: boolean,
): RefreshStatus {
  const nowMs = Date.parse(now);
  const capturedMs = Date.parse(event.capturedAt);
  const startMs = Date.parse(event.start);
  if (
    !Number.isNaN(nowMs) &&
    !Number.isNaN(capturedMs) &&
    nowMs - capturedMs > STALE_THRESHOLD_MS
  ) {
    return {
      needsRefresh: true,
      reason: "snapshot older than 24h; re-supply current event data",
    };
  }
  if (
    taskOpen &&
    !Number.isNaN(nowMs) &&
    !Number.isNaN(startMs) &&
    startMs < nowMs
  ) {
    return {
      needsRefresh: true,
      reason:
        "event start is in the past while prep is open; it may have moved — re-supply current event data",
    };
  }
  return { needsRefresh: false };
}

/** Convenience wrapper of {@link eventNeedsRefresh} for a stored link. */
export function needsRefresh(
  link: TaskEventLink,
  now: string,
  taskOpen = true,
): RefreshStatus {
  return eventNeedsRefresh(link.event, now, taskOpen);
}

/** Meeting-readiness verdict for an event's prep tasks (spec §3.3). */
export function readiness(
  event: EventSnapshot,
  entries: PrepEntry[],
  now: string,
): ReadinessResult {
  const tasks: PrepTaskReadiness[] = entries.map((e) => {
    if (e.state === null) {
      return {
        taskId: e.taskId,
        name: null,
        status: "pending",
        taskMissing: true,
        timeUntilEvent: dueIn(event.start, now),
        suggestedDue: null,
        late: false,
      };
    }
    const sd = suggestedDue(event.start, e.state.estimatedMinutes);
    const done = e.state.completed;
    const late =
      !done && sd !== null && (e.state.dueDate === null || e.state.dueDate > sd);
    return {
      taskId: e.taskId,
      name: e.state.name,
      status: done ? "done" : "pending",
      taskMissing: false,
      timeUntilEvent: done ? null : dueIn(event.start, now),
      suggestedDue: sd,
      late,
    };
  });

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const anyOpen = tasks.some((t) => t.status === "pending");
  const refresh = eventNeedsRefresh(event, now, anyOpen);

  let verdict: ReadinessVerdict;
  if (!anyOpen) {
    verdict = "ready";
  } else {
    const nowMs = Date.parse(now);
    const startMs = Date.parse(event.start);
    const pastSuggested = tasks.some(
      (t) => t.status === "pending" && t.suggestedDue !== null && now >= t.suggestedDue,
    );
    const nearTerm =
      !Number.isNaN(nowMs) &&
      !Number.isNaN(startMs) &&
      startMs - nowMs <= NEAR_TERM_MS;
    verdict = pastSuggested || nearTerm ? "at-risk" : "not-ready";
  }

  return { eventId: event.eventId, verdict, done, total, tasks, refresh };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/links/readiness.ts packages/productivity/tests/unit/readiness.test.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(links): pure readiness, lead-time, coverage, and staleness computations"
```

---

### Task 4: OmniJS read of task state by id

**Files:**
- Create: `packages/productivity/src/links/scan-task-state.ts`
- Test: `packages/productivity/tests/unit/scan-task-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/**
 * Tests for building/parsing the task-state OmniJS read. The live read is
 * exercised in the UAT; here we test the pure script-builder and parser.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.5
 */
import { describe, expect, it } from "vitest";
import {
  buildTaskStateScript,
  parseTaskStates,
} from "../../src/links/scan-task-state.js";

describe("buildTaskStateScript", () => {
  it("embeds each escaped id and returns a stringified array", () => {
    const body = buildTaskStateScript(["abc", 'we"ird']);
    expect(body).toContain('"abc"');
    expect(body).toContain('we\\"ird'); // escaped quote
    expect(body).toContain("Task.byIdentifier");
    expect(body).toContain("JSON.stringify(rows)");
  });
});

describe("parseTaskStates", () => {
  it("maps valid rows to TaskState", () => {
    const rows = [
      {
        taskId: "t1",
        name: "Draft agenda",
        completed: false,
        estimatedMinutes: 30,
        dueDate: "2026-06-02T14:00:00.000Z",
      },
    ];
    expect(parseTaskStates(rows)).toEqual([
      {
        taskId: "t1",
        name: "Draft agenda",
        completed: false,
        estimatedMinutes: 30,
        dueDate: "2026-06-02T14:00:00.000Z",
      },
    ]);
  });

  it("coerces missing estimate/due to null", () => {
    const rows = [
      { taskId: "t1", name: "X", completed: true, estimatedMinutes: null, dueDate: null },
    ];
    const [s] = parseTaskStates(rows);
    expect(s!.estimatedMinutes).toBeNull();
    expect(s!.dueDate).toBeNull();
    expect(s!.completed).toBe(true);
  });

  it("non-array → empty", () => {
    expect(parseTaskStates(null)).toEqual([]);
    expect(parseTaskStates({})).toEqual([]);
  });

  it("skips malformed rows", () => {
    const rows = [{ taskId: "t1", name: "ok", completed: false, estimatedMinutes: 5, dueDate: null }, 42, { nope: true }];
    expect(parseTaskStates(rows)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/scan-task-state.test.ts`
Expected: FAIL — cannot find `../../src/links/scan-task-state.js`.

- [ ] **Step 3: Implement the read**

```typescript
/**
 * OmniJS read of live task state (completion, estimate, due) for a set of ids.
 *
 * Mirrors `recurrence/scan-rule.ts`: locate each task via `Task.byIdentifier`,
 * skip ids that no longer exist, and return a JSON array of rows. The caller
 * diffs requested ids against returned rows to detect missing tasks.
 */
import { escapeJSString, runOmniJSWrapped } from "@ofocus/sdk";
import type { TaskState } from "./types.js";

/**
 * Build the OmniJS body that reads state for `ids`. Missing tasks are skipped
 * (not present in the output array). Exported for testing.
 */
export function buildTaskStateScript(ids: string[]): string {
  const arr = ids.map((id) => `"${escapeJSString(id)}"`).join(",");
  return `
var ids = [${arr}];
var rows = [];
for (var i = 0; i < ids.length; i++) {
  var task = Task.byIdentifier(ids[i]);
  if (!task) { continue; }
  rows.push({
    taskId: task.id.primaryKey,
    name: task.name,
    completed: task.completed,
    estimatedMinutes: (task.estimatedMinutes != null) ? task.estimatedMinutes : null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null
  });
}
return JSON.stringify(rows);`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse the OmniJS result into validated {@link TaskState} rows. Exported for testing. */
export function parseTaskStates(raw: unknown): TaskState[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskState[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const taskId = row["taskId"];
    const name = row["name"];
    if (typeof taskId !== "string" || typeof name !== "string") continue;
    const estimate = row["estimatedMinutes"];
    const due = row["dueDate"];
    out.push({
      taskId,
      name,
      completed: row["completed"] === true,
      estimatedMinutes: typeof estimate === "number" ? estimate : null,
      dueDate: typeof due === "string" ? due : null,
    });
  }
  return out;
}

/** Live read of task state for `ids`. Empty input short-circuits (no OmniJS call). */
export async function readTaskStates(ids: string[]): Promise<TaskState[]> {
  if (ids.length === 0) return [];
  const result = await runOmniJSWrapped<unknown>(buildTaskStateScript(ids));
  return parseTaskStates(result);
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/scan-task-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/links/scan-task-state.ts packages/productivity/tests/unit/scan-task-state.test.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(links): OmniJS read of task state by id"
```

---

### Task 5: `link` / `unlink` / `links` commands

**Files:**
- Create: `packages/productivity/src/commands/link.ts`
- Test: `packages/productivity/tests/unit/link-commands.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/**
 * Unit tests for the link/unlink/links command handlers, with the store and
 * task-state fetcher injected (no disk, no OmniFocus).
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.4, §4
 */
import { describe, expect, it } from "vitest";
import {
  runLink,
  runLinks,
  runUnlink,
  type LinkDeps,
} from "../../src/commands/link.js";
import type { LinkStore } from "../../src/links/store.js";
import type { TaskEventLink, TaskState } from "../../src/links/types.js";

const NOW = "2026-06-01T09:00:00.000Z";

const EVENT = {
  eventId: "evt-1",
  title: "1:1 with Sarah",
  start: "2026-06-02T15:00:00.000Z",
  end: "2026-06-02T15:30:00.000Z",
};

/** In-memory LinkStore for tests. */
function memStore(seed: TaskEventLink[] = []): LinkStore {
  let links = [...seed];
  const key = (l: TaskEventLink) => `${l.taskId}::${l.linkType}::${l.event.eventId}`;
  return {
    upsert: (l) => {
      links = links.filter((x) => key(x) !== key(l));
      links.push(l);
      return Promise.resolve();
    },
    remove: (taskId, linkType, eventId) => {
      const before = links.length;
      links = links.filter(
        (x) => !(x.taskId === taskId && x.linkType === linkType && x.event.eventId === eventId),
      );
      return Promise.resolve(links.length < before);
    },
    byTask: (taskId) => Promise.resolve(links.filter((l) => l.taskId === taskId)),
    byEvent: (eventId) => Promise.resolve(links.filter((l) => l.event.eventId === eventId)),
    all: () => Promise.resolve([...links]),
  };
}

function deps(overrides: Partial<LinkDeps> = {}): LinkDeps {
  return {
    store: overrides.store ?? memStore(),
    fetchTaskStates:
      overrides.fetchTaskStates ??
      ((ids) =>
        Promise.resolve(
          ids.map<TaskState>((taskId) => ({
            taskId,
            name: "Draft agenda",
            completed: false,
            estimatedMinutes: 30,
            dueDate: null,
          })),
        )),
    now: overrides.now ?? NOW,
  };
}

describe("runLink", () => {
  it("creates a prep-for link (default type) with stamped timestamps", async () => {
    const d = deps();
    const out = await runLink({ taskId: "t1", event: EVENT }, d);
    expect(out.success).toBe(true);
    const link = out.data!.link;
    expect(link.linkType).toBe("prep-for");
    expect(link.event.capturedAt).toBe(NOW);
    expect(link.createdAt).toBe(NOW);
    expect(await d.store.byTask("t1")).toHaveLength(1);
  });

  it("rejects an unknown task with VALIDATION_ERROR", async () => {
    const d = deps({ fetchTaskStates: () => Promise.resolve([]) });
    const out = await runLink({ taskId: "gone", event: EVENT }, d);
    expect(out.success).toBe(false);
    expect(out.error?.code).toBe("VALIDATION_ERROR");
  });

  it("OmniFocus unreachable → stores anyway with taskVerified false", async () => {
    const d = deps({
      fetchTaskStates: () => Promise.reject(new Error("OmniFocus not running")),
    });
    const out = await runLink({ taskId: "t1", event: EVENT }, d);
    expect(out.success).toBe(true);
    expect(out.data!.taskVerified).toBe(false);
    expect(await d.store.byTask("t1")).toHaveLength(1);
  });

  it("rejects end < start", async () => {
    const out = await runLink(
      { taskId: "t1", event: { ...EVENT, end: "2026-06-02T14:00:00.000Z" } },
      deps(),
    );
    expect(out.success).toBe(false);
    expect(out.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects non-ISO start", async () => {
    const out = await runLink(
      { taskId: "t1", event: { ...EVENT, start: "tomorrow" } },
      deps(),
    );
    expect(out.success).toBe(false);
    expect(out.error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("runUnlink", () => {
  it("removes an existing link", async () => {
    const seed: TaskEventLink = {
      taskId: "t1",
      linkType: "prep-for",
      event: { ...EVENT, capturedAt: NOW },
      createdAt: NOW,
    };
    const d = deps({ store: memStore([seed]) });
    const out = await runUnlink({ taskId: "t1", eventId: "evt-1" }, d);
    expect(out.success).toBe(true);
    expect(out.data!.removed).toBe(true);
  });

  it("reports removed=false when absent", async () => {
    const out = await runUnlink({ taskId: "t1", eventId: "nope" }, deps());
    expect(out.success).toBe(true);
    expect(out.data!.removed).toBe(false);
  });
});

describe("runLinks", () => {
  const tb: TaskEventLink = {
    taskId: "t1",
    linkType: "time-block",
    event: { ...EVENT, capturedAt: NOW },
    createdAt: NOW,
  };

  it("lists by task with time-block coverage annotation", async () => {
    const d = deps({ store: memStore([tb]) });
    const out = await runLinks({ task: "t1" }, d);
    expect(out.success).toBe(true);
    const item = out.data!.links[0]!;
    expect(item.link.linkType).toBe("time-block");
    expect(item.blockCoverage).toEqual({ blockMinutes: 30, estimateMinutes: 30, covers: true });
    expect(item.refresh.needsRefresh).toBe(false);
  });

  it("lists by event", async () => {
    const d = deps({ store: memStore([tb]) });
    const out = await runLinks({ eventId: "evt-1" }, d);
    expect(out.success).toBe(true);
    expect(out.data!.links).toHaveLength(1);
  });

  it("requires exactly one selector", async () => {
    expect((await runLinks({}, deps())).success).toBe(false);
    expect((await runLinks({ task: "t1", eventId: "evt-1" }, deps())).success).toBe(false);
  });

  it("prune removes links whose task no longer exists", async () => {
    const d = deps({
      store: memStore([tb]),
      fetchTaskStates: () => Promise.resolve([]), // task gone
    });
    const out = await runLinks({ task: "t1", prune: true }, d);
    expect(out.success).toBe(true);
    expect(out.data!.pruned).toBe(1);
    expect(await d.store.byTask("t1")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/link-commands.test.ts`
Expected: FAIL — cannot find `../../src/commands/link.js`.

- [ ] **Step 3: Implement the commands**

```typescript
/**
 * `link` / `unlink` / `links` — create, remove, and list task↔event links.
 *
 * All OmniFocus and disk I/O is behind injected {@link LinkDeps} so handlers are
 * unit-testable offline. `ofocus` never reads a calendar: event data arrives via
 * the `--event` JSON argument (a structured object over MCP; a JSON string over
 * the CLI, transparently parsed by a `z.preprocess` wrapper).
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.4
 */
import { z } from "zod";
import {
  type CliOutput,
  ErrorCode,
  createError,
  defineCommand,
  failure,
  success,
} from "@ofocus/sdk";
import { FileLinkStore, type LinkStore } from "../links/store.js";
import { readTaskStates } from "../links/scan-task-state.js";
import { blockCoverage, needsRefresh } from "../links/readiness.js";
import type {
  BlockCoverage,
  EventInput,
  EventSnapshot,
  LinkType,
  RefreshStatus,
  TaskEventLink,
  TaskState,
} from "../links/types.js";

/** Injected dependencies for the link commands. */
export interface LinkDeps {
  store: LinkStore;
  /** Resolves live state for the given task ids; rejects if OmniFocus is unreachable. */
  fetchTaskStates: (ids: string[]) => Promise<TaskState[]>;
  /** Current instant (ISO 8601), injected for determinism. */
  now: string;
}

interface LinkInput {
  taskId?: string | undefined;
  event?: EventInput | undefined;
  type?: LinkType | undefined;
  note?: string | undefined;
}

interface UnlinkInput {
  taskId?: string | undefined;
  eventId?: string | undefined;
  type?: LinkType | undefined;
}

interface LinksInput {
  task?: string | undefined;
  eventId?: string | undefined;
  prune?: boolean | undefined;
}

/** Result of `link`. */
export interface LinkResult {
  link: TaskEventLink;
  /** False when OmniFocus was unreachable and the task could not be verified. */
  taskVerified: boolean;
  refresh: RefreshStatus;
}

/** A listed link with its computed annotations. */
export interface ListedLink {
  link: TaskEventLink;
  refresh: RefreshStatus;
  /** Present only for time-block links. */
  blockCoverage?: BlockCoverage;
}

/** Result of `links`. */
export interface LinksResult {
  links: ListedLink[];
  /** Number of links removed by `--prune` (0 when not pruning). */
  pruned: number;
}

/** Validate an agent-supplied event and stamp `capturedAt`. */
function toSnapshot(
  event: EventInput,
  now: string,
): { ok: true; value: EventSnapshot } | { ok: false; message: string } {
  if (event.eventId.trim().length === 0) {
    return { ok: false, message: "event.eventId is required" };
  }
  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  if (Number.isNaN(startMs)) {
    return { ok: false, message: `event.start is not a valid ISO date: ${event.start}` };
  }
  if (Number.isNaN(endMs)) {
    return { ok: false, message: `event.end is not a valid ISO date: ${event.end}` };
  }
  if (endMs < startMs) {
    return { ok: false, message: "event.end is before event.start" };
  }
  return {
    ok: true,
    value: {
      eventId: event.eventId,
      title: event.title,
      start: event.start,
      end: event.end,
      capturedAt: now,
      ...(event.location !== undefined ? { location: event.location } : {}),
      ...(event.source !== undefined ? { source: event.source } : {}),
    },
  };
}

/** Core handler for `link`. */
export async function runLink(
  input: LinkInput,
  deps: LinkDeps,
): Promise<CliOutput<LinkResult>> {
  const taskId = (input.taskId ?? "").trim();
  if (taskId.length === 0) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, "link requires a taskId"));
  }
  if (input.event === undefined) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, "link requires --event"));
  }
  const snap = toSnapshot(input.event, deps.now);
  if (!snap.ok) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, snap.message));
  }

  // Verify the task exists; if OmniFocus is unreachable, store anyway (fail-open).
  let taskVerified = true;
  try {
    const states = await deps.fetchTaskStates([taskId]);
    if (states.length === 0) {
      return failure(
        createError(ErrorCode.TASK_NOT_FOUND, `No task with id: ${taskId}`),
      );
    }
  } catch {
    taskVerified = false;
  }

  const linkType: LinkType = input.type ?? "prep-for";
  const link: TaskEventLink = {
    taskId,
    linkType,
    event: snap.value,
    createdAt: deps.now,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  try {
    await deps.store.upsert(link);
  } catch (e) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        e instanceof Error ? e.message : "failed to persist link",
      ),
    );
  }
  return success({
    link,
    taskVerified,
    refresh: needsRefresh(link, deps.now),
  });
}

/** Core handler for `unlink`. */
export async function runUnlink(
  input: UnlinkInput,
  deps: LinkDeps,
): Promise<CliOutput<{ removed: boolean }>> {
  const taskId = (input.taskId ?? "").trim();
  const eventId = (input.eventId ?? "").trim();
  if (taskId.length === 0 || eventId.length === 0) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "unlink requires a taskId and --event-id"),
    );
  }
  const linkType: LinkType = input.type ?? "prep-for";
  try {
    const removed = await deps.store.remove(taskId, linkType, eventId);
    return success({ removed });
  } catch (e) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        e instanceof Error ? e.message : "failed to remove link",
      ),
    );
  }
}

/** Core handler for `links`. */
export async function runLinks(
  input: LinksInput,
  deps: LinkDeps,
): Promise<CliOutput<LinksResult>> {
  const task = (input.task ?? "").trim();
  const eventId = (input.eventId ?? "").trim();
  if ((task.length === 0) === (eventId.length === 0)) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "links requires exactly one of --task or --event-id",
      ),
    );
  }

  let links: TaskEventLink[];
  try {
    links = task.length > 0 ? await deps.store.byTask(task) : await deps.store.byEvent(eventId);
  } catch (e) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        e instanceof Error ? e.message : "failed to read links",
      ),
    );
  }

  // Fetch task states once for coverage + open/closed (for staleness) + prune.
  const ids = [...new Set(links.map((l) => l.taskId))];
  let states: TaskState[] = [];
  let omniReachable = true;
  try {
    states = await deps.fetchTaskStates(ids);
  } catch {
    omniReachable = false;
  }
  const byId = new Map(states.map((s) => [s.taskId, s]));

  let pruned = 0;
  if (input.prune === true && omniReachable) {
    for (const l of links) {
      if (!byId.has(l.taskId)) {
        if (await deps.store.remove(l.taskId, l.linkType, l.event.eventId)) pruned += 1;
      }
    }
    links = links.filter((l) => byId.has(l.taskId));
  }

  const listed: ListedLink[] = links.map((l) => {
    const state = byId.get(l.taskId) ?? null;
    const taskOpen = state ? !state.completed : true;
    const base: ListedLink = {
      link: l,
      refresh: needsRefresh(l, deps.now, taskOpen),
    };
    if (l.linkType === "time-block") {
      base.blockCoverage = blockCoverage(l.event, state ? state.estimatedMinutes : null);
    }
    return base;
  });

  return success({ links: listed, pruned });
}

/** Production dependencies. */
function realLinkDeps(): LinkDeps {
  return {
    store: new FileLinkStore(),
    fetchTaskStates: readTaskStates,
    now: new Date().toISOString(),
  };
}

/** Zod schema for an agent-supplied event; CLI passes it as a JSON string. */
const eventObjectSchema = z.object({
  eventId: z.string().min(1).describe("Stable event id from your calendar source"),
  title: z.string().describe("Event title"),
  start: z.string().describe("Event start (ISO 8601)"),
  end: z.string().describe("Event end (ISO 8601)"),
  location: z.string().optional().describe("Event location"),
  source: z.string().optional().describe("Calendar source, e.g. google | ms365"),
});

/** Accept either a structured object (MCP) or a JSON string (CLI). */
const eventArgSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v; // leave as-is so object validation fails with a clear error
  }
}, eventObjectSchema);

export const linkDescriptor = defineCommand({
  name: "link",
  cliName: "link",
  mcpName: "link",
  description:
    "Link an OmniFocus task to a calendar event the agent supplies. " +
    "--type prep-for (task done before the event) or time-block (event reserves work time). " +
    "ofocus never reads a calendar; pass event data via --event.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The task to link"),
    event: eventArgSchema.describe(
      'Event JSON: {"eventId","title","start","end","location"?,"source"?}',
    ),
    type: z
      .enum(["prep-for", "time-block"])
      .optional()
      .describe("Link type (default: prep-for)"),
    note: z.string().optional().describe("Optional note describing the link"),
  }),
  handler: async (parsed): Promise<CliOutput<LinkResult>> =>
    runLink(parsed, realLinkDeps()),
});

export const unlinkDescriptor = defineCommand({
  name: "unlink",
  cliName: "unlink",
  mcpName: "unlink",
  description: "Remove a task↔event link by task id, event id, and type.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The linked task id"),
    eventId: z.string().describe("The linked event id"),
    type: z
      .enum(["prep-for", "time-block"])
      .optional()
      .describe("Link type (default: prep-for)"),
  }),
  handler: async (parsed): Promise<CliOutput<{ removed: boolean }>> =>
    runUnlink(parsed, realLinkDeps()),
});

export const linksDescriptor = defineCommand({
  name: "links",
  cliName: "links",
  mcpName: "links",
  description:
    "List task↔event links for a task (--task) or an event (--event-id). " +
    "Each link is annotated with refresh status and (for time-blocks) coverage. " +
    "--prune drops links whose task no longer exists.",
  cliPositional: [],
  inputSchema: z.object({
    task: z.string().optional().describe("List links for this task id"),
    eventId: z.string().optional().describe("List links for this event id"),
    prune: z
      .boolean()
      .optional()
      .describe("Remove links whose task no longer exists"),
  }),
  handler: async (parsed): Promise<CliOutput<LinksResult>> =>
    runLinks(parsed, realLinkDeps()),
});
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/link-commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/commands/link.ts packages/productivity/tests/unit/link-commands.test.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(links): link/unlink/links commands"
```

---

### Task 6: `readiness` command

**Files:**
- Create: `packages/productivity/src/commands/readiness.ts`
- Test: append to `packages/productivity/tests/unit/link-commands.test.ts` (or a new `readiness-command.test.ts`)

- [ ] **Step 1: Write the failing test (new file)**

```typescript
/**
 * Unit tests for the readiness command handler (injected store + task fetcher).
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.4
 */
import { describe, expect, it } from "vitest";
import { runReadiness } from "../../src/commands/readiness.js";
import type { LinkDeps } from "../../src/commands/link.js";
import type { LinkStore } from "../../src/links/store.js";
import type { TaskEventLink, TaskState } from "../../src/links/types.js";

const NOW = "2026-06-02T10:00:00.000Z";
const SNAP = {
  eventId: "evt-1",
  title: "1:1 with Sarah",
  start: "2026-06-02T15:00:00.000Z",
  end: "2026-06-02T15:30:00.000Z",
  capturedAt: "2026-06-02T09:30:00.000Z",
};

function memStore(seed: TaskEventLink[] = []): LinkStore {
  let links = [...seed];
  const key = (l: TaskEventLink) => `${l.taskId}::${l.linkType}::${l.event.eventId}`;
  return {
    upsert: (l) => {
      links = links.filter((x) => key(x) !== key(l));
      links.push(l);
      return Promise.resolve();
    },
    remove: () => Promise.resolve(false),
    byTask: (t) => Promise.resolve(links.filter((l) => l.taskId === t)),
    byEvent: (e) => Promise.resolve(links.filter((l) => l.event.eventId === e)),
    all: () => Promise.resolve([...links]),
  };
}

function prep(taskId: string): TaskEventLink {
  return { taskId, linkType: "prep-for", event: SNAP, createdAt: NOW };
}

function deps(overrides: Partial<LinkDeps> = {}): LinkDeps {
  return {
    store: overrides.store ?? memStore([prep("t1")]),
    fetchTaskStates:
      overrides.fetchTaskStates ??
      ((ids) =>
        Promise.resolve(
          ids.map<TaskState>((taskId) => ({
            taskId,
            name: "Draft agenda",
            completed: false,
            estimatedMinutes: 30,
            dueDate: null,
          })),
        )),
    now: overrides.now ?? NOW,
  };
}

describe("runReadiness", () => {
  it("computes a verdict from stored prep links", async () => {
    const out = await runReadiness({ eventId: "evt-1" }, deps());
    expect(out.success).toBe(true);
    expect(out.data!.total).toBe(1);
    expect(["ready", "not-ready", "at-risk"]).toContain(out.data!.verdict);
  });

  it("requires an event id", async () => {
    const out = await runReadiness({}, deps());
    expect(out.success).toBe(false);
    expect(out.error?.code).toBe("VALIDATION_ERROR");
  });

  it("no prep links and no --event override → failure", async () => {
    const out = await runReadiness({ eventId: "evt-unknown" }, deps());
    expect(out.success).toBe(false);
  });

  it("--event override refreshes stored snapshots", async () => {
    const store = memStore([prep("t1")]);
    const d = deps({ store });
    const out = await runReadiness(
      {
        eventId: "evt-1",
        event: {
          eventId: "evt-1",
          title: "moved",
          start: "2026-06-02T16:00:00.000Z",
          end: "2026-06-02T16:30:00.000Z",
        },
      },
      d,
    );
    expect(out.success).toBe(true);
    const stored = await store.byEvent("evt-1");
    expect(stored[0]!.event.title).toBe("moved");
    expect(stored[0]!.event.capturedAt).toBe(NOW);
  });

  it("OmniFocus unreachable → failure (results would be wrong)", async () => {
    const d = deps({ fetchTaskStates: () => Promise.reject(new Error("not running")) });
    const out = await runReadiness({ eventId: "evt-1" }, d);
    expect(out.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/readiness-command.test.ts`
Expected: FAIL — cannot find `../../src/commands/readiness.js`.

- [ ] **Step 3: Implement the command**

```typescript
/**
 * `readiness` — meeting-readiness for a calendar event: gather its `prep-for`
 * links, read the live task state, and compute the verdict (spec §3.3). An
 * inline `--event` override refreshes the stored snapshots first (refresh on
 * supply); without it, the most recently captured stored snapshot is used.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.4
 */
import {
  type CliOutput,
  ErrorCode,
  createError,
  defineCommand,
  failure,
  success,
} from "@ofocus/sdk";
import { z } from "zod";
import { FileLinkStore } from "../links/store.js";
import { readTaskStates } from "../links/scan-task-state.js";
import { readiness } from "../links/readiness.js";
import type { LinkDeps } from "./link.js";
import type {
  EventInput,
  EventSnapshot,
  PrepEntry,
  ReadinessResult,
  TaskEventLink,
  TaskState,
} from "../links/types.js";

interface ReadinessInput {
  eventId?: string | undefined;
  event?: EventInput | undefined;
  now?: string | undefined;
}

/** Validate an inline event override and stamp `capturedAt` from `now`. */
function overrideSnapshot(
  event: EventInput,
  now: string,
): { ok: true; value: EventSnapshot } | { ok: false; message: string } {
  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  if (Number.isNaN(startMs)) return { ok: false, message: `event.start invalid: ${event.start}` };
  if (Number.isNaN(endMs)) return { ok: false, message: `event.end invalid: ${event.end}` };
  if (endMs < startMs) return { ok: false, message: "event.end is before event.start" };
  return {
    ok: true,
    value: {
      eventId: event.eventId,
      title: event.title,
      start: event.start,
      end: event.end,
      capturedAt: now,
      ...(event.location !== undefined ? { location: event.location } : {}),
      ...(event.source !== undefined ? { source: event.source } : {}),
    },
  };
}

export async function runReadiness(
  input: ReadinessInput,
  deps: LinkDeps,
): Promise<CliOutput<ReadinessResult>> {
  const eventId = (input.eventId ?? "").trim();
  if (eventId.length === 0) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, "readiness requires --event-id"));
  }
  const now = (input.now ?? "").trim().length > 0 ? input.now!.trim() : deps.now;

  let links: TaskEventLink[];
  try {
    links = await deps.store.byEvent(eventId);
  } catch (e) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        e instanceof Error ? e.message : "failed to read links",
      ),
    );
  }
  const prep = links.filter((l) => l.linkType === "prep-for");

  // Resolve the event snapshot to compute against.
  let event: EventSnapshot;
  if (input.event !== undefined) {
    const snap = overrideSnapshot(input.event, now);
    if (!snap.ok) return failure(createError(ErrorCode.VALIDATION_ERROR, snap.message));
    event = snap.value;
    // Refresh on supply: persist the new snapshot into every prep link.
    try {
      for (const l of prep) await deps.store.upsert({ ...l, event });
    } catch (e) {
      return failure(
        createError(
          ErrorCode.UNKNOWN_ERROR,
          e instanceof Error ? e.message : "failed to refresh snapshots",
        ),
      );
    }
  } else if (prep.length > 0) {
    event = prep.reduce((a, b) =>
      a.event.capturedAt >= b.event.capturedAt ? a : b,
    ).event;
  } else {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        `No prep-for links for event ${eventId}; supply --event to assess a new one`,
      ),
    );
  }

  // Live task state is required for a correct verdict — fail if unreachable.
  let states: TaskState[];
  try {
    states = await deps.fetchTaskStates(prep.map((l) => l.taskId));
  } catch (e) {
    return failure(
      createError(
        ErrorCode.OMNIFOCUS_NOT_RUNNING,
        e instanceof Error ? e.message : "OmniFocus is not reachable",
      ),
    );
  }
  const byId = new Map(states.map((s) => [s.taskId, s]));
  const entries: PrepEntry[] = prep.map((l) => ({
    taskId: l.taskId,
    state: byId.get(l.taskId) ?? null,
  }));

  return success(readiness(event, entries, now));
}

function realLinkDeps(): LinkDeps {
  return {
    store: new FileLinkStore(),
    fetchTaskStates: readTaskStates,
    now: new Date().toISOString(),
  };
}

const eventObjectSchema = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  location: z.string().optional(),
  source: z.string().optional(),
});
const eventArgSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}, eventObjectSchema);

export const readinessDescriptor = defineCommand({
  name: "readiness",
  cliName: "readiness",
  mcpName: "readiness",
  description:
    "Assess meeting readiness for a calendar event: are its prep-for tasks done, " +
    "and are they on track relative to the event start? Pass --event to refresh the " +
    "stored snapshot with current calendar data.",
  cliPositional: [],
  inputSchema: z.object({
    eventId: z.string().describe("The event id to assess"),
    event: eventArgSchema
      .optional()
      .describe("Optional fresh event JSON to refresh the stored snapshot"),
    now: z
      .string()
      .optional()
      .describe("Override the current instant (ISO 8601; for testing/determinism)"),
  }),
  handler: async (parsed): Promise<CliOutput<ReadinessResult>> =>
    runReadiness(parsed, realLinkDeps()),
});
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && npx vitest run packages/productivity/tests/unit/readiness-command.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/commands/readiness.ts packages/productivity/tests/unit/readiness-command.test.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(links): readiness command"
```

---

### Task 7: Wiring — descriptors, CLI, MCP fixture, docs, README

**Files:**
- Modify: `packages/productivity/src/index.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/mcp/tests/fixtures/expected-tools.ts`
- Modify: `packages/productivity/README.md`

- [ ] **Step 1: Add to `productivityDescriptors` and exports (`src/index.ts`)**

Add imports near the other command imports:
```typescript
import { linkDescriptor, unlinkDescriptor, linksDescriptor } from "./commands/link.js";
import { readinessDescriptor } from "./commands/readiness.js";
```

Add public exports (after the resolve exports):
```typescript
export {
  runLink,
  runUnlink,
  runLinks,
  linkDescriptor,
  unlinkDescriptor,
  linksDescriptor,
} from "./commands/link.js";
export type {
  LinkDeps,
  LinkResult,
  LinksResult,
  ListedLink,
} from "./commands/link.js";
export { runReadiness, readinessDescriptor } from "./commands/readiness.js";
export { FileLinkStore } from "./links/store.js";
export type { LinkStore } from "./links/store.js";
export * from "./links/types.js";
export {
  readiness,
  blockCoverage,
  suggestedDue,
  needsRefresh,
  eventNeedsRefresh,
} from "./links/readiness.js";
```

Add the four descriptors to the array:
```typescript
export const productivityDescriptors: readonly ResolvedCommandDescriptor<
  any,
  any,
  any
>[] = [
  changesDescriptor,
  nextOccurrencesDescriptor,
  occurrencesDescriptor,
  todayDescriptor,
  thisWeekDescriptor,
  resolveDescriptor,
  linkDescriptor,
  unlinkDescriptor,
  linksDescriptor,
  readinessDescriptor,
];
```

- [ ] **Step 2: Register the CLI commands (`packages/cli/src/cli.ts`)**

Add to the `@ofocus/productivity` import block (near `resolveDescriptor`):
```typescript
  linkDescriptor,
  unlinkDescriptor,
  linksDescriptor,
  readinessDescriptor,
```

Add the registrations after the `resolveDescriptor` block (around line 240):
```typescript
  registerCliCommand(program, linkDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, unlinkDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, linksDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
  registerCliCommand(program, readinessDescriptor, (result, cmd) => {
    output(result, getOutputFormat(getGlobalOpts(cmd)));
  });
```

- [ ] **Step 3: Add MCP tool names (`packages/mcp/tests/fixtures/expected-tools.ts`)**

Update the `PRODUCTIVITY_TOOLS` array:
```typescript
export const PRODUCTIVITY_TOOLS = [
  "changes",
  "next_occurrences",
  "occurrences",
  "today",
  "this_week",
  "resolve",
  "link",
  "unlink",
  "links",
  "readiness",
] as const;
```

- [ ] **Step 4: Document the commands (`packages/productivity/README.md`)**

Add this section after the `## Resolve` section:
````markdown
## Calendar links

Link OmniFocus tasks to calendar events the agent supplies (`ofocus` never reads a calendar itself) and reason about them deterministically.

```bash
# Link a task as prep for a meeting (event data comes from your calendar tool)
ofocus link <taskId> --type prep-for \
  --event '{"eventId":"abc","title":"1:1 with Sarah","start":"2026-06-02T15:00:00Z","end":"2026-06-02T15:30:00Z"}'

# Reserve a work block for a task
ofocus link <taskId> --type time-block --event '{...}'

# Is this meeting's prep done and on track?
ofocus readiness --event-id abc --format json

# Refresh the stored event with current calendar data while assessing
ofocus readiness --event-id abc --event '{...current event...}' --format json

# List links (each annotated with refresh status; time-blocks show coverage)
ofocus links --task <taskId> --format json
ofocus links --event-id abc --format json

# Drop links whose task no longer exists
ofocus links --task <taskId> --prune

# Remove a specific link
ofocus unlink <taskId> --event-id abc --type prep-for
```

| Link type | Computation |
| --------- | ----------- |
| `prep-for` | Meeting **readiness** (`ready` / `not-ready` / `at-risk`) + lead-time `suggestedDue` (event start − estimate) and a `late` flag. |
| `time-block` | **Block coverage** — whether the reserved block is at least the task's estimated minutes. |

Each link carries a **`needsRefresh`** signal: when the stored event snapshot is older than 24h, or the event start has passed while prep is still open, `ofocus` flags it so the agent re-supplies current calendar data.

Links are stored under `OFOCUS_STATE_DIR` (default `~/.ofocus`) via a pluggable `LinkStore` (cloud backends can be added behind the same interface).
````

- [ ] **Step 5: Build (regenerates agent docs) and run the MCP catalog test**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && pnpm build`
Expected: build succeeds; `AGENT_INSTRUCTIONS.md` and `AGENT_CLI_INSTRUCTIONS.md` regenerate to include `link`/`unlink`/`links`/`readiness`.

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && pnpm --filter @ofocus/mcp test`
Expected: PASS — the tool catalog now matches `PRODUCTIVITY_TOOLS`.

- [ ] **Step 6: Commit**

```bash
git add packages/productivity/src/index.ts packages/cli/src/cli.ts packages/mcp/tests/fixtures/expected-tools.ts packages/productivity/README.md AGENT_INSTRUCTIONS.md AGENT_CLI_INSTRUCTIONS.md skills/ofocus/SKILL.md
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(links): surface link/unlink/links/readiness via CLI, MCP, and docs"
```

(If `pnpm build` regenerates additional doc files, include them in the same commit.)

---

### Task 8: Live UAT + clean gate + changeset

**Files:**
- Create: `packages/productivity/tests/uat/links.uat.test.ts`
- Create: `.changeset/ofocus-calendar-links.md`

- [ ] **Step 1: Write the UAT (auto-skips without OmniFocus)**

```typescript
/**
 * Live UAT for calendar links. Auto-skips when OmniFocus is not present.
 * Drives the built CLI against the real DB in a temp OFOCUS_STATE_DIR; uses a
 * synthetic event (ofocus never reads a calendar). Shape/sanity assertions only.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §5
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const omniFocusPresent = (() => {
  try {
    execFileSync("osascript", ["-e", 'application "OmniFocus" is running'], {
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
})();

const CLI = join(__dirname, "../../../cli/dist/index.js");

function run(args: string[], stateDir: string): unknown {
  const out = execFileSync("node", [CLI, ...args, "--format", "json"], {
    timeout: 30_000,
    env: { ...process.env, OFOCUS_STATE_DIR: stateDir },
    encoding: "utf8",
  });
  return JSON.parse(out);
}

describe("ofocus calendar links (UAT)", () => {
  let stateDir: string;
  let taskId: string | null = null;

  beforeAll(() => {
    stateDir = mkdtempSync(join(tmpdir(), "ofocus-links-uat-"));
    if (!omniFocusPresent) return;
    // Grab any incomplete task id to link.
    const res = run(["tasks", "--limit", "1", "--not-completed"], stateDir) as {
      success: boolean;
      data: { items?: { id: string }[] } | null;
    };
    taskId = res.data?.items?.[0]?.id ?? null;
  });

  afterAll(() => {
    if (stateDir) rmSync(stateDir, { recursive: true, force: true });
  });

  const EVENT = JSON.stringify({
    eventId: "uat-evt-1",
    title: "UAT sync",
    start: "2026-06-02T15:00:00.000Z",
    end: "2026-06-02T15:30:00.000Z",
  });

  (omniFocusPresent ? it : it.skip)(
    "link → links → readiness → unlink round-trip",
    () => {
      expect(taskId).not.toBeNull();
      const linked = run(["link", taskId!, "--type", "prep-for", "--event", EVENT], stateDir) as {
        success: boolean;
        data: { link: { taskId: string }; taskVerified: boolean } | null;
      };
      expect(linked.success).toBe(true);
      expect(linked.data!.link.taskId).toBe(taskId);

      const listed = run(["links", "--event-id", "uat-evt-1"], stateDir) as {
        success: boolean;
        data: { links: unknown[] } | null;
      };
      expect(listed.data!.links).toHaveLength(1);

      const ready = run(["readiness", "--event-id", "uat-evt-1"], stateDir) as {
        success: boolean;
        data: { verdict: string; total: number } | null;
      };
      expect(ready.success).toBe(true);
      expect(["ready", "not-ready", "at-risk"]).toContain(ready.data!.verdict);
      expect(ready.data!.total).toBe(1);

      const unlinked = run(
        ["unlink", taskId!, "--event-id", "uat-evt-1", "--type", "prep-for"],
        stateDir,
      ) as { success: boolean; data: { removed: boolean } | null };
      expect(unlinked.data!.removed).toBe(true);
    },
  );
});
```

- [ ] **Step 2: Run the UAT (skips or passes depending on OmniFocus)**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && pnpm build && npx vitest run packages/productivity/tests/uat/links.uat.test.ts`
Expected: PASS (or SKIP if OmniFocus is absent). If OmniFocus is present, the round-trip passes.

- [ ] **Step 3: Add a changeset**

Create `.changeset/ofocus-calendar-links.md`:
```markdown
---
"@ofocus/productivity": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Add calendar-conversance: link OmniFocus tasks to agent-supplied calendar events
(`prep-for` / `time-block`), with deterministic meeting readiness, lead-time, and
block-coverage computations and a `needsRefresh` staleness signal. `ofocus` never
reads a calendar; all event data is agent-supplied. Links persist behind a
pluggable `LinkStore` (local JSON by default).
```

(Confirm the exact published-package names by checking `.changeset/` history, e.g. `ls .changeset` and a prior changeset like `ofocus-resolve.md`; match the umbrella package name used there.)

- [ ] **Step 4: Run the clean gate**

Run: `cd /Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16 && pnpm build && pnpm lint && pnpm test`
Expected: build, lint, and tests all pass. (A single pre-existing live-OmniFocus UAT timeout flake in `changes.uat`/`temporal.uat` under load is acceptable and is skipped in CI.)

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/tests/uat/links.uat.test.ts .changeset/ofocus-calendar-links.md
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "test(links): live UAT + changeset for calendar conversance"
```

---

## Final review & PR

After all tasks: dispatch a final code review over the whole branch diff, then open the PR against `main` (the spec commit `6bd4ef4` is already on `claude/ofocus-calendar`). Use the `prep_pr` skill — it handles changeset detection, PR description, Copilot reviewer, CI monitoring, and the review worktree.

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- §2 link primitive (both directions) → Tasks 2, 5 (`byTask`/`byEvent`, `links` selectors). ✓
- §2 event snapshot + `needsRefresh` → Tasks 1, 3 (`EventSnapshot`, `eventNeedsRefresh`). ✓
- §2 pluggable adapter + conformance → Task 2 (`LinkStore`, `FileLinkStore`, `runLinkStoreConformance`). ✓
- §2 two link types + computations → Task 3 (`readiness` for prep-for, `blockCoverage` for time-block). ✓
- §3.1 data model / composite-key upsert → Tasks 1, 2. ✓
- §3.2 store (atomic, missing→empty, corrupt→failure, `OFOCUS_LINK_STORE` default file) → Task 2. *(Note: v1 ships only `file`; the `OFOCUS_LINK_STORE` env switch is not yet read — `realLinkDeps` always constructs `FileLinkStore`. This matches "v1 implements `file` only"; the unknown-value `VALIDATION_ERROR` is deferred with the adapter-selection logic to the first cloud adapter. Captured below.)*
- §3.3 computations → Task 3. ✓
- §3.4 four commands + `--event` JSON + default prep-for + `--now` → Tasks 5, 6. ✓
- §3.5 surfacing/reuse → Task 7. ✓
- §4 error handling (bad ISO, end<start, unknown task, persistence failure hard, reads lenient/corrupt→failure, unreachable OF) → Tasks 2, 5, 6. ✓
- §5 testing (pure, store+conformance, command, UAT) → Tasks 2–6, 8. ✓
- §6 file structure → matches the File Structure table. ✓

**Gap intentionally deferred (YAGNI, recorded):** §3.2's `OFOCUS_LINK_STORE` env switch + unknown-value validation is *not* implemented in v1 because only the `file` backend exists; wiring the selector before any second adapter would be dead code. The `LinkStore` interface + conformance suite (the parts that make a cloud adapter additive) *are* implemented. When the first cloud adapter lands, add the selector + unknown-value `VALIDATION_ERROR` then. This is the only deviation from the spec text and is consistent with the spec's own "v1 implements `file` only".

**2. Placeholder scan:** No TBD/TODO/"implement later"; every code step has complete code; every command step has exact paths and expected output. ✓

**3. Type consistency:** `LinkDeps` (store/fetchTaskStates/now) is shared by Tasks 5 and 6; `EventInput` (no capturedAt) vs `EventSnapshot` (with capturedAt) used consistently; `TaskState` fields (taskId/name/completed/estimatedMinutes/dueDate) identical across Tasks 1, 4, 5, 6; `readiness(event, entries, now)` signature matches between Task 3 definition and Task 6 call; `ListedLink.blockCoverage` optional (omitted, not undefined) honored. ✓

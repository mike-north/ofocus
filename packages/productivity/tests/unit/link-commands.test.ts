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

  it("rejects an unknown task with VALIDATION_ERROR or TASK_NOT_FOUND", async () => {
    const d = deps({ fetchTaskStates: () => Promise.resolve([]) });
    const out = await runLink({ taskId: "gone", event: EVENT }, d);
    expect(out.success).toBe(false);
    expect(out.error?.code).toBe("TASK_NOT_FOUND");
  });

  it("re-linking the same task+type+event upserts (one link, refreshed capturedAt)", async () => {
    const d = deps({ now: NOW });
    await runLink({ taskId: "t1", event: EVENT }, d);
    const later = { ...deps({ now: "2026-06-01T12:00:00.000Z" }), store: d.store };
    const out = await runLink({ taskId: "t1", event: { ...EVENT, title: "moved" } }, later);
    expect(out.success).toBe(true);
    const stored = await d.store.byTask("t1");
    expect(stored).toHaveLength(1);
    expect(stored[0]!.event.title).toBe("moved");
    expect(stored[0]!.event.capturedAt).toBe("2026-06-01T12:00:00.000Z");
  });

  it("persists an optional note when provided", async () => {
    const d = deps();
    const out = await runLink({ taskId: "t1", event: EVENT, note: "review agenda" }, d);
    expect(out.success).toBe(true);
    expect((await d.store.byTask("t1"))[0]!.note).toBe("review agenda");
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

  it("annotates needsRefresh=true for a stale snapshot", async () => {
    const stale: TaskEventLink = {
      taskId: "t1",
      linkType: "prep-for",
      event: { ...EVENT, capturedAt: "2026-05-30T09:00:00.000Z" }, // >24h before NOW
      createdAt: NOW,
    };
    const out = await runLinks({ task: "t1" }, deps({ store: memStore([stale]) }));
    expect(out.success).toBe(true);
    expect(out.data!.links[0]!.refresh.needsRefresh).toBe(true);
  });
});

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
    // NOW=10:00, event start 15:00 (>2h away), one pending task (30m, no due
    // date) → spec §3.3 yields "not-ready" (not at-risk, not ready).
    expect(out.data!.verdict).toBe("not-ready");
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
    // timeUntilEvent is computed from the new start (16:00), so it must be present
    expect(out.data!.tasks[0]!.timeUntilEvent).not.toBeNull();
  });

  it("OmniFocus unreachable → failure (results would be wrong)", async () => {
    const d = deps({ fetchTaskStates: () => Promise.reject(new Error("not running")) });
    const out = await runReadiness({ eventId: "evt-1" }, d);
    expect(out.success).toBe(false);
  });

  it("--now within 2h of the event → at-risk", async () => {
    // event start 15:00; now 13:30 is 1.5h away, prep still pending → at-risk
    const out = await runReadiness(
      { eventId: "evt-1", now: "2026-06-02T13:30:00.000Z" },
      deps(),
    );
    expect(out.success).toBe(true);
    expect(out.data!.verdict).toBe("at-risk");
  });

  it("a linked task with no live state is flagged taskMissing", async () => {
    // fetcher returns no state for the linked task id
    const out = await runReadiness(
      { eventId: "evt-1" },
      deps({ fetchTaskStates: () => Promise.resolve([]) }),
    );
    expect(out.success).toBe(true);
    expect(out.data!.tasks[0]!.taskMissing).toBe(true);
  });
});

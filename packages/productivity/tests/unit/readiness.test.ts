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
  needsRefresh,
  readiness,
  suggestedDue,
} from "../../src/links/readiness.js";
import type {
  EventSnapshot,
  PrepEntry,
  TaskEventLink,
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
  it("unparseable event dates → blockMinutes 0, covers false", () => {
    const bad = event({ start: "nope", end: "also-nope" });
    expect(blockCoverage(bad, 30)).toEqual({
      blockMinutes: 0,
      estimateMinutes: 30,
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
  it("snapshot exactly 24h old → no refresh (boundary, strict >)", () => {
    // NOW is 2026-06-02T10:00:00Z; exactly 24h earlier:
    const exactly = event({ capturedAt: "2026-06-01T10:00:00.000Z" });
    expect(eventNeedsRefresh(exactly, NOW, true).needsRefresh).toBe(false);
  });
  it("snapshot 24h + 1ms old → refresh (boundary)", () => {
    const justOver = event({ capturedAt: "2026-06-01T09:59:59.999Z" });
    expect(eventNeedsRefresh(justOver, NOW, true).needsRefresh).toBe(true);
  });
});

describe("needsRefresh (link wrapper)", () => {
  it("delegates to eventNeedsRefresh using the link's event; defaults taskOpen=true", () => {
    const link: TaskEventLink = {
      taskId: "t1",
      linkType: "prep-for",
      event: event({ capturedAt: "2026-05-31T09:00:00.000Z" }), // >24h stale
      createdAt: NOW,
    };
    expect(needsRefresh(link, NOW).needsRefresh).toBe(true);
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

  it("event exactly 2h away with pending prep → at-risk (boundary, <=)", () => {
    // NOW 13:00, event 15:00 → exactly 2h; suggestedDue 14:30 not yet passed.
    const entries: PrepEntry[] = [{ taskId: "t1", state: state() }];
    const r = readiness(event(), entries, "2026-06-02T13:00:00.000Z");
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

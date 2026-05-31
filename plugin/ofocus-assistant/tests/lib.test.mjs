import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PLUGIN_NAME,
  sessionKey,
  shouldSurface,
  shouldRefresh,
  endOfTodayMs,
  classifyUrgency,
  formatNudge,
  formatDigest,
  formatUrgent,
  readState,
  writeState,
  getSeenGeneration,
  getLastNudgedAt,
  recordSeen,
  recordSoftNudge,
  setLastRefresh,
  pruneSessions,
  resolveConfig,
  stateFilePath,
} from "../hooks/lib.mjs";

describe("scaffold", () => {
  it("exposes the plugin name", () => {
    expect(PLUGIN_NAME).toBe("ofocus-assistant");
  });
});

describe("sessionKey", () => {
  it("prefers session_id", () => {
    expect(sessionKey({ session_id: "s1", transcript_path: "/t" })).toBe("s1");
  });
  it("falls back to transcript_path", () => {
    expect(sessionKey({ transcript_path: "/p/x.jsonl" })).toBe("/p/x.jsonl");
  });
  it("falls back to _shared when neither present", () => {
    expect(sessionKey({})).toBe("_shared");
    expect(sessionKey({ session_id: "" })).toBe("_shared");
  });
});

describe("shouldSurface", () => {
  it("surfaces when pending non-empty and generation > seenGeneration", () => {
    expect(shouldSurface({ seenGeneration: 2, generation: 3, pendingNonEmpty: true })).toBe(true);
  });
  it("does not surface when generation == seen", () => {
    expect(shouldSurface({ seenGeneration: 3, generation: 3, pendingNonEmpty: true })).toBe(false);
  });
  it("does not surface when pending empty", () => {
    expect(shouldSurface({ seenGeneration: 0, generation: 9, pendingNonEmpty: false })).toBe(false);
  });
  it("treats a missing cursor (-1) as surfacing on any pending", () => {
    expect(shouldSurface({ seenGeneration: -1, generation: 0, pendingNonEmpty: true })).toBe(true);
  });
});

describe("shouldRefresh", () => {
  it("refreshes when no prior refresh", () => expect(shouldRefresh(null, 1000, 500)).toBe(true));
  it("refreshes when older than interval", () => expect(shouldRefresh("1970-01-01T00:00:00.000Z", 600, 500)).toBe(true));
  it("debounces when within interval", () => expect(shouldRefresh("1970-01-01T00:00:00.300Z", 600, 500)).toBe(false));
});

describe("endOfTodayMs", () => {
  it("is >= the instant and lands at hour 23 local", () => {
    const t = Date.parse("2026-05-30T10:00:00");
    const e = endOfTodayMs(t);
    expect(e).toBeGreaterThanOrEqual(t);
    expect(new Date(e).getHours()).toBe(23);
  });
});

describe("classifyUrgency", () => {
  const flaggedDelta = { changes: { updated: [{ object: { name: "X" }, delta: { flagged: { from: false, to: true } } }] } };
  const dueDelta = { changes: { updated: [{ object: { name: "Pay" }, delta: { dueDate: { from: "2026-06-10", to: "2026-05-30" } } }] } };
  const tagDelta = { changes: { updated: [{ object: { name: "T" }, delta: { tags: { from: [], to: ["agent"] } } }] } };
  const nonUrgent = { changes: { updated: [{ object: { name: "N" }, delta: { note: { from: "a", to: "b" } } }], added: [{ object: { name: "New" } }] } };
  const threshold = Date.parse("2026-05-30T23:59:59.999Z");

  it("flags a newly-flagged task as urgent", () => {
    expect(classifyUrgency(flaggedDelta, {})).toBe(true);
  });
  it("flags a task crossing into due-today/overdue as urgent (with threshold)", () => {
    expect(classifyUrgency(dueDelta, { dueThresholdMs: threshold })).toBe(true);
  });
  it("does NOT flag a future due date beyond the threshold", () => {
    const future = { changes: { updated: [{ object: { name: "F" }, delta: { dueDate: { from: null, to: "2026-12-01" } } }] } };
    expect(classifyUrgency(future, { dueThresholdMs: threshold })).toBe(false);
  });
  it("flags an agent-tag gain only when agentTag is configured", () => {
    expect(classifyUrgency(tagDelta, { agentTag: "agent" })).toBe(true);
    expect(classifyUrgency(tagDelta, {})).toBe(false);
  });
  it("treats note edits and added items as non-urgent", () => {
    expect(classifyUrgency(nonUrgent, { dueThresholdMs: threshold, agentTag: "agent" })).toBe(false);
  });
});

describe("formatNudge", () => {
  it("states the count and the follow-up instruction", () => {
    const m = formatNudge({ added: 2, updated: 1, removed: 0 });
    expect(m).toContain("3");
    expect(m).toMatch(/task list/i);
    expect(m).toMatch(/follow up/i);
  });
  it("is empty for an all-zero summary", () => {
    expect(formatNudge({ added: 0, updated: 0, removed: 0 })).toBe("");
  });
});

describe("formatDigest", () => {
  const payload = {
    summary: { added: 2, updated: 1, removed: 0 },
    changes: { added: [{ object: { name: "Call dentist" } }, { object: { name: "Milk" } }], updated: [{ object: { name: "Pay" } }], removed: [] },
  };
  it("summarizes counts and names items", () => {
    const d = formatDigest(payload);
    expect(d).toContain("2 added");
    expect(d).toContain("1 updated");
    expect(d).toContain("Call dentist");
  });
  it("is empty when nothing changed", () => {
    expect(formatDigest({ summary: { added: 0, updated: 0, removed: 0 }, changes: { added: [], updated: [], removed: [] } })).toBe("");
  });
});

describe("formatUrgent", () => {
  it("names the flagged task", () => {
    const m = formatUrgent({ changes: { updated: [{ object: { name: "Call boss" }, delta: { flagged: { from: false, to: true } } }] } }, {});
    expect(m).toContain("Call boss");
    expect(m).toMatch(/flag/i);
  });
  it("is empty when nothing urgent", () => {
    expect(formatUrgent({ changes: { updated: [] } }, {})).toBe("");
  });
});

describe("hook state", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofa-state-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const path = () => join(dir, "hook-state.json");

  it("returns {} when absent", () => expect(readState(path())).toEqual({}));
  it("getSeenGeneration is -1 for unknown", () => expect(getSeenGeneration({}, "agent", "s")).toBe(-1));

  it("recordSeen advances per session without disturbing others", () => {
    let st = recordSeen({}, "agent", "A", 3, "2026-05-30T00:00:00.000Z");
    st = recordSeen(st, "agent", "B", 1, "2026-05-30T00:00:00.000Z");
    expect(getSeenGeneration(st, "agent", "A")).toBe(3);
    expect(getSeenGeneration(st, "agent", "B")).toBe(1);
  });

  it("recordSoftNudge sets lastNudgedAt and does NOT advance lastSeenGeneration", () => {
    let st = recordSeen({}, "agent", "A", 2, "2026-05-30T00:00:00.000Z");
    st = recordSoftNudge(st, "agent", "A", "2026-05-30T01:00:00.000Z");
    expect(getSeenGeneration(st, "agent", "A")).toBe(2); // unchanged
    expect(getLastNudgedAt(st, "agent", "A")).toBe("2026-05-30T01:00:00.000Z");
  });

  it("recordSeen preserves an existing lastNudgedAt", () => {
    let st = recordSoftNudge({}, "agent", "A", "2026-05-30T01:00:00.000Z");
    st = recordSeen(st, "agent", "A", 5, "2026-05-30T02:00:00.000Z");
    expect(getLastNudgedAt(st, "agent", "A")).toBe("2026-05-30T01:00:00.000Z");
    expect(getSeenGeneration(st, "agent", "A")).toBe(5);
  });

  it("GC prunes sessions older than the window", () => {
    let st = recordSeen({}, "agent", "old", 1, "2020-01-01T00:00:00.000Z");
    st = recordSeen(st, "agent", "new", 2, "2026-05-30T00:00:00.000Z");
    const pruned = pruneSessions(st, Date.parse("2026-05-30T00:00:00.000Z"), 7 * 24 * 3600 * 1000);
    expect(getSeenGeneration(pruned, "agent", "old")).toBe(-1);
    expect(getSeenGeneration(pruned, "agent", "new")).toBe(2);
  });

  it("setLastRefresh is per-watch and round-trips", () => {
    let st = setLastRefresh({}, "agent", "2026-05-30T00:00:00.000Z");
    writeState(path(), st);
    expect(readState(path())["agent"].lastRefreshAt).toBe("2026-05-30T00:00:00.000Z");
  });
});

describe("resolveConfig", () => {
  it("defaults", () => {
    const c = resolveConfig({});
    expect(c).toMatchObject({ watch: "agent", refreshIntervalMs: 300000, nudgeIntervalMs: 600000, urgentDueToday: true, agentTag: null, bin: "ofocus", disabled: false });
    expect(c.stateDir.length).toBeGreaterThan(0);
  });
  it("honors overrides", () => {
    const c = resolveConfig({
      OFOCUS_ASSISTANT_WATCH: "work",
      OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS: "60000",
      OFOCUS_ASSISTANT_NUDGE_INTERVAL_MS: "120000",
      OFOCUS_ASSISTANT_URGENT_DUE_TODAY: "false",
      OFOCUS_ASSISTANT_AGENT_TAG: "agent",
      OFOCUS_BIN: "/x/ofocus",
      OFOCUS_ASSISTANT_DISABLE: "1",
      OFOCUS_STATE_DIR: "/tmp/x",
    });
    expect(c).toMatchObject({ watch: "work", refreshIntervalMs: 60000, nudgeIntervalMs: 120000, urgentDueToday: false, agentTag: "agent", bin: "/x/ofocus", disabled: true, stateDir: "/tmp/x" });
  });
  it("ignores a non-numeric interval", () => {
    expect(resolveConfig({ OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS: "abc" }).refreshIntervalMs).toBe(300000);
  });
  it("stateFilePath joins hook-state.json", () => {
    expect(stateFilePath("/tmp/x")).toBe(join("/tmp/x", "hook-state.json"));
  });
});

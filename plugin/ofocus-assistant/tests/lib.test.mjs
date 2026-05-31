import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PLUGIN_NAME } from "../hooks/lib.mjs";
import { sessionKey } from "../hooks/lib.mjs";
import { shouldNudge, shouldRefresh } from "../hooks/lib.mjs";
import { formatNudge, formatDigest } from "../hooks/lib.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState, writeState, getCursor, recordNudge, setLastRefresh, pruneSessions } from "../hooks/lib.mjs";
import { resolveConfig } from "../hooks/lib.mjs";

describe("plugin scaffold", () => {
  it("exposes the plugin name", () => {
    expect(PLUGIN_NAME).toBe("ofocus-assistant");
  });
});

describe("sessionKey", () => {
  it("prefers session_id", () => {
    expect(sessionKey({ session_id: "s1", transcript_path: "/t" })).toBe("s1");
  });
  it("falls back to transcript_path", () => {
    expect(sessionKey({ transcript_path: "/path/x.jsonl" })).toBe("/path/x.jsonl");
  });
  it("falls back to _shared when neither present", () => {
    expect(sessionKey({})).toBe("_shared");
    expect(sessionKey({ session_id: "" })).toBe("_shared");
  });
});

describe("shouldNudge", () => {
  it("nudges when pending is non-empty and generation > cursor", () => {
    expect(shouldNudge({ cursor: 2, generation: 3, pendingNonEmpty: true })).toBe(true);
  });
  it("does not nudge when generation == cursor", () => {
    expect(shouldNudge({ cursor: 3, generation: 3, pendingNonEmpty: true })).toBe(false);
  });
  it("does not nudge when pending is empty", () => {
    expect(shouldNudge({ cursor: 0, generation: 5, pendingNonEmpty: false })).toBe(false);
  });
  it("treats a missing cursor as -1", () => {
    expect(shouldNudge({ cursor: -1, generation: 0, pendingNonEmpty: true })).toBe(true);
  });
});

describe("shouldRefresh", () => {
  it("refreshes when no prior refresh", () => {
    expect(shouldRefresh(null, 1000, 500)).toBe(true);
  });
  it("refreshes when older than the interval", () => {
    expect(shouldRefresh("1970-01-01T00:00:00.000Z", 600, 500)).toBe(true);
  });
  it("debounces when within the interval", () => {
    expect(shouldRefresh("1970-01-01T00:00:00.300Z", 600, 500)).toBe(false);
  });
});

const summary = { added: 2, updated: 1, removed: 0 };
const changesPayload = {
  summary,
  changes: {
    added: [{ object: { name: "Call dentist" } }, { object: { name: "Buy milk" } }],
    updated: [{ object: { name: "Pay invoice" }, delta: { dueDate: { from: "2026-06-02", to: "2026-05-30" } } }],
    removed: [],
  },
};

describe("formatNudge", () => {
  it("states the total item count and the self-dedup instruction", () => {
    const msg = formatNudge(summary);
    expect(msg).toContain("3");
    expect(msg).toMatch(/task list/i);
  });
  it("returns empty string for an all-zero summary", () => {
    expect(formatNudge({ added: 0, updated: 0, removed: 0 })).toBe("");
  });
});

describe("formatDigest", () => {
  it("summarizes counts and names a few items", () => {
    const d = formatDigest(changesPayload);
    expect(d).toContain("2 added");
    expect(d).toContain("1 updated");
    expect(d).toContain("Call dentist");
  });
  it("returns empty string when nothing changed", () => {
    expect(formatDigest({ summary: { added: 0, updated: 0, removed: 0 }, changes: { added: [], updated: [], removed: [] } })).toBe("");
  });
});

describe("hook state", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofa-state-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const path = () => join(dir, "hook-state.json");

  it("returns an empty object when the state file is absent", () => {
    expect(readState(path())).toEqual({});
  });
  it("getCursor returns -1 for an unknown session", () => {
    expect(getCursor({}, "agent", "s1")).toBe(-1);
  });
  it("recordNudge stores the cursor per session without disturbing others", () => {
    let st = recordNudge({}, "agent", "A", 3, "2026-05-30T00:00:00.000Z");
    st = recordNudge(st, "agent", "B", 1, "2026-05-30T00:00:00.000Z");
    expect(getCursor(st, "agent", "A")).toBe(3);
    expect(getCursor(st, "agent", "B")).toBe(1);
  });
  it("GC prunes sessions older than the window", () => {
    let st = recordNudge({}, "agent", "old", 1, "2020-01-01T00:00:00.000Z");
    st = recordNudge(st, "agent", "new", 2, "2026-05-30T00:00:00.000Z");
    const nowMs = Date.parse("2026-05-30T00:00:00.000Z");
    const pruned = pruneSessions(st, nowMs, 7 * 24 * 3600 * 1000);
    expect(getCursor(pruned, "agent", "old")).toBe(-1);
    expect(getCursor(pruned, "agent", "new")).toBe(2);
  });
  it("setLastRefresh is per-watch and round-trips through write/read", () => {
    let st = setLastRefresh({}, "agent", "2026-05-30T00:00:00.000Z");
    writeState(path(), st);
    expect(readState(path())["agent"].lastRefreshAt).toBe("2026-05-30T00:00:00.000Z");
  });
});

describe("resolveConfig", () => {
  it("uses defaults when env is empty", () => {
    const c = resolveConfig({});
    expect(c.watch).toBe("agent");
    expect(c.refreshIntervalMs).toBe(300000);
    expect(c.bin).toBe("ofocus");
    expect(c.disabled).toBe(false);
    expect(c.stateDir.length).toBeGreaterThan(0);
  });
  it("honors env overrides", () => {
    const c = resolveConfig({
      OFOCUS_ASSISTANT_WATCH: "work",
      OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS: "60000",
      OFOCUS_BIN: "/usr/local/bin/ofocus",
      OFOCUS_ASSISTANT_DISABLE: "1",
      OFOCUS_STATE_DIR: "/tmp/x",
    });
    expect(c).toMatchObject({ watch: "work", refreshIntervalMs: 60000, bin: "/usr/local/bin/ofocus", disabled: true, stateDir: "/tmp/x" });
  });
  it("ignores a non-numeric interval and uses the default", () => {
    expect(resolveConfig({ OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS: "abc" }).refreshIntervalMs).toBe(300000);
  });
});

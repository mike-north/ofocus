import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PLUGIN_NAME } from "../hooks/lib.mjs";
import { sessionKey } from "../hooks/lib.mjs";
import { shouldNudge, shouldRefresh } from "../hooks/lib.mjs";
import { formatNudge, formatDigest } from "../hooks/lib.mjs";

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

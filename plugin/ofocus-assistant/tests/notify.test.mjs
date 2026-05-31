import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const NOTIFY = resolve(here, "../hooks/notify.mjs");

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofa-notify-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// Stub `ofocus`: prints the given envelope JSON for any args.
function stubOfocus(envelope) {
  const bin = join(dir, "ofocus");
  writeFileSync(bin, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(envelope))});\n`, "utf8");
  chmodSync(bin, 0o755);
  return bin;
}
function seedState(state) {
  writeFileSync(join(dir, "hook-state.json"), JSON.stringify(state), "utf8");
}
function run(payload, envelope, extraEnv = {}) {
  const bin = stubOfocus(envelope);
  const out = execFileSync("node", [NOTIFY], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    // Large refresh interval so tests don't spawn detached refreshes.
    env: { ...process.env, OFOCUS_BIN: bin, OFOCUS_STATE_DIR: dir, OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS: "999999999", ...extraEnv },
  });
  return out.trim() ? JSON.parse(out) : {};
}
const env = (gen, summary, changes) => ({ success: true, data: { generation: gen, summary, changes }, error: null });
const flaggedUrgent = env(4, { added: 0, updated: 1, removed: 0 }, { added: [], updated: [{ object: { name: "Pay boss" }, delta: { flagged: { from: false, to: true } } }], removed: [] });
const nonUrgent = env(4, { added: 1, updated: 1, removed: 0 }, { added: [{ object: { name: "New inbox" } }], updated: [{ object: { name: "Note edit" }, delta: { note: { from: "a", to: "b" } } }], removed: [] });
const empty = env(4, { added: 0, updated: 0, removed: 0 }, { added: [], updated: [], removed: [] });

describe("notify.mjs (tiered model)", () => {
  it("SessionStart surfaces a digest via additionalContext when pending+new", () => {
    const out = run({ hook_event_name: "SessionStart", session_id: "s1" }, nonUrgent);
    expect(out.hookSpecificOutput?.additionalContext).toMatch(/New inbox|added/);
  });

  it("Stop surfaces a digest via systemMessage when pending+new", () => {
    const out = run({ hook_event_name: "Stop", session_id: "s1" }, nonUrgent);
    expect(out.systemMessage).toMatch(/OmniFocus changes/);
  });

  it("PreToolUse interjects URGENT (flagged) via systemMessage and advances the cursor", () => {
    const out1 = run({ hook_event_name: "PreToolUse", session_id: "s1" }, flaggedUrgent);
    expect(out1.systemMessage).toMatch(/⚠️|flag/i);
    const out2 = run({ hook_event_name: "PreToolUse", session_id: "s1" }, flaggedUrgent); // same gen → quiet
    expect(out2.systemMessage ?? "").toBe("");
  });

  it("PreToolUse soft-nudges a NON-urgent change and does NOT advance the cursor", () => {
    const soft = run({ hook_event_name: "PreToolUse", session_id: "s1" }, nonUrgent);
    expect(soft.systemMessage).toMatch(/📥|task list/i);
    // cursor not advanced → a subsequent Stop still surfaces the authoritative digest
    const stop = run({ hook_event_name: "Stop", session_id: "s1" }, nonUrgent);
    expect(stop.systemMessage).toMatch(/OmniFocus changes/);
  });

  it("PreToolUse soft-nudge is throttled by NUDGE_INTERVAL", () => {
    seedState({ agent: { lastRefreshAt: new Date().toISOString(), sessions: { s1: { lastSeenGeneration: 1, lastNudgedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() } } } });
    const out = run({ hook_event_name: "PreToolUse", session_id: "s1" }, nonUrgent); // recently nudged → quiet
    expect(out.systemMessage ?? "").toBe("");
  });

  it("multi-agent: session B still surfaces after A advanced its own cursor", () => {
    run({ hook_event_name: "Stop", session_id: "A" }, nonUrgent); // A advances
    const outB = run({ hook_event_name: "Stop", session_id: "B" }, nonUrgent);
    expect(outB.systemMessage).toMatch(/OmniFocus changes/);
  });

  it("is quiet when nothing is pending", () => {
    const out = run({ hook_event_name: "PreToolUse", session_id: "s1" }, empty);
    expect(out.systemMessage ?? "").toBe("");
  });

  it("fails open (empty output, exit 0) when ofocus errors", () => {
    const out = execFileSync("node", [NOTIFY], {
      input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s1" }),
      encoding: "utf8",
      env: { ...process.env, OFOCUS_BIN: join(dir, "missing"), OFOCUS_STATE_DIR: dir },
    });
    expect(out.trim()).toBe("");
  });

  it("DISABLE makes it a silent no-op", () => {
    const out = run({ hook_event_name: "PreToolUse", session_id: "s1" }, flaggedUrgent, { OFOCUS_ASSISTANT_DISABLE: "1" });
    expect(out).toEqual({});
  });
});

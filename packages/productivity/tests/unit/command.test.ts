import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChanges, type ChangesDeps } from "../../src/changes/command.js";
import { computeFingerprint } from "../../src/changes/fingerprint.js";
import type { Snapshot } from "../../src/changes/types.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofocus-cmd-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const snapV1: Snapshot = { tasks: { a: { id: "a", modified: "2026-05-30T01:00:00.000Z", fields: { name: "A", flagged: false } } }, projects: {} };
const snapV2: Snapshot = { tasks: { a: { id: "a", modified: "2026-05-30T09:00:00.000Z", fields: { name: "A", flagged: true } } }, projects: {} };

function deps(snapshot: Snapshot): ChangesDeps {
  return {
    scanWatched: async () => snapshot,
    scanFingerprint: async () => computeFingerprint(snapshot, null),
    stateDir: dir,
    now: "2026-05-30T10:00:00.000Z",
  };
}

describe("runChanges", () => {
  it("first run baselines without dumping every object as added", async () => {
    const out = await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    expect(out.success).toBe(true);
    expect(out.data!.baselined).toBe(true);
    expect(out.data!.summary).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("--fresh reports a field-level delta on the second run", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    const out = await runChanges({ watch: "w", fresh: true }, deps(snapV2));
    expect(out.data!.summary.updated).toBe(1);
    expect(out.data!.changes.updated[0]!.delta).toEqual({ flagged: { from: false, to: true } });
  });

  it("--fresh returns notModified when nothing changed", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    const out = await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    expect(out.data!.notModified).toBe(true);
    expect(out.data!.summary).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("background refresh accumulates pending; --pending drains it and advances generation", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    await runChanges({ watch: "w", refreshInline: true }, deps(snapV2));
    const out = await runChanges({ watch: "w", pending: true }, deps(snapV2));
    expect(out.data!.summary.updated).toBe(1);
    expect(out.data!.generation).toBe(1);
    const again = await runChanges({ watch: "w", pending: true }, deps(snapV2));
    expect(again.data!.notModified).toBe(true);
  });

  it("--pending with generation-since ahead of current does NOT discard undelivered pending", async () => {
    // Regression: a stale/racing caller passing --generation-since beyond the
    // current generation must not wipe pending deltas it never saw.
    await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    await runChanges({ watch: "w", refreshInline: true }, deps(snapV2)); // accumulates updated:1 at generation 1
    const ahead = await runChanges(
      { watch: "w", pending: true, generationSince: 5 },
      deps(snapV2),
    );
    expect(ahead.data!.notModified).toBe(true);
    expect(ahead.data!.summary.updated).toBe(0);
    // The pending delta must survive and be delivered on a normal in-range drain.
    const drain = await runChanges({ watch: "w", pending: true }, deps(snapV2));
    expect(drain.data!.summary.updated).toBe(1);
  });

  it("default cached read returns stale and triggers a background refresh", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    let spawned = 0;
    const d: ChangesDeps = { ...deps(snapV1), spawnBackgroundRefresh: () => { spawned += 1; } };
    const out = await runChanges({ watch: "w" }, d);
    expect(out.data!.stale).toBe(true);
    expect(spawned).toBe(1);
  });
});

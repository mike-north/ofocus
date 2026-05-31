import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChanges, type ChangesDeps } from "../../src/changes/command.js";
import { computeFingerprint } from "../../src/changes/fingerprint.js";
import type { Snapshot } from "../../src/changes/types.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ofocus-sem-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const v1: Snapshot = {
  tasks: { a: { id: "a", modified: "2026-05-30T01:00:00.000Z", fields: { flagged: false } } },
  projects: {},
};
const v2: Snapshot = {
  tasks: { a: { id: "a", modified: "2026-05-30T09:00:00.000Z", fields: { flagged: true } } },
  projects: {},
};

function deps(snapshot: Snapshot, over: Partial<ChangesDeps> = {}): ChangesDeps {
  return {
    scanWatched: async () => snapshot,
    scanFingerprint: async () => computeFingerprint(snapshot, null),
    stateDir: dir,
    now: "2026-05-30T10:00:00.000Z",
    ...over,
  };
}

describe("--semantic", () => {
  it("attaches a summary from the injected summarizer on --fresh", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(v1));
    const out = await runChanges(
      { watch: "w", fresh: true, semantic: true },
      deps(v2, { summarize: async () => ({ summary: "you flagged task A" }) }),
    );
    expect(out.data!.semanticSummary).toBe("you flagged task A");
    expect(out.data!.summaryNote).toBeUndefined();
  });

  it("fails open: attaches summaryNote, not summary, and does not throw", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(v1));
    const out = await runChanges(
      { watch: "w", fresh: true, semantic: true },
      deps(v2, { summarize: async () => ({ note: "no model configured" }) }),
    );
    expect(out.data!.semanticSummary).toBeUndefined();
    expect(out.data!.summaryNote).toBe("no model configured");
  });

  it("does not call the summarizer when --semantic is absent", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(v1));
    let called = 0;
    const out = await runChanges(
      { watch: "w", fresh: true },
      deps(v2, {
        summarize: async () => {
          called += 1;
          return { summary: "x" };
        },
      }),
    );
    expect(called).toBe(0);
    expect(out.data!.semanticSummary).toBeUndefined();
  });
});

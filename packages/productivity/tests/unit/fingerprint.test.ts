import { describe, it, expect } from "vitest";
import {
  computeFingerprint,
  fingerprintsEqual,
} from "../../src/changes/fingerprint.js";
import type { Snapshot } from "../../src/changes/types.js";

const snap = (): Snapshot => ({
  tasks: {
    a: { id: "a", modified: "2026-05-30T01:00:00.000Z", fields: { name: "A" } },
    b: { id: "b", modified: "2026-05-30T02:00:00.000Z", fields: { name: "B" } },
  },
  projects: {
    p: { id: "p", modified: "2026-05-29T00:00:00.000Z", fields: { name: "P" } },
  },
});

describe("computeFingerprint", () => {
  it("counts objects and picks max modified per class", () => {
    const fp = computeFingerprint(snap(), null);
    expect(fp.classes.tasks).toEqual({
      count: 2,
      maxModified: "2026-05-30T02:00:00.000Z",
    });
    expect(fp.classes.projects).toEqual({
      count: 1,
      maxModified: "2026-05-29T00:00:00.000Z",
    });
    expect(fp.lastSyncDate).toBeNull();
  });

  it("reports null maxModified for an empty class", () => {
    const fp = computeFingerprint({ tasks: {} }, null);
    expect(fp.classes.tasks).toEqual({ count: 0, maxModified: null });
  });
});

describe("fingerprintsEqual", () => {
  it("is true for identical fingerprints", () => {
    expect(
      fingerprintsEqual(
        computeFingerprint(snap(), "2026-01-01T00:00:00.000Z"),
        computeFingerprint(snap(), "2026-01-01T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("detects an added object (count change)", () => {
    const more = snap();
    const tasksMap = more.tasks;
    if (tasksMap === undefined) throw new Error("tasks must be defined");
    tasksMap["c"] = {
      id: "c",
      modified: "2026-05-30T03:00:00.000Z",
      fields: { name: "C" },
    };
    expect(
      fingerprintsEqual(
        computeFingerprint(snap(), null),
        computeFingerprint(more, null),
      ),
    ).toBe(false);
  });

  it("detects an edit (maxModified change)", () => {
    const edited = snap();
    const tasksMap = edited.tasks;
    if (tasksMap === undefined) throw new Error("tasks must be defined");
    const bEntry = tasksMap["b"];
    if (bEntry === undefined) throw new Error("entry b must be defined");
    bEntry.modified = "2026-05-30T09:00:00.000Z";
    expect(
      fingerprintsEqual(
        computeFingerprint(snap(), null),
        computeFingerprint(edited, null),
      ),
    ).toBe(false);
  });

  it("detects a sync (lastSyncDate change)", () => {
    expect(
      fingerprintsEqual(
        computeFingerprint(snap(), "2026-01-01T00:00:00.000Z"),
        computeFingerprint(snap(), "2026-02-01T00:00:00.000Z"),
      ),
    ).toBe(false);
  });
});

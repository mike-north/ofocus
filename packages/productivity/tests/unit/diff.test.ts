import { describe, it, expect } from "vitest";
import { diffSnapshots } from "../../src/changes/diff.js";
import type { Snapshot, WatchedObject } from "../../src/changes/types.js";

const obj = (id: string, fields: Record<string, unknown>, modified = "2026-05-30T01:00:00.000Z"): WatchedObject =>
  ({ id, modified, fields });

describe("diffSnapshots", () => {
  it("reports an added object with its full representation", () => {
    const prev: Snapshot = { tasks: {} };
    const next: Snapshot = { tasks: { a: obj("a", { name: "A", flagged: false }) } };
    const cs = diffSnapshots(prev, next);
    expect(cs.added).toHaveLength(1);
    expect(cs.added[0]).toMatchObject({ id: "a", class: "tasks", object: { name: "A", flagged: false } });
    expect(cs.added[0]!.delta).toBeUndefined();
    expect(cs.updated).toHaveLength(0);
    expect(cs.removed).toHaveLength(0);
  });

  it("reports a removed object with its last-known representation", () => {
    const prev: Snapshot = { tasks: { a: obj("a", { name: "A" }) } };
    const next: Snapshot = { tasks: {} };
    const cs = diffSnapshots(prev, next);
    expect(cs.removed).toHaveLength(1);
    expect(cs.removed[0]).toMatchObject({ id: "a", class: "tasks", object: { name: "A" } });
  });

  it("reports field-level deltas for an updated object", () => {
    const prev: Snapshot = { tasks: { a: obj("a", { name: "A", flagged: false, dueDate: "2026-06-02" }) } };
    const next: Snapshot = { tasks: { a: obj("a", { name: "A", flagged: true, dueDate: "2026-05-30" }, "2026-05-30T09:00:00.000Z") } };
    const cs = diffSnapshots(prev, next);
    expect(cs.updated).toHaveLength(1);
    expect(cs.updated[0]!.delta).toEqual({
      flagged: { from: false, to: true },
      dueDate: { from: "2026-06-02", to: "2026-05-30" },
    });
    expect(cs.updated[0]!.object).toEqual({ name: "A", flagged: true, dueDate: "2026-05-30" });
  });

  it("does NOT report an update when only modified changed but watched fields did not", () => {
    const prev: Snapshot = { tasks: { a: obj("a", { name: "A" }, "2026-05-30T01:00:00.000Z") } };
    const next: Snapshot = { tasks: { a: obj("a", { name: "A" }, "2026-05-30T09:00:00.000Z") } };
    expect(diffSnapshots(prev, next).updated).toHaveLength(0);
  });

  it("compares array fields by value (tags)", () => {
    const prev: Snapshot = { tasks: { a: obj("a", { tags: ["home"] }) } };
    const next: Snapshot = { tasks: { a: obj("a", { tags: ["home", "urgent"] }) } };
    const cs = diffSnapshots(prev, next);
    expect(cs.updated[0]!.delta).toEqual({ tags: { from: ["home"], to: ["home", "urgent"] } });
  });
});

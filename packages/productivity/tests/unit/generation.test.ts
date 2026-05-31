import { describe, it, expect } from "vitest";
import { mergeChangeSets, accumulatePending } from "../../src/changes/generation.js";
import type { CacheFile } from "../../src/changes/cache.js";
import type { ChangeSet } from "../../src/changes/types.js";

const cs = (over: Partial<ChangeSet>): ChangeSet => ({ added: [], updated: [], removed: [], ...over });

describe("mergeChangeSets", () => {
  it("concatenates two change sets, later updates overriding earlier per id", () => {
    const a = cs({ updated: [{ id: "x", class: "tasks", object: { f: 1 }, delta: { f: { from: 0, to: 1 } } }] });
    const b = cs({ updated: [{ id: "x", class: "tasks", object: { f: 2 }, delta: { f: { from: 1, to: 2 } } }] });
    const merged = mergeChangeSets(a, b);
    expect(merged.updated).toHaveLength(1);
    expect(merged.updated[0]!.object).toEqual({ f: 2 });
  });

  it("a removal after an add cancels both", () => {
    const a = cs({ added: [{ id: "y", class: "tasks", object: {} }] });
    const b = cs({ removed: [{ id: "y", class: "tasks", object: {} }] });
    const merged = mergeChangeSets(a, b);
    expect(merged.added).toHaveLength(0);
    expect(merged.removed).toHaveLength(0);
  });
});

describe("accumulatePending", () => {
  it("bumps generation and merges into pending when there are changes", () => {
    const cache = { generation: 3, pending: cs({}) } as CacheFile;
    const next = accumulatePending(cache, cs({ added: [{ id: "z", class: "tasks", object: {} }] }));
    expect(next.generation).toBe(4);
    expect(next.pending.added).toHaveLength(1);
  });

  it("does NOT bump generation when the change set is empty", () => {
    const cache = { generation: 3, pending: cs({}) } as CacheFile;
    const next = accumulatePending(cache, cs({}));
    expect(next.generation).toBe(3);
  });
});

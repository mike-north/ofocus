import { describe, it, expect } from "vitest";
import { shouldSpawnRefresh } from "../../src/changes/refresh.js";
import type { CacheFile } from "../../src/changes/cache.js";

const base = (over: Partial<CacheFile>): CacheFile => ({
  version: 1, name: "w", scope: {}, classes: ["tasks"],
  fingerprint: { classes: {}, lastSyncDate: null }, snapshot: {},
  generation: 0, deliveredGeneration: 0,
  pending: { added: [], updated: [], removed: [] },
  semanticByGeneration: {}, refreshLock: null, updatedAt: "2026-05-30T00:00:00.000Z",
  ...over,
});

describe("shouldSpawnRefresh", () => {
  it("spawns when there is no lock and the cache is older than the debounce", () => {
    expect(shouldSpawnRefresh(base({ updatedAt: "2026-05-30T00:00:00.000Z" }), "2026-05-30T00:01:00.000Z", 5000, [])).toBe(true);
  });
  it("does not spawn when a fresh lock is held by a live pid", () => {
    expect(shouldSpawnRefresh(base({ refreshLock: { pid: 4242, startedAt: "2026-05-30T00:00:59.000Z" } }), "2026-05-30T00:01:00.000Z", 5000, [4242])).toBe(false);
  });
  it("reclaims a stale lock whose pid is dead", () => {
    expect(shouldSpawnRefresh(base({ refreshLock: { pid: 4242, startedAt: "2026-05-30T00:00:59.000Z" } }), "2026-05-30T00:01:00.000Z", 5000, [])).toBe(true);
  });
  it("debounces when the last refresh is younger than the interval", () => {
    expect(shouldSpawnRefresh(base({ updatedAt: "2026-05-30T00:00:59.000Z" }), "2026-05-30T00:01:00.000Z", 5000, [])).toBe(false);
  });
});

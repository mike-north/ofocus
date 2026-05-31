import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCachePath, readCache, writeCache, sanitizeWatchName, type CacheFile } from "../../src/changes/cache.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofocus-cache-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const sample = (): CacheFile => ({
  version: 1,
  name: "inbox",
  scope: {},
  classes: ["tasks", "projects"],
  fingerprint: { classes: {}, lastSyncDate: null },
  snapshot: {},
  generation: 0,
  deliveredGeneration: 0,
  pending: { added: [], updated: [], removed: [] },
  semanticByGeneration: {},
  refreshLock: null,
  updatedAt: "2026-05-30T00:00:00.000Z",
});

describe("cache persistence", () => {
  it("resolveCachePath honors stateDir and uses <name>.json", () => {
    expect(resolveCachePath("inbox", dir)).toBe(join(dir, "watch", "inbox.json"));
  });

  it("writes then reads back an identical cache", () => {
    const path = resolveCachePath("inbox", dir);
    writeCache(path, sample());
    expect(readCache(path)).toEqual(sample());
  });

  it("returns null when the cache file is absent (first run)", () => {
    expect(readCache(resolveCachePath("missing", dir))).toBeNull();
  });

  it("backs up and returns null for a corrupt cache file", () => {
    const path = resolveCachePath("inbox", dir);
    writeCache(path, sample());                 // creates dir + valid file
    writeFileSync(path, "{ this is not json");   // corrupt it
    expect(readCache(path)).toBeNull();
    const backups = readdirSync(join(dir, "watch")).filter((f) => f.includes("corrupt"));
    expect(backups.length).toBe(1);
  });

  it("sanitizes watch names to a safe filename component", () => {
    expect(sanitizeWatchName("inbox")).toBe("inbox");
    expect(sanitizeWatchName("my-watch_2")).toBe("my-watch_2");
    expect(sanitizeWatchName("../../etc/passwd")).toBe("______etc_passwd");
    expect(sanitizeWatchName("a/b")).toBe("a_b");
    expect(sanitizeWatchName("   ")).toBe("default");
    expect(sanitizeWatchName("")).toBe("default");
  });

  it("prevents path traversal: a malicious watch name stays under <stateDir>/watch", () => {
    // Regression (PR #55 review): `--watch ../../foo` must not escape the watch dir.
    const watchDir = join(dir, "watch");
    const path = resolveCachePath("../../escape", dir);
    expect(path.startsWith(watchDir)).toBe(true);
    expect(path).not.toContain("..");
  });
});

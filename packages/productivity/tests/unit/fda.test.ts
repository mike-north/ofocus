import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDbMtime } from "../../src/changes/fda.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofocus-fda-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("readDbMtime", () => {
  it("returns an ISO mtime when the package dir is readable", () => {
    const pkg = join(dir, "OmniFocus.ofocus");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "txn1.zip"), "x");
    const t = new Date("2026-05-30T03:00:00.000Z");
    utimesSync(pkg, t, t);
    const mtime = readDbMtime(pkg);
    expect(mtime).toBe("2026-05-30T03:00:00.000Z");
  });

  it("returns null when the path is unreadable / absent (graceful fallback)", () => {
    expect(readDbMtime(join(dir, "does-not-exist.ofocus"))).toBeNull();
  });
});

/**
 * Unit tests for `isMainModule` — correct main-module detection through a
 * symlinked bin (the global-install layout: `bin/foo -> dist/index.js`).
 *
 * @see packages/sdk/src/utils/is-main-module.ts
 */
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isMainModule } from "../../src/utils/is-main-module.js";

describe("isMainModule", () => {
  const savedArgv1 = process.argv[1];
  let dir: string;
  let realFile: string;
  let realUrl: string;
  let link: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ismain-"));
    realFile = join(dir, "real-entry.mjs");
    writeFileSync(realFile, "// entry\n", "utf8");
    // The entry's import.meta.url is its REAL path. On macOS tmpdir() sits under
    // /var -> /private/var, so resolve symlinks here too for a faithful comparison.
    realUrl = pathToFileURL(realpathSync(realFile)).href;
    link = join(dir, "bin-link");
    symlinkSync(realFile, link); // mimic a global bin symlink
  });

  afterEach(() => {
    process.argv[1] = savedArgv1;
    rmSync(dir, { recursive: true, force: true });
  });

  it("true when argv[1] is a symlink to the entry (global-bin layout)", () => {
    // A global bin is invoked via its symlink path; import.meta.url is the real path.
    process.argv[1] = link;
    expect(isMainModule(realUrl)).toBe(true);
  });

  it("true when argv[1] is the real entry path directly", () => {
    process.argv[1] = realFile;
    expect(isMainModule(realUrl)).toBe(true);
  });

  it("false when the running script is a different module (imported as a library)", () => {
    process.argv[1] = realFile;
    expect(isMainModule(pathToFileURL(join(dir, "other.mjs")).href)).toBe(
      false
    );
  });

  it("false when argv[1] is undefined", () => {
    // @ts-expect-error — exercise the undefined-argv guard
    process.argv[1] = undefined;
    expect(isMainModule(pathToFileURL(realFile).href)).toBe(false);
  });

  it("falls back to resolve() when argv[1] does not exist (realpath throws)", () => {
    const ghost = join(dir, "does-not-exist.mjs");
    process.argv[1] = ghost;
    expect(isMainModule(pathToFileURL(ghost).href)).toBe(true);
    expect(isMainModule(pathToFileURL(realFile).href)).toBe(false);
  });
});

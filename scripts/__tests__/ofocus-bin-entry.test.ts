/**
 * Regression: the `ofocus` umbrella bin must run the CLI when invoked through a
 * symlink.
 *
 * npm / pnpm / nodenv install global bins as a SYMLINK
 * (`.../bin/ofocus -> .../lib/node_modules/ofocus/dist/index.js`). The entry's
 * "is this the main module?" guard compared `process.argv[1]` (the symlink path)
 * against `import.meta.url` (the resolved real path); those never match through a
 * symlink, so `createCli().parse()` was skipped and `ofocus <anything>` produced
 * no output at all (exit 0). This reproduces that invocation by symlinking the
 * built entry and asserting the CLI actually runs.
 *
 * Skips when the package hasn't been built (keeps `pnpm test` green pre-build).
 *
 * @see packages/ofocus/src/index.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const entry = resolve(repoRoot, "packages/ofocus/dist/index.js");
const built = existsSync(entry);

describe("ofocus bin entry (symlinked invocation)", () => {
  let dir: string;
  let link: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ofocus-bin-"));
    link = join(dir, "ofocus"); // mimic the global bin symlink
    if (built) symlinkSync(entry, link);
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  (built ? it : it.skip)(
    "prints a version when run via a symlink (not silent)",
    () => {
      const out = execFileSync("node", [link, "--version"], {
        encoding: "utf8",
        timeout: 15_000,
      });
      expect(out.trim()).not.toBe("");
      expect(out).toMatch(/\d+\.\d+\.\d+/);
    }
  );

  (built ? it : it.skip)("prints help when run via a symlink", () => {
    const out = execFileSync("node", [link, "--help"], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(out.trim()).not.toBe("");
  });
});

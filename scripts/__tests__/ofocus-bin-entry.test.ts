/**
 * Regression: the published bins must run when invoked through a symlink.
 *
 * npm / pnpm / nodenv install global bins as a SYMLINK
 * (`.../bin/ofocus -> .../node_modules/ofocus/dist/index.js`). The entry's
 * "is this the main module?" guard compared `process.argv[1]` (the symlink path)
 * against `import.meta.url` (the resolved real path); those never match through a
 * symlink, so the entry was skipped and `ofocus <anything>` produced no output at
 * all (exit 0). The same guard shipped in `@ofocus/cli` and `@ofocus/mcp`. This
 * reproduces a symlinked invocation for the CLI-bearing bins and asserts they are
 * not silent. (The `@ofocus/mcp` bin starts a stdio server with no `--version`/
 * `--help`, so its shared-guard fix is covered by the `isMainModule` unit test.)
 *
 * Skips when a package hasn't been built (keeps `pnpm test` green pre-build).
 *
 * @see packages/sdk/src/utils/is-main-module.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const BINS = [
  { name: "ofocus", entry: resolve(repoRoot, "packages/ofocus/dist/index.js") },
  {
    name: "ofocus-cli",
    entry: resolve(repoRoot, "packages/cli/dist/index.js"),
  },
];

describe.each(BINS)(
  "$name bin entry (symlinked invocation)",
  ({ name, entry }) => {
    const built = existsSync(entry);
    let dir: string;
    let link: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "ofocus-bin-"));
      link = join(dir, name); // mimic the global bin symlink
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
  }
);

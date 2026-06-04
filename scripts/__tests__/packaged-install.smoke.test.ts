/**
 * Packaged-install smoke test — the guard for "works in the repo, broken once
 * installed".
 *
 * It `pnpm pack`s every publishable package, then `npm install`s the umbrella
 * `ofocus` from its tarball with `overrides` forcing the `@ofocus/*` deps to the
 * LOCAL packed tarballs (so the rest of the tree — zod, commander, … — resolves
 * the normal way and faithfully mirrors a real `npm install ofocus`). Then it
 * runs the resulting symlinked bin (`node_modules/.bin/ofocus`).
 *
 * Source-directory tests can't catch this class of bug because they execute
 * `dist/` in place. Only the packed + installed artifact exercises:
 *   - the npm `files` allowlist (missing runtime assets → ENOENT at run time),
 *   - the cross-package dependency tree (missing/mismatched `@ofocus/*`),
 *   - the symlinked bin entry (the "main module" guard),
 *   - the real reported `--version`.
 *
 * These are exactly the CLI regressions that shipped to users: a silent CLI
 * through a symlinked global bin; `@ofocus/sdk` reading a script asset that
 * wasn't in its tarball (ENOENT); and `--version` hardcoded to a stale literal.
 *
 * NOTE on the install method: installing all five tarballs as top-level
 * `npm install` args produces an UNFAITHFUL tree (a zod dedup mismatch breaks
 * the CLI's numeric coercion) — a false failure. The `overrides` + single
 * umbrella tarball approach reproduces a real tree, verified against the
 * published package.
 *
 * `--version` / `--help` / dep-resolution need no OmniFocus (run in CI). The
 * real-command check (`ofocus tasks`) is gated on OmniFocus (local only).
 *
 * @see scripts/__tests__/ofocus-bin-entry.test.ts (symlink check against in-repo dist)
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

/** Publishable packages with their `pnpm --filter` name and tarball-name prefix. */
const PACKAGES = [
  {
    dir: "packages/sdk",
    filter: "@ofocus/sdk",
    dep: "@ofocus/sdk",
    tgz: /^ofocus-sdk-/,
  },
  {
    dir: "packages/productivity",
    filter: "@ofocus/productivity",
    dep: "@ofocus/productivity",
    tgz: /^ofocus-productivity-/,
  },
  {
    dir: "packages/cli",
    filter: "@ofocus/cli",
    dep: "@ofocus/cli",
    tgz: /^ofocus-cli-/,
  },
  {
    dir: "packages/mcp",
    filter: "@ofocus/mcp",
    dep: "@ofocus/mcp",
    tgz: /^ofocus-mcp-/,
  },
  {
    dir: "packages/ofocus",
    filter: "ofocus",
    dep: "ofocus",
    tgz: /^ofocus-\d/,
  },
];

const allBuilt = PACKAGES.every((p) =>
  existsSync(resolve(repoRoot, p.dir, "dist/index.js"))
);
const omniFocusPresent = existsSync("/Applications/OmniFocus.app");

function umbrellaVersion(): string {
  const pkg = JSON.parse(
    readFileSync(resolve(repoRoot, "packages/ofocus/package.json"), "utf8")
  ) as { version: string };
  return pkg.version;
}

const suite = allBuilt ? describe : describe.skip;

suite("packaged install smoke (pack → install → run)", () => {
  let packDir: string;
  let consumerDir: string;
  let bin: string;

  beforeAll(() => {
    packDir = mkdtempSync(join(tmpdir(), "ofocus-pack-"));
    consumerDir = mkdtempSync(join(tmpdir(), "ofocus-consumer-"));

    for (const p of PACKAGES) {
      execFileSync(
        "pnpm",
        ["--filter", p.filter, "pack", "--pack-destination", packDir],
        { cwd: repoRoot, encoding: "utf8", timeout: 120_000 }
      );
    }

    const tgzs = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
    const tgzFor = (re: RegExp): string => {
      const match = tgzs.find((f) => re.test(f));
      if (match === undefined)
        throw new Error(`no tarball matched ${re.source}`);
      return "file:" + join(packDir, match);
    };

    // Install the umbrella from its tarball; force every @ofocus/* dependency to
    // the local tarball via overrides so the rest of the tree resolves normally.
    const overrides: Record<string, string> = {};
    for (const p of PACKAGES) {
      if (p.dep !== "ofocus") overrides[p.dep] = tgzFor(p.tgz);
    }
    writeFileSync(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          name: "ofocus-smoke-consumer",
          private: true,
          dependencies: { ofocus: tgzFor(/^ofocus-\d/) },
          overrides,
        },
        null,
        2
      )
    );
    execFileSync("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: consumerDir,
      encoding: "utf8",
      timeout: 180_000,
    });

    bin = join(consumerDir, "node_modules", ".bin", "ofocus");
  }, 300_000);

  afterAll(() => {
    if (packDir) rmSync(packDir, { recursive: true, force: true });
    if (consumerDir) rmSync(consumerDir, { recursive: true, force: true });
  });

  it("installs the bin as a symlink (real install layout)", () => {
    expect(existsSync(bin)).toBe(true);
    expect(lstatSync(bin).isSymbolicLink()).toBe(true);
  });

  // Per-test timeouts exceed each subprocess's own timeout so Vitest's 5s
  // default never fires first (spawning node + loading the CLI, or hitting a
  // loaded OmniFocus, can exceed 5s).
  it("reports the real package version via --version (not a hardcoded literal)", () => {
    const out = execFileSync("node", [bin, "--version"], {
      encoding: "utf8",
      timeout: 15_000,
    }).trim();
    expect(out).toBe(umbrellaVersion());
  }, 20_000);

  it("--help produces output through the symlinked bin (not silent; imports resolve)", () => {
    const out = execFileSync("node", [bin, "--help"], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(out.trim()).not.toBe("");
  }, 20_000);

  (omniFocusPresent ? it : it.skip)(
    "runs a real command end-to-end through the installed bin (loads SDK script assets)",
    () => {
      const out = execFileSync(
        "node",
        [bin, "tasks", "--limit", "1", "--format", "json"],
        { encoding: "utf8", timeout: 30_000 }
      );
      const parsed = JSON.parse(out) as { success: boolean };
      expect(parsed.success).toBe(true);
    },
    35_000
  );
});

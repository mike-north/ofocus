/**
 * Unit tests for CLI version sourcing.
 *
 * The version reported by `ofocus --version` must be sourced from the
 * package's own package.json — never a hardcoded literal — so it stays in
 * lockstep with the published package version. These tests assert against the
 * value read from package.json on disk (the source of truth), not against a
 * literal copied into the test.
 *
 * @see https://github.com/tj/commander.js — `program.version()` with no
 *   argument returns the configured version string.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, it, expect } from "vitest";
import { createCli, readPackageVersion } from "../../src/cli.js";

/** The authoritative version, read straight from this package's package.json. */
const pkg = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as { version: string };

describe("CLI version", () => {
  it("defaults to the @ofocus/cli package.json version (not a literal)", () => {
    const program = createCli();
    expect(program.version()).toBe(pkg.version);
  });

  it("is a non-empty semver-shaped string, never the stale 0.0.1 placeholder", () => {
    const program = createCli();
    const reported = program.version();
    expect(reported).not.toBe("0.0.1");
    expect(reported).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("honors an explicit version override (umbrella packages pass their own)", () => {
    // The umbrella `ofocus` binary passes its own package version so that
    // `ofocus --version` reflects the installed package, not @ofocus/cli.
    const program = createCli("9.9.9");
    expect(program.version()).toBe("9.9.9");
  });
});

describe("readPackageVersion", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Build a throwaway package layout and return a `file://` URL standing in for
   * a module's `import.meta.url` (i.e. `<root>/dist/index.js`), so that
   * `../package.json` resolves to `<root>/package.json`.
   */
  function fixtureModuleUrl(pkgJson: Record<string, unknown> | null): string {
    const root = mkdtempSync(join(tmpdir(), "ofocus-version-"));
    tempDirs.push(root);
    if (pkgJson !== null) {
      writeFileSync(join(root, "package.json"), JSON.stringify(pkgJson));
    }
    return pathToFileURL(join(root, "dist", "index.js")).href;
  }

  it("reads the version field from package.json one level above the module URL", () => {
    // readPackageVersion expects an entry-point module that lives directly
    // under the package root (e.g. <root>/dist/index.js), so `../package.json`
    // resolves to the package manifest. The fixture models exactly that layout.
    expect(readPackageVersion(fixtureModuleUrl({ version: "1.2.3" }))).toBe(
      "1.2.3"
    );
  });

  it("throws when package.json has no version string", () => {
    expect(() =>
      readPackageVersion(fixtureModuleUrl({ name: "no-version" }))
    ).toThrow(/version/);
  });

  it("throws when the version field is not a string", () => {
    expect(() =>
      readPackageVersion(fixtureModuleUrl({ version: 42 }))
    ).toThrow(/version/);
  });

  it("throws when package.json is absent", () => {
    expect(() => readPackageVersion(fixtureModuleUrl(null))).toThrow();
  });
});

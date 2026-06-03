/**
 * UAT test for `ofocus --version`.
 *
 * Spawns the real built CLI binary and asserts that the reported version
 * matches the value in package.json on disk — the source of truth — rather
 * than any literal baked into the test. This guards against the version
 * string drifting from the published package version.
 *
 * The suite is skipped by default so it does not run in CI without a built
 * CLI. To opt in:
 *   pnpm -F @ofocus/cli build && OFOCUS_UAT=1 pnpm -F @ofocus/cli test
 *
 * @see https://github.com/tj/commander.js — `--version` flag behavior
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { runCli } from "./helpers.js";

const skipCondition = process.env.OFOCUS_UAT !== "1";

/** Authoritative version, read from @ofocus/cli's package.json on disk. */
const pkg = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as { version: string };

describe.skipIf(skipCondition)("UAT: --version (subprocess)", () => {
  it("exits 0 and prints the package.json version", async () => {
    const result = await runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  it("never reports the stale 0.0.1 placeholder", async () => {
    const result = await runCli(["--version"]);

    expect(result.stdout.trim()).not.toBe("0.0.1");
  });
});

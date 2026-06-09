/**
 * Gated UAT: typed OmniAutomation round-trips against a live OmniFocus.
 *
 * Skipped automatically in CI (or any machine without OmniFocus.app).
 * Exercises the two core round-trips confirmed empirically on 2026-06-08:
 *   1. defineOmniScript → osascript → value computed inside OmniFocus (spec §8.1, §4.1)
 *   2. defineOmniAction → installOmniAction → PlugIn.all reflects the identifier (spec §8.2, §4.2)
 *
 * @see https://omni-automation.com/plugins/api.html
 * @see https://omni-automation.com/plugins/simple.html
 */
import { describe, it, expect } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineOmniScript } from "../../src/authoring/define.js";
import { defineOmniAction } from "../../src/authoring/define.js";
import { runOmniScript } from "../../src/authoring/backend-osascript.js";
import { installOmniAction } from "../../src/authoring/backend-plugin-install.js";
import { resolvePluginsDir } from "../../src/authoring/plugins-dir.js";
import { runOmniJSWrapped } from "../../src/omnijs.js";

const hasOmniFocus = existsSync("/Applications/OmniFocus.app");
const d = hasOmniFocus ? describe : describe.skip;

d("typed authoring round-trips (live OmniFocus)", () => {
  it("defineOmniScript -> osascript returns the computed value", async () => {
    const script = defineOmniScript(
      (args: { a: number; b: number }) => args.a + args.b
    );
    const result = await runOmniScript(script, { a: 2, b: 40 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(42); // computed inside OmniFocus, not in Node
  });

  it("defineOmniAction -> install makes PlugIn.all include the identifier", async () => {
    const id = "com.ofocus.test.uat-roundtrip";
    const action = defineOmniAction(() => {});
    const installed = await installOmniAction(action, {
      identifier: id,
      version: "1.0",
      label: "UAT Roundtrip",
    });
    expect(installed.success).toBe(true);
    try {
      // OmniFocus live-loads plugins via a file-system watcher; empirically the
      // watcher fires ~600-900 ms after the file is written (verified 2026-06-08,
      // build 185.15). Wait 2 s to give the watcher time to register the plugin
      // before querying PlugIn.all. Spec §8.2 calls this "immediately" but in
      // practice one to two polling cycles are needed.
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      const ids = await runOmniJSWrapped<string[]>(
        "return JSON.stringify(PlugIn.all.map(function(p){return p.identifier}));"
      );
      expect(ids.success).toBe(true);
      expect(ids.data).toContain(id);
    } finally {
      if (installed.success && installed.data) {
        rmSync(join(resolvePluginsDir(), `${id}.omnijs`), { force: true });
      }
    }
  });
});

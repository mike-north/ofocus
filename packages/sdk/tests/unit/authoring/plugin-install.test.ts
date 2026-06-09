/**
 * Tests for the headless plugin-install backend — resolvePluginsDir and installOmniAction.
 *
 * @see spec §4.2 (docs/specs/2026-06-08-ofocus-typed-omniautomation-design.md)
 * @see https://omni-automation.com/plugins/api.html
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolvePluginsDir } from "../../../src/authoring/plugins-dir.js";
import { installOmniAction } from "../../../src/authoring/backend-plugin-install.js";
import { defineOmniAction } from "../../../src/authoring/define.js";

describe("plugin-install backend", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ofocus-home-"));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it("resolves the OmniFocus 4 container Plug-Ins path under a given home", () => {
    const dir = resolvePluginsDir({ home });
    expect(dir).toBe(
      join(
        home,
        "Library/Containers/com.omnigroup.OmniFocus4/Data/Library/Application Support/Plug-Ins"
      )
    );
  });

  it("writes the compiled .omnijs into the Plug-Ins folder", async () => {
    const action = defineOmniAction(() => {});
    const result = await installOmniAction(
      action,
      { identifier: "com.ofocus.test.sample", version: "1.0", label: "Sample" },
      { home, fileName: "sample.omnijs" }
    );
    expect(result.success).toBe(true);
    const path = join(resolvePluginsDir({ home }), "sample.omnijs");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("new PlugIn.Action(");
  });
});

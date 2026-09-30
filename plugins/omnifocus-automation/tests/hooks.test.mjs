import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const hooks = JSON.parse(
  readFileSync(resolve(pluginRoot, "hooks/hooks.json"), "utf8")
);

function launch(event, rootVariable) {
  const command = hooks.hooks[event][0].hooks[0].command;
  const env = {
    ...process.env,
    PLUGIN_ROOT: "",
    CLAUDE_PLUGIN_ROOT: "",
    CODEX_PLUGIN_ROOT: "",
    OFOCUS_ASSISTANT_DISABLE: "1",
    [rootVariable]: pluginRoot,
  };
  return () => execFileSync("sh", ["-c", command], { env, input: "{}" });
}

describe("hook launch commands", () => {
  for (const event of ["SessionStart", "Stop", "PreToolUse"]) {
    it(`${event} launches with Codex's PLUGIN_ROOT`, () => {
      expect(launch(event, "PLUGIN_ROOT")).not.toThrow();
    });
  }

  it("launches with Claude's CLAUDE_PLUGIN_ROOT", () => {
    expect(launch("SessionStart", "CLAUDE_PLUGIN_ROOT")).not.toThrow();
  });
});

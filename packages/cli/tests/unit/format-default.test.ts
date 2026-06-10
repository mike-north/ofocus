/**
 * Tests for the agent-aware default machine output format.
 *
 * Detection is delegated to `is-agentic-tui` (env-var signals like
 * CLAUDECODE / CURSOR_AGENT / GEMINI_CLI). Here we inject `isAgentic` and `env`
 * to assert the precedence deterministically.
 *
 * @see https://github.com/mike-north/is-agentic-tui
 */
import { describe, it, expect } from "vitest";
import { defaultMachineFormat } from "../../src/format-default.js";

const agent = (): boolean => true;
const human = (): boolean => false;

describe("defaultMachineFormat", () => {
  it("defaults to toon when an AI agent is detected (no env override)", () => {
    expect(defaultMachineFormat({ env: {}, isAgentic: agent })).toBe("toon");
  });

  it("defaults to json for a non-agent caller (no env override)", () => {
    expect(defaultMachineFormat({ env: {}, isAgentic: human })).toBe("json");
  });

  it("$OFOCUS_FORMAT=json overrides detection (wins even under an agent)", () => {
    expect(
      defaultMachineFormat({ env: { OFOCUS_FORMAT: "json" }, isAgentic: agent })
    ).toBe("json");
  });

  it("$OFOCUS_FORMAT=toon applies even for a non-agent caller", () => {
    expect(
      defaultMachineFormat({ env: { OFOCUS_FORMAT: "toon" }, isAgentic: human })
    ).toBe("toon");
  });

  it("$OFOCUS_FORMAT is trimmed and case-insensitive", () => {
    expect(
      defaultMachineFormat({
        env: { OFOCUS_FORMAT: "  TOON " },
        isAgentic: human,
      })
    ).toBe("toon");
  });

  it("an invalid or empty $OFOCUS_FORMAT is ignored and falls through to detection", () => {
    expect(
      defaultMachineFormat({ env: { OFOCUS_FORMAT: "yaml" }, isAgentic: agent })
    ).toBe("toon");
    expect(
      defaultMachineFormat({ env: { OFOCUS_FORMAT: "" }, isAgentic: human })
    ).toBe("json");
  });
});

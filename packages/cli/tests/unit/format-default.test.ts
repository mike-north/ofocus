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
import {
  defaultMachineFormat,
  resolveOutputFormat,
} from "../../src/format-default.js";

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

describe("resolveOutputFormat (full flag precedence)", () => {
  const deps = { env: {}, isAgentic: agent };

  // Regression for PR #85 review: --json was a no-op (Commander
  // .default(true)) and was ignored by format resolution, so an agentic
  // caller passing --json would still have received TOON.
  it("--json forces JSON even when an agent is detected", () => {
    expect(resolveOutputFormat({ json: true }, deps)).toBe("json");
  });

  it("--json (explicit flag) beats $OFOCUS_FORMAT=toon", () => {
    expect(
      resolveOutputFormat(
        { json: true },
        { env: { OFOCUS_FORMAT: "toon" }, isAgentic: agent }
      )
    ).toBe("json");
  });

  it("--format toon wins over --json when both are passed", () => {
    expect(resolveOutputFormat({ json: true, format: "toon" }, deps)).toBe(
      "toon"
    );
  });

  it("--human wins over --format, --json, and detection", () => {
    expect(
      resolveOutputFormat({ human: true, json: true, format: "toon" }, deps)
    ).toBe("human");
  });

  it("an unrecognised explicit --format is reported as invalid, not guessed", () => {
    expect(resolveOutputFormat({ format: "yaml" }, deps)).toEqual({
      invalid: "yaml",
    });
  });

  it("with no flags, falls through to the agent-aware default", () => {
    expect(resolveOutputFormat({}, deps)).toBe("toon");
    expect(resolveOutputFormat({}, { env: {}, isAgentic: human })).toBe("json");
  });

  // Issue #83 §3: `--format ids` is the raw newline-delimited id-list mode.
  // It is reachable ONLY via an explicit --format ids — never as an
  // agent-detected or $OFOCUS_FORMAT default.
  describe("--format ids (raw id-list mode)", () => {
    it("resolves an explicit --format ids to 'ids'", () => {
      expect(resolveOutputFormat({ format: "ids" }, deps)).toBe("ids");
    });

    it("resolves --format ids even for a non-agent caller", () => {
      expect(
        resolveOutputFormat({ format: "ids" }, { env: {}, isAgentic: human })
      ).toBe("ids");
    });

    it("ignores $OFOCUS_FORMAT=ids — env never selects the ids mode", () => {
      // `ids` is intentionally NOT a MachineFormat, so the env override cannot
      // pick it; resolution falls through to agent detection (toon here).
      expect(
        resolveOutputFormat(
          {},
          { env: { OFOCUS_FORMAT: "ids" }, isAgentic: agent }
        )
      ).toBe("toon");
      // …and to json for a non-agent caller.
      expect(
        resolveOutputFormat(
          {},
          { env: { OFOCUS_FORMAT: "ids" }, isAgentic: human }
        )
      ).toBe("json");
    });

    it("--human still beats --format ids", () => {
      expect(
        resolveOutputFormat({ human: true, format: "ids" }, deps)
      ).toBe("human");
    });
  });
});

// `defaultMachineFormat` must never return `ids`: it is the detected/env
// default path, and `ids` is an explicit-only format.
describe("defaultMachineFormat never yields ids", () => {
  it("ignores OFOCUS_FORMAT=ids and falls through to detection", () => {
    expect(
      defaultMachineFormat({ env: { OFOCUS_FORMAT: "ids" }, isAgentic: agent })
    ).toBe("toon");
    expect(
      defaultMachineFormat({ env: { OFOCUS_FORMAT: "ids" }, isAgentic: human })
    ).toBe("json");
  });
});

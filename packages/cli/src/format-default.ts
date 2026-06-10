import { isAgenticTui } from "is-agentic-tui";
import type { OutputFormat } from "./output.js";

/**
 * The machine-readable output formats the CLI can choose as a default.
 *
 * (`"human"` is only ever selected explicitly via `--human`, never as an
 * automatic default, so it is intentionally not part of this union.)
 *
 * @public
 */
export type MachineFormat = "json" | "toon";

/**
 * Injectable dependencies for {@link defaultMachineFormat} (for testing).
 *
 * @public
 */
export interface DefaultFormatDeps {
  /** Environment to read `OFOCUS_FORMAT` from. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Whether an AI agent is driving the CLI. Defaults to `isAgenticTui`. */
  isAgentic?: () => boolean;
}

/**
 * Resolve the default machine output format when the caller passed neither
 * `--human` nor an explicit `--format`.
 *
 * Precedence (highest first):
 *  1. `$OFOCUS_FORMAT` — used when it is exactly `json` or `toon`
 *     (trimmed, case-insensitive); any other value is ignored and falls
 *     through. This is the escape hatch for scripts/CI that run inside an
 *     agent environment but want deterministic output (e.g. piping to `jq`).
 *  2. Agent detection — `toon` when an AI coding agent (Claude Code, Cursor,
 *     Gemini CLI, Aider, …) is detected via {@link isAgenticTui}: agents pay
 *     per token and TOON is ~40% smaller than JSON for the uniform
 *     arrays-of-objects this CLI emits.
 *  3. `json` — the conservative default for a human / non-agent caller.
 *
 * Explicit `--human` and `--format` always win; they are resolved by the
 * caller before this function is consulted.
 *
 * @public
 */
export function defaultMachineFormat(
  deps: DefaultFormatDeps = {}
): MachineFormat {
  const env = deps.env ?? process.env;
  const isAgentic = deps.isAgentic ?? isAgenticTui;

  const envFmt = env["OFOCUS_FORMAT"]?.trim().toLowerCase();
  if (envFmt === "json" || envFmt === "toon") {
    return envFmt;
  }

  return isAgentic() ? "toon" : "json";
}

/**
 * The global CLI flags that participate in output-format resolution.
 *
 * @public
 */
export interface OutputFormatFlags {
  /** `--human` — human-readable text output. */
  human?: boolean | undefined;
  /** `--json` — explicit shorthand for `--format json`. */
  json?: boolean | undefined;
  /** `--format <fmt>` — explicit machine format (`json`, `toon`, or `ids`). */
  format?: string | undefined;
}

/**
 * Resolve the effective output format from the global CLI flags.
 *
 * Precedence (highest first):
 *  1. `--human`        → human-readable formatter
 *  2. `--format <x>`   → explicit `json`, `toon`, or `ids`
 *  3. `--json`         → explicit shorthand for JSON
 *  4. `$OFOCUS_FORMAT` → `json` or `toon` (env override for scripts/CI)
 *  5. agent detection  → `toon` when an AI agent is driving, else `json`
 *
 * Every explicit flag wins over the env var and agent detection — passing
 * `--json` (or `--format json`) inside an agent session yields JSON.
 *
 * `ids` (raw newline-delimited id list) is reachable ONLY via an explicit
 * `--format ids`; it is never an agent-detected or `$OFOCUS_FORMAT` default
 * (it is intentionally excluded from {@link MachineFormat}).
 *
 * Returns `{ invalid }` when an explicit `--format` value is unrecognised;
 * the caller is responsible for emitting the structured error envelope.
 *
 * @public
 */
export function resolveOutputFormat(
  flags: OutputFormatFlags,
  deps: DefaultFormatDeps = {}
): OutputFormat | { invalid: string } {
  if (flags.human === true) {
    return "human";
  }
  if (flags.format !== undefined) {
    // `ids` is accepted ONLY as an explicit `--format ids` — it is a raw
    // newline-delimited id list (no envelope) for piping an `--ids-only`
    // result into `xargs`. It is deliberately NOT part of `MachineFormat`, so
    // it can never be selected as an agent-detected or `$OFOCUS_FORMAT`
    // default (`OFOCUS_FORMAT=ids` is ignored — see `defaultMachineFormat`).
    if (
      flags.format === "json" ||
      flags.format === "toon" ||
      flags.format === "ids"
    ) {
      return flags.format;
    }
    return { invalid: flags.format };
  }
  if (flags.json === true) {
    return "json";
  }
  return defaultMachineFormat(deps);
}

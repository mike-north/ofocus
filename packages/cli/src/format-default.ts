import { isAgenticTui } from "is-agentic-tui";

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

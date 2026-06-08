import type { OmniScript } from "./types.js";

/**
 * Capture a typed function as an {@link OmniScript}. The body must be
 * self-contained (no closures/imports); the ESLint rule
 * `no-omniscript-closure` enforces this at author time.
 *
 * @public
 */
export function defineOmniScript<Args, T>(
  fn: (args: Args) => T
): OmniScript<Args, T> {
  if (typeof fn !== "function") {
    throw new TypeError("defineOmniScript expects a function");
  }
  return { kind: "script", source: fn.toString() };
}

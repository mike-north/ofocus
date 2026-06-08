import type { OmniScript, OmniAction } from "./types.js";

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

/** Minimal structural type for the OmniJS `Selection` global. */
interface OmniSelectionLike {
  readonly tasks: readonly unknown[];
  readonly projects: readonly unknown[];
}

/**
 * Capture a typed plugin-action body as an {@link OmniAction}.
 *
 * @public
 */
export function defineOmniAction(
  perform: (selection: OmniSelectionLike, sender: unknown) => void,
  options?: {
    validate?: (selection: OmniSelectionLike, sender: unknown) => boolean;
  }
): OmniAction {
  if (typeof perform !== "function") {
    throw new TypeError("defineOmniAction expects a function");
  }
  return {
    kind: "action",
    performSource: perform.toString(),
    validateSource: options?.validate ? options.validate.toString() : null,
  };
}

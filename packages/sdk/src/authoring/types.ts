/**
 * Minimal structural type for the OmniJS `Selection` global, passed to
 * `perform` and `validate` callbacks in a `PlugIn.Action`.
 *
 * @public
 */
export interface OmniSelectionLike {
  /** The currently selected tasks. */
  readonly tasks: readonly unknown[];
  /** The currently selected projects. */
  readonly projects: readonly unknown[];
}

/**
 * A typed OmniFocus script authored as a TypeScript function. The function's
 * source is serialized to OmniJS at emit time; it must be self-contained
 * (referencing only its parameter, locally-declared bindings, and OmniFocus
 * globals — never closures or imports).
 *
 * @public
 */
export interface OmniScript<Args, T> {
  readonly kind: "script";
  /** The serialized function source (from `Function.prototype.toString()`). */
  readonly source: string;
  /** Phantom carriers for the args/return types (never present at runtime). */
  readonly __args?: Args;
  readonly __result?: T;
}

/**
 * A typed OmniFocus plugin action (the `perform` body of a `PlugIn.Action`).
 *
 * @public
 */
export interface OmniAction {
  readonly kind: "action";
  readonly performSource: string;
  readonly validateSource: string | null;
}

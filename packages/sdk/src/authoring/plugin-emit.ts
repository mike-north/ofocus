import type { OmniAction } from "./types.js";

/**
 * Metadata for a single-file OmniFocus plugin. `type`/`targets` are fixed for
 * v1 (an OmniFocus action); the rest is author-supplied. See spec §4.2.
 *
 * @public
 */
export interface OmniActionMetadata {
  readonly identifier: string;
  readonly version: string;
  readonly label: string;
  readonly shortLabel?: string;
  readonly paletteLabel?: string;
  readonly description?: string;
  readonly author?: string;
  /** SF Symbol name. */
  readonly image?: string;
}

/**
 * Compile an {@link OmniAction} into single-file `.omnijs` source: a metadata
 * comment header followed by the self-invoking `PlugIn.Action` template.
 *
 * The format follows the OmniAutomation single-file plugin spec (§4.2):
 * - A `/*{...}*\/` JSON comment with required keys `type`, `targets`,
 *   `identifier`, `version`, and optional display/authoring metadata.
 * - A self-invoking IIFE that constructs a `PlugIn.Action` and assigns
 *   `validate` before returning it.
 *
 * Optional metadata keys are omitted (not emitted as `undefined`) when absent,
 * relying on conditional-spread to satisfy `exactOptionalPropertyTypes`.
 *
 * @public
 */
export function compileActionToPlugin(
  action: OmniAction,
  meta: OmniActionMetadata
): string {
  const header = {
    type: "action",
    targets: ["omnifocus"],
    identifier: meta.identifier,
    version: meta.version,
    label: meta.label,
    ...(meta.shortLabel !== undefined ? { shortLabel: meta.shortLabel } : {}),
    ...(meta.paletteLabel !== undefined
      ? { paletteLabel: meta.paletteLabel }
      : {}),
    ...(meta.description !== undefined
      ? { description: meta.description }
      : {}),
    ...(meta.author !== undefined ? { author: meta.author } : {}),
    ...(meta.image !== undefined ? { image: meta.image } : {}),
  };
  const validate = action.validateSource ?? "(() => true)";
  return (
    `/*${JSON.stringify(header)}*/\n` +
    `(() => {\n` +
    `  const action = new PlugIn.Action(${action.performSource});\n` +
    `  action.validate = ${validate};\n` +
    `  return action;\n` +
    `})();\n`
  );
}

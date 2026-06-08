/**
 * Compose the OmniJS body for an osascript-run script: inject the JSON args as
 * a parsed constant and return the JSON-stringified result of calling the
 * serialized function with them. Args are double-stringified so no value can
 * break out of the literal into executable code.
 *
 * @public
 */
export function composeScriptBody(
  source: string,
  args: Record<string, unknown> | undefined
): string {
  const argsJson = JSON.stringify(args ?? {});
  const argsLiteral = JSON.stringify(argsJson);
  return `var __args = JSON.parse(${argsLiteral});\nreturn JSON.stringify((${source})(__args));`;
}

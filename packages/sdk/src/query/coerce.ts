import { z } from "zod";

/**
 * Pre-processes an array of strings to handle comma-separated values.
 *
 * The CLI's `z.array(z.string())` is rendered as a Commander variadic option
 * (`--flag <values...>`). When the user passes a comma-separated string as a
 * single argument (`--fields id,name,due`) Commander delivers it as a single-
 * element array `["id,name,due"]`. When the user passes space-separated tokens
 * (`--fields id name due`) Commander delivers `["id", "name", "due"]`.
 *
 * This function normalizes both forms: any element that contains a comma is
 * split on commas, trimmed, and flattened into the result. Empty strings
 * (from trailing commas or whitespace-only segments) are dropped.
 *
 * @example
 * ```ts
 * splitCommaSeparated(["id,name,due"])         // → ["id", "name", "due"]
 * splitCommaSeparated(["id", "name", "due"])   // → ["id", "name", "due"]
 * splitCommaSeparated(["id,name", "due"])      // → ["id", "name", "due"]
 * splitCommaSeparated(["id", " name , due "]) // → ["id", "name", "due"]
 * ```
 *
 * @public
 */
export function splitCommaSeparated(values: string[]): string[] {
  const result: string[] = [];
  for (const v of values) {
    if (v.includes(",")) {
      for (const part of v.split(",")) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
          result.push(trimmed);
        }
      }
    } else {
      const trimmed = v.trim();
      if (trimmed.length > 0) {
        result.push(trimmed);
      }
    }
  }
  return result;
}

/**
 * A Zod schema for an optional array of strings that accepts both
 * space-separated (variadic) and comma-separated input.
 *
 * Use this wherever the CLI surface exposes `--flag <values...>` and the
 * underlying vocabulary is a fixed set of identifiers that cannot legitimately
 * contain commas (field names, sort keys, etc.).
 *
 * Do NOT use for membership filters like `--tag` or `--project` where the
 * value domain includes arbitrary user-defined names that may contain commas.
 *
 * @public
 */
export const commaSeparatedStringArray = z.preprocess((val): unknown => {
  if (!Array.isArray(val)) return val;
  return splitCommaSeparated(val as string[]);
}, z.array(z.string()).optional());

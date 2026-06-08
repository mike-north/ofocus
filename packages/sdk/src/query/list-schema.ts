import { z } from "zod";
import { commaSeparatedStringArray } from "./coerce.js";

/**
 * Shared Zod schema fragment for the projection and sort fields that appear on
 * every list command.
 *
 * These fields are intentionally separated from the pagination/shape fields so
 * each command can spread just the pieces it needs. Every field uses
 * {@link commaSeparatedStringArray} so both space-separated (`--fields id name`)
 * and comma-separated (`--fields id,name`) CLI input are accepted.
 *
 * Flags deliberately NOT included here:
 * - `--tag`, `--project`, `--folder` membership filters: these accept
 *   arbitrary user-defined names that may legitimately contain commas, so
 *   comma-splitting would corrupt them.
 *
 * @public
 */
export const listProjectionSchema = {
  fields: commaSeparatedStringArray.describe(
    "Fields to include in each result item (comma- or space-separated, e.g. id,name,dueDate)"
  ),
  excludeFields: commaSeparatedStringArray.describe(
    "Fields to exclude from the result items (comma- or space-separated)"
  ),
} as const;

/**
 * Shared Zod schema fragment for the sort option on list commands.
 *
 * Sort keys are field names from the entity's allowlist — a fixed vocabulary
 * that cannot contain commas — so comma-splitting is safe here.
 *
 * @public
 */
export const listSortSchema = {
  sort: commaSeparatedStringArray.describe(
    "Sort keys (comma- or space-separated field names, e.g. dueDate,name)"
  ),
  reverse: z
    .boolean()
    .optional()
    .describe("Reverse the sort order (default: false)"),
} as const;

/**
 * Shared Zod schema fragment for pagination on the standard list commands.
 *
 * `limit`/`offset` slice the default `list` output; combining them with a shape
 * modifier (`--ids-only`, `--count`, `--first`, `--last`, `--group-by`) is
 * rejected because those shapes return the full match set. `all` materialises
 * everything and is mutually exclusive with `limit`/`offset`.
 *
 * @public
 */
export const listPaginationSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Maximum number of results to return (default: 100). Applies only to list output; shape modifiers that return the full match set cannot be combined with --limit/--offset."
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Number of results to skip for pagination. Applies only to list output; shape modifiers that return the full match set cannot be combined with --limit/--offset."
    ),
  all: z
    .boolean()
    .optional()
    .describe(
      "When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset."
    ),
} as const;

import { type CliError, ErrorCode, createError } from "../errors.js";
import type { EntityFieldSpec } from "./fields.js";

/**
 * Options accepted by {@link compileSort}.
 *
 * @public
 */
export interface CompileSortOptions {
  sort?: string[] | undefined;
  reverse?: boolean | undefined;
  nullsFirst?: boolean | undefined;
}

/**
 * Result of compiling a sort.
 *
 * `comparator` is either `null` (no sort) or a JS function expression of the
 * form `function(a, b) { ... }` suitable for `Array.prototype.sort`.
 *
 * @public
 */
export interface CompiledSort {
  comparator: string | null;
  validationErrors: CliError[];
}

/**
 * Compile a multi-key sort over an entity's field allowlist.
 *
 * Sort semantics:
 * - Keys are compared lexicographically (first key, then second, etc.).
 * - Strings compared via `<`/`>` (lexicographic).
 * - Numbers and booleans compared with `<`/`>`.
 * - Dates: rely on the projection's ISO strings — those sort lexicographically.
 * - `null`/`undefined` sort last by default; first if `nullsFirst` is true.
 * - `reverse: true` flips the final comparator output.
 *
 * Comparator code accesses fields via the entity's OmniJS expression (with
 * `t` rebound to `a` / `b`). This keeps the field-to-OmniJS mapping centralized
 * in the field spec.
 *
 * @public
 */
export function compileSort(
  spec: EntityFieldSpec,
  options: CompileSortOptions
): CompiledSort {
  const validationErrors: CliError[] = [];
  const keys = options.sort ?? [];

  if (keys.length === 0) {
    return { comparator: null, validationErrors };
  }

  // Validate every key.
  const validKeys: string[] = [];
  for (const key of keys) {
    if (!(key in spec.fields)) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          `Unknown sort field: ${key}`,
          `Available fields: ${Object.keys(spec.fields).sort().join(", ")}`
        )
      );
      continue;
    }
    validKeys.push(key);
  }

  if (validKeys.length === 0) {
    return { comparator: null, validationErrors };
  }

  const nullsFirst = options.nullsFirst === true;
  const reverse = options.reverse === true;

  // Build a comparator block per key.
  // Strategy: extract the value from each side, handle null ordering, then
  // do plain `<`/`>` comparison. Return at first non-zero result.
  const blocks: string[] = [];
  for (const key of validKeys) {
    const getter = spec.fields[key];
    if (getter === undefined) continue;
    const expr = getter.omnijsExpr;
    // Rebind `t` -> `a` and `t` -> `b`.
    const aExpr = rebindVar(expr, "t", "a");
    const bExpr = rebindVar(expr, "t", "b");

    const block = `
    {
      var av = ${aExpr};
      var bv = ${bExpr};
      var aNull = (av == null);
      var bNull = (bv == null);
      if (aNull && bNull) { /* tie, fall through */ }
      else if (aNull) return ${nullsFirst ? "-1" : "1"};
      else if (bNull) return ${nullsFirst ? "1" : "-1"};
      else if (av < bv) return -1;
      else if (av > bv) return 1;
    }`;
    blocks.push(block);
  }

  const body = `${blocks.join("")}
    return 0;`;

  const inner = `function(a, b) {${body}
  }`;

  if (reverse) {
    const comparator = `(function() {
  var base = ${inner};
  return function(a, b) { return -base(a, b); };
})()`;
    return { comparator, validationErrors };
  }

  return { comparator: inner, validationErrors };
}

/**
 * Replace whole-word references to `from` with `to` inside a JS expression.
 *
 * Targeted, mechanical substitution intended for our internal field getters
 * which always reference the entity variable as the same identifier. We use
 * a word-boundary regex so we don't accidentally rewrite suffixes.
 */
function rebindVar(expr: string, from: string, to: string): string {
  const re = new RegExp(`\\b${escapeRegex(from)}\\b`, "g");
  return expr.replace(re, to);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

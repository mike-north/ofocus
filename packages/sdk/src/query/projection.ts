import { type CliError, ErrorCode, createError } from "../errors.js";
import type { EntityFieldSpec } from "./fields.js";

/**
 * Options accepted by {@link compileProjection}.
 *
 * @public
 */
export interface CompileProjectionOptions {
  fields?: string[] | undefined;
  excludeFields?: string[] | undefined;
}

/**
 * Result of compiling a field projection.
 *
 * `mapExpression` is a JavaScript function literal of the form
 * `function(t) { return { ... }; }` that can be used directly as a callback
 * to `Array.prototype.map` inside an OmniJS body.
 *
 * @public
 */
export interface CompiledProjection {
  mapExpression: string;
  /** The resolved ordered field list used to build the projection. */
  resolvedFields: string[];
  validationErrors: CliError[];
}

/**
 * Quote a string for use as a JS object key. Keys are field names from the
 * entity spec which are always simple identifiers, but we be defensive.
 */
function quoteKey(key: string): string {
  // Simple identifier — keep unquoted for readability.
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
    return key;
  }
  return JSON.stringify(key);
}

/**
 * Build a JS function literal that maps an entity to a projected object.
 *
 * - If `fields` is provided, only those fields are emitted (in the order given).
 * - Otherwise the entity's default field set is used.
 * - `excludeFields` removes fields from either selection.
 * - Unknown fields produce `VALIDATION_ERROR` entries; the mapExpression still
 *   compiles using only the recognized fields so callers can inspect both.
 *
 * @public
 */
export function compileProjection(
  spec: EntityFieldSpec,
  options: CompileProjectionOptions
): CompiledProjection {
  const validationErrors: CliError[] = [];

  // Determine starting set
  const explicit = options.fields !== undefined && options.fields.length > 0;
  const requested = explicit
    ? (options.fields ?? [])
    : spec.defaultFields.slice();

  // Validate every explicitly requested field
  if (explicit) {
    for (const field of requested) {
      if (!(field in spec.fields)) {
        validationErrors.push(
          createError(
            ErrorCode.VALIDATION_ERROR,
            `Unknown field: ${field}`,
            `Available fields: ${Object.keys(spec.fields).sort().join(", ")}`
          )
        );
      }
    }
  }

  // Validate exclusions (warn on unknown — they're no-ops but still incorrect)
  const exclude = new Set(options.excludeFields ?? []);
  if (options.excludeFields !== undefined) {
    for (const field of options.excludeFields) {
      if (!(field in spec.fields)) {
        validationErrors.push(
          createError(
            ErrorCode.VALIDATION_ERROR,
            `Unknown field in excludeFields: ${field}`,
            `Available fields: ${Object.keys(spec.fields).sort().join(", ")}`
          )
        );
      }
    }
  }

  // Resolve to the final ordered, de-duped, exclude-filtered, valid field list.
  const seen = new Set<string>();
  const resolvedFields: string[] = [];
  for (const field of requested) {
    if (exclude.has(field)) continue;
    if (seen.has(field)) continue;
    if (!(field in spec.fields)) continue;
    seen.add(field);
    resolvedFields.push(field);
  }

  // Build the object literal body. We emit each key on its own line so the
  // generated script is greppable in logs.
  const lines: string[] = [];
  for (const field of resolvedFields) {
    const getter = spec.fields[field];
    if (getter === undefined) continue;
    lines.push(`    ${quoteKey(field)}: ${getter.omnijsExpr}`);
  }

  const body =
    resolvedFields.length === 0
      ? "  return {};"
      : `  return {\n${lines.join(",\n")}\n  };`;

  const mapExpression = `function(t) {\n${body}\n}`;

  return { mapExpression, resolvedFields, validationErrors };
}

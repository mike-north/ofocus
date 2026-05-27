import { type CliError, ErrorCode, createError } from "../errors.js";
import { escapeJSString } from "../omnijs.js";
import { parseDate, parseDuration } from "./dates.js";
import type {
  TagMode,
  TaskQueryOptions,
  ProjectQueryOptions,
  TagQueryOptions,
  FolderQueryOptions,
  FolderStatus,
} from "./types.js";

/**
 * Result of compiling task predicates: a list of boolean JS expressions that
 * each evaluate against the task variable `t`, and any validation errors
 * collected along the way.
 *
 * The expressions are AND-combined by the caller via `buildListQueryBody`.
 *
 * @public
 */
export interface CompiledPredicates {
  conditions: string[];
  validationErrors: CliError[];
}

/**
 * Convert a parsed ISO date string to an OmniJS `Date` constructor expression
 * suitable for direct interpolation into the script body.
 *
 * We emit the ISO literal string and let OmniJS' JS engine construct the Date,
 * which is the safer of the two interpolation strategies (no field-by-field
 * timezone confusion).
 */
function isoToOmniJSDate(iso: string): string {
  return `new Date("${escapeJSString(iso)}")`;
}

/**
 * Resolve a date-like input — either a relative expression or an ISO string —
 * to an OmniJS `Date` constructor expression. Errors are pushed onto the
 * caller's error array; the function returns `null` on failure.
 */
function resolveDate(
  input: string,
  fieldLabel: string,
  validationErrors: CliError[]
): string | null {
  const parsed = parseDate(input);
  if ("code" in parsed) {
    validationErrors.push(
      createError(
        parsed.code,
        `Invalid ${fieldLabel}: ${parsed.message}`,
        parsed.details
      )
    );
    return null;
  }
  return isoToOmniJSDate(parsed.iso);
}

/**
 * Render a JS array literal of safely-escaped string values.
 */
function jsStringArray(values: readonly string[]): string {
  return `[${values.map((v) => `"${escapeJSString(v)}"`).join(", ")}]`;
}

/**
 * Validate that all strings in an array are non-empty and free of dangerous
 * characters. Returns `null` if valid, or a `CliError` otherwise.
 */
function validateNames(
  values: readonly string[],
  fieldLabel: string
): CliError | null {
  for (const v of values) {
    if (typeof v !== "string" || v.trim() === "") {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        `${fieldLabel} entries must be non-empty strings`
      );
    }
    if (v.includes('"') || v.includes("\\")) {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid characters in ${fieldLabel}: ${v}`,
        `${fieldLabel} cannot contain quotes or backslashes`
      );
    }
  }
  return null;
}

/**
 * Normalize a `string | string[]` to a non-empty array, or `null` if absent.
 */
function toList(value: string | readonly string[] | undefined): string[] | null {
  if (value === undefined) return null;
  if (typeof value === "string") return [value];
  // value is `readonly string[]` per the input type.
  return value.slice();
}

/**
 * Compile the predicate vocabulary on {@link TaskQueryOptions} into a list of
 * OmniJS boolean expressions over the task variable `t`.
 *
 * Every predicate-bearing field that is set in `options` contributes one
 * expression. Boolean predicates are emitted as-is (no double-negation games).
 * Date predicates are resolved through {@link parseDate} so callers may pass
 * relative expressions like `"7d"` or `"tomorrow"`.
 *
 * @public
 */
export function compileTaskPredicates(
  options: TaskQueryOptions
): CompiledPredicates {
  const conditions: string[] = [];
  const validationErrors: CliError[] = [];

  // ── Boolean state ────────────────────────────────────────────────────────
  if (options.flagged === true) conditions.push("t.flagged");
  if (options.flagged === false) conditions.push("!t.flagged");
  if (options.notFlagged === true) conditions.push("!t.flagged");

  if (options.completed === true) conditions.push("t.completed");
  if (options.completed === false) conditions.push("!t.completed");
  if (options.notCompleted === true) conditions.push("!t.completed");

  if (options.dropped === true) conditions.push("t.dropped");
  if (options.dropped === false) conditions.push("!t.dropped");
  if (options.notDropped === true) conditions.push("!t.dropped");

  if (options.blocked === true) conditions.push("t.blocked");
  if (options.blocked === false) conditions.push("!t.blocked");

  if (options.effectivelyCompleted === true)
    conditions.push("t.effectivelyCompleted");
  if (options.effectivelyCompleted === false)
    conditions.push("!t.effectivelyCompleted");

  if (options.effectivelyDropped === true)
    conditions.push("t.effectivelyDropped");
  if (options.effectivelyDropped === false)
    conditions.push("!t.effectivelyDropped");

  if (options.available === true) {
    conditions.push(
      "(!t.completed && !t.effectivelyDropped && !t.blocked)"
    );
  }
  if (options.available === false) {
    conditions.push(
      "(t.completed || t.effectivelyDropped || t.blocked)"
    );
  }

  if (options.inInbox === true) conditions.push("(t.containingProject == null)");
  if (options.inInbox === false) conditions.push("(t.containingProject != null)");

  if (options.hasDue === true) conditions.push("(t.dueDate != null)");
  if (options.hasDue === false) conditions.push("(t.dueDate == null)");
  if (options.noDue === true) conditions.push("(t.dueDate == null)");

  if (options.hasDefer === true) conditions.push("(t.deferDate != null)");
  if (options.hasDefer === false) conditions.push("(t.deferDate == null)");

  if (options.hasNote === true) conditions.push('(t.note != null && t.note !== "")');
  if (options.hasNote === false) conditions.push('(t.note == null || t.note === "")');

  if (options.hasAttachments === true)
    conditions.push("(t.attachments.length > 0)");
  if (options.hasAttachments === false)
    conditions.push("(t.attachments.length === 0)");

  if (options.hasSubtasks === true) conditions.push("(t.children.length > 0)");
  if (options.hasSubtasks === false) conditions.push("(t.children.length === 0)");

  if (options.hasRepetition === true)
    conditions.push("(t.repetitionRule != null)");
  if (options.hasRepetition === false)
    conditions.push("(t.repetitionRule == null)");

  // ── Status convenience ───────────────────────────────────────────────────
  if (options.status !== undefined) {
    switch (options.status) {
      case "active":
        conditions.push("(!t.completed && !t.dropped)");
        break;
      case "completed":
        conditions.push("t.completed");
        break;
      case "dropped":
        conditions.push("t.dropped");
        break;
      case "deferred":
        // "deferred" = task has a defer date that is in the future
        conditions.push("(t.deferDate != null && t.deferDate > new Date())");
        break;
      default: {
        const exhaustive: never = options.status;
        validationErrors.push(
          createError(
            ErrorCode.VALIDATION_ERROR,
            `Unknown status: ${String(exhaustive)}`,
            "Valid values: active, completed, dropped, deferred"
          )
        );
      }
    }
  }

  // ── Membership: project ──────────────────────────────────────────────────
  const projects = toList(options.project);
  if (projects !== null) {
    if (projects.length === 0) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "project filter cannot be an empty array"
        )
      );
    } else {
      const nameError = validateNames(projects, "project");
      if (nameError) {
        validationErrors.push(nameError);
      } else if (projects.length === 1) {
        const name = projects[0] ?? "";
        conditions.push(
          `(t.containingProject != null && t.containingProject.name === "${escapeJSString(name)}")`
        );
      } else {
        const arr = jsStringArray(projects);
        conditions.push(
          `(t.containingProject != null && ${arr}.indexOf(t.containingProject.name) !== -1)`
        );
      }
    }
  }

  // ── Membership: tag(s) ───────────────────────────────────────────────────
  const tags = toList(options.tag);
  if (tags !== null) {
    if (tags.length === 0) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "tag filter cannot be an empty array"
        )
      );
    } else {
      const nameError = validateNames(tags, "tag");
      if (nameError) {
        validationErrors.push(nameError);
      } else {
        const mode: TagMode = options.tagMode ?? "all";
        const arr = jsStringArray(tags);
        switch (mode) {
          case "all":
            // every tag in `arr` must appear in t.tags
            conditions.push(
              `${arr}.every(function(n) { return t.tags.some(function(tg) { return tg.name === n; }); })`
            );
            break;
          case "any":
            conditions.push(
              `${arr}.some(function(n) { return t.tags.some(function(tg) { return tg.name === n; }); })`
            );
            break;
          case "none":
            conditions.push(
              `!${arr}.some(function(n) { return t.tags.some(function(tg) { return tg.name === n; }); })`
            );
            break;
          default: {
            const exhaustive: never = mode;
            validationErrors.push(
              createError(
                ErrorCode.VALIDATION_ERROR,
                `Unknown tagMode: ${String(exhaustive)}`,
                "Valid values: any, all, none"
              )
            );
          }
        }
      }
    }
  }

  // ── Membership: folder (transitive) ──────────────────────────────────────
  const folders = toList(options.folder);
  if (folders !== null) {
    if (folders.length === 0) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "folder filter cannot be an empty array"
        )
      );
    } else {
      const nameError = validateNames(folders, "folder");
      if (nameError) {
        validationErrors.push(nameError);
      } else {
        const arr = jsStringArray(folders);
        // Walk up the parentFolder chain starting from the containing project's
        // parentFolder and return true if any folder name matches.
        conditions.push(
          `(function() {
  if (!t.containingProject) return false;
  var f = t.containingProject.parentFolder;
  var wanted = ${arr};
  while (f != null) {
    if (wanted.indexOf(f.name) !== -1) return true;
    f = f.parent;
  }
  return false;
})()`
        );
      }
    }
  }

  // ── Date predicates ──────────────────────────────────────────────────────
  // dueDate
  if (options.dueBefore !== undefined) {
    const expr = resolveDate(options.dueBefore, "dueBefore", validationErrors);
    if (expr) conditions.push(`(t.dueDate != null && t.dueDate < ${expr})`);
  }
  if (options.dueAfter !== undefined) {
    const expr = resolveDate(options.dueAfter, "dueAfter", validationErrors);
    if (expr) conditions.push(`(t.dueDate != null && t.dueDate > ${expr})`);
  }
  if (options.dueOn !== undefined) {
    const parsed = parseDate(options.dueOn);
    if ("code" in parsed) {
      validationErrors.push(
        createError(
          parsed.code,
          `Invalid dueOn: ${parsed.message}`,
          parsed.details
        )
      );
    } else {
      const start = new Date(parsed.iso);
      const startUtc = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate(),
          0,
          0,
          0,
          0
        )
      );
      const endUtc = new Date(startUtc.getTime() + 86_400_000);
      conditions.push(
        `(t.dueDate != null && t.dueDate >= ${isoToOmniJSDate(startUtc.toISOString())} && t.dueDate < ${isoToOmniJSDate(endUtc.toISOString())})`
      );
    }
  }
  if (options.dueWithin !== undefined) {
    const dur = parseDuration(options.dueWithin);
    if (typeof dur !== "number") {
      validationErrors.push(
        createError(
          dur.code,
          `Invalid dueWithin: ${dur.message}`,
          dur.details
        )
      );
    } else {
      const future = new Date(Date.now() + dur);
      conditions.push(
        `(t.dueDate != null && t.dueDate >= new Date() && t.dueDate <= ${isoToOmniJSDate(future.toISOString())})`
      );
    }
  }

  // deferDate
  if (options.deferBefore !== undefined) {
    const expr = resolveDate(options.deferBefore, "deferBefore", validationErrors);
    if (expr)
      conditions.push(`(t.deferDate != null && t.deferDate < ${expr})`);
  }
  if (options.deferAfter !== undefined) {
    const expr = resolveDate(options.deferAfter, "deferAfter", validationErrors);
    if (expr)
      conditions.push(`(t.deferDate != null && t.deferDate > ${expr})`);
  }
  if (options.deferOn !== undefined) {
    const parsed = parseDate(options.deferOn);
    if ("code" in parsed) {
      validationErrors.push(
        createError(
          parsed.code,
          `Invalid deferOn: ${parsed.message}`,
          parsed.details
        )
      );
    } else {
      const start = new Date(parsed.iso);
      const startUtc = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate(),
          0,
          0,
          0,
          0
        )
      );
      const endUtc = new Date(startUtc.getTime() + 86_400_000);
      conditions.push(
        `(t.deferDate != null && t.deferDate >= ${isoToOmniJSDate(startUtc.toISOString())} && t.deferDate < ${isoToOmniJSDate(endUtc.toISOString())})`
      );
    }
  }
  if (options.deferWithin !== undefined) {
    const dur = parseDuration(options.deferWithin);
    if (typeof dur !== "number") {
      validationErrors.push(
        createError(
          dur.code,
          `Invalid deferWithin: ${dur.message}`,
          dur.details
        )
      );
    } else {
      const future = new Date(Date.now() + dur);
      conditions.push(
        `(t.deferDate != null && t.deferDate >= new Date() && t.deferDate <= ${isoToOmniJSDate(future.toISOString())})`
      );
    }
  }

  // completionDate
  if (options.completedBefore !== undefined) {
    const expr = resolveDate(
      options.completedBefore,
      "completedBefore",
      validationErrors
    );
    if (expr)
      conditions.push(
        `(t.completionDate != null && t.completionDate < ${expr})`
      );
  }
  if (options.completedAfter !== undefined) {
    const expr = resolveDate(
      options.completedAfter,
      "completedAfter",
      validationErrors
    );
    if (expr)
      conditions.push(
        `(t.completionDate != null && t.completionDate > ${expr})`
      );
  }

  // ── Numeric (estimatedMinutes) ───────────────────────────────────────────
  if (options.estimateLt !== undefined) {
    if (!Number.isFinite(options.estimateLt)) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid estimateLt: ${String(options.estimateLt)}`
        )
      );
    } else {
      conditions.push(
        `(t.estimatedMinutes != null && t.estimatedMinutes < ${String(options.estimateLt)})`
      );
    }
  }
  if (options.estimateGt !== undefined) {
    if (!Number.isFinite(options.estimateGt)) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid estimateGt: ${String(options.estimateGt)}`
        )
      );
    } else {
      conditions.push(
        `(t.estimatedMinutes != null && t.estimatedMinutes > ${String(options.estimateGt)})`
      );
    }
  }
  if (options.estimateEq !== undefined) {
    if (!Number.isFinite(options.estimateEq)) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid estimateEq: ${String(options.estimateEq)}`
        )
      );
    } else {
      conditions.push(
        `(t.estimatedMinutes != null && t.estimatedMinutes === ${String(options.estimateEq)})`
      );
    }
  }
  if (options.estimateBetween !== undefined) {
    const range = options.estimateBetween;
    // Type guarantees a tuple of two numbers, but we still validate finiteness
    // because `NaN`/`Infinity` are valid `number` values.
    if (!Number.isFinite(range[0]) || !Number.isFinite(range[1])) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "Invalid estimateBetween",
          "Must be a tuple [min, max] of finite numbers"
        )
      );
    } else {
      const [min, max] = range;
      if (min > max) {
        validationErrors.push(
          createError(
            ErrorCode.VALIDATION_ERROR,
            `estimateBetween min (${String(min)}) > max (${String(max)})`
          )
        );
      } else {
        conditions.push(
          `(t.estimatedMinutes != null && t.estimatedMinutes >= ${String(min)} && t.estimatedMinutes <= ${String(max)})`
        );
      }
    }
  }

  // ── String matching ──────────────────────────────────────────────────────
  const caseSensitive = options.caseSensitive === true;

  if (options.nameContains !== undefined) {
    const err = validateNames([options.nameContains], "nameContains");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.nameContains)}"`
        : `"${escapeJSString(options.nameContains.toLowerCase())}"`;
      const haystack = caseSensitive ? "t.name" : "t.name.toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) !== -1)`);
    }
  }
  if (options.nameStarts !== undefined) {
    const err = validateNames([options.nameStarts], "nameStarts");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.nameStarts)}"`
        : `"${escapeJSString(options.nameStarts.toLowerCase())}"`;
      const haystack = caseSensitive ? "t.name" : "t.name.toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) === 0)`);
    }
  }
  if (options.nameEquals !== undefined) {
    const err = validateNames([options.nameEquals], "nameEquals");
    if (err) {
      validationErrors.push(err);
    } else if (caseSensitive) {
      conditions.push(
        `(t.name === "${escapeJSString(options.nameEquals)}")`
      );
    } else {
      conditions.push(
        `(t.name.toLowerCase() === "${escapeJSString(options.nameEquals.toLowerCase())}")`
      );
    }
  }
  if (options.nameRegex !== undefined) {
    const err = validateRegex(options.nameRegex, "nameRegex");
    if (err) {
      validationErrors.push(err);
    } else {
      const flags = caseSensitive ? "" : "i";
      conditions.push(
        `(new RegExp("${escapeJSString(options.nameRegex)}", "${flags}")).test(t.name)`
      );
    }
  }
  if (options.noteContains !== undefined) {
    const err = validateNames([options.noteContains], "noteContains");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.noteContains)}"`
        : `"${escapeJSString(options.noteContains.toLowerCase())}"`;
      const haystack = caseSensitive
        ? "(t.note || '')"
        : "(t.note || '').toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) !== -1)`);
    }
  }
  if (options.noteRegex !== undefined) {
    const err = validateRegex(options.noteRegex, "noteRegex");
    if (err) {
      validationErrors.push(err);
    } else {
      const flags = caseSensitive ? "" : "i";
      conditions.push(
        `(new RegExp("${escapeJSString(options.noteRegex)}", "${flags}")).test(t.note || "")`
      );
    }
  }

  return { conditions, validationErrors };
}

/**
 * Pre-flight check that a regex pattern is syntactically valid in V8/JSC.
 * We compile it locally and discard the result — if it throws, we know OmniJS
 * would have thrown too.
 */
function validateRegex(pattern: string, fieldLabel: string): CliError | null {
  if (pattern.includes('"') || pattern.includes("\\\\")) {
    // We tolerate single backslashes (regex escapes); the AppleScript-safety
    // layer in omnijs.ts handles escaping for the wire format.
  }
  try {
    new RegExp(pattern);
    return null;
  } catch (err) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid ${fieldLabel}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Validate a finite number for a numeric predicate. Returns a `CliError` on
 * failure, `null` on success.
 */
function validateFinite(
  value: number,
  fieldLabel: string
): CliError | null {
  if (!Number.isFinite(value)) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid ${fieldLabel}: ${String(value)}`
    );
  }
  return null;
}

/**
 * Compile the predicate vocabulary on {@link ProjectQueryOptions} into a list
 * of OmniJS boolean expressions over the project variable `t`.
 *
 * Every predicate-bearing field that is set in `options` contributes one
 * expression. Date predicates are resolved through {@link parseDate} so callers
 * may pass relative expressions like `"7d"` or `"tomorrow"`.
 *
 * @public
 */
export function compileProjectPredicates(
  options: ProjectQueryOptions
): CompiledPredicates {
  const conditions: string[] = [];
  const validationErrors: CliError[] = [];

  // ── Boolean state ────────────────────────────────────────────────────────
  if (options.flagged === true) conditions.push("t.flagged");
  if (options.flagged === false) conditions.push("!t.flagged");
  if (options.notFlagged === true) conditions.push("!t.flagged");

  if (options.sequential === true) conditions.push("t.sequential");
  if (options.sequential === false) conditions.push("!t.sequential");
  if (options.notSequential === true) conditions.push("!t.sequential");

  if (options.containsSingletonActions === true)
    conditions.push("t.containsSingletonActions");
  if (options.containsSingletonActions === false)
    conditions.push("!t.containsSingletonActions");
  if (options.notContainsSingletonActions === true)
    conditions.push("!t.containsSingletonActions");

  if (options.hasDue === true) conditions.push("(t.dueDate != null)");
  if (options.hasDue === false) conditions.push("(t.dueDate == null)");
  if (options.noDue === true) conditions.push("(t.dueDate == null)");

  if (options.hasDefer === true) conditions.push("(t.deferDate != null)");
  if (options.hasDefer === false) conditions.push("(t.deferDate == null)");

  if (options.hasNote === true)
    conditions.push('(t.note != null && t.note !== "")');
  if (options.hasNote === false)
    conditions.push('(t.note == null || t.note === "")');

  if (options.hasNextReview === true)
    conditions.push("(t.nextReviewDate != null)");
  if (options.hasNextReview === false)
    conditions.push("(t.nextReviewDate == null)");

  if (options.dueForReview === true)
    conditions.push(
      "(t.nextReviewDate != null && t.nextReviewDate <= new Date())"
    );
  if (options.dueForReview === false)
    conditions.push(
      "(t.nextReviewDate == null || t.nextReviewDate > new Date())"
    );

  // ── Status ────────────────────────────────────────────────────────────────
  if (options.status !== undefined) {
    switch (options.status) {
      case "active":
        conditions.push("(t.status === Project.Status.Active)");
        break;
      case "on-hold":
        conditions.push("(t.status === Project.Status.OnHold)");
        break;
      case "completed":
        conditions.push("(t.status === Project.Status.Done)");
        break;
      case "dropped":
        conditions.push("(t.status === Project.Status.Dropped)");
        break;
      default: {
        const exhaustive: never = options.status;
        validationErrors.push(
          createError(
            ErrorCode.VALIDATION_ERROR,
            `Unknown status: ${String(exhaustive)}`,
            "Valid values: active, on-hold, completed, dropped"
          )
        );
      }
    }
  }

  // ── Membership: folder (transitive) ──────────────────────────────────────
  const folders = toList(options.folder);
  if (folders !== null) {
    if (folders.length === 0) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "folder filter cannot be an empty array"
        )
      );
    } else {
      const nameError = validateNames(folders, "folder");
      if (nameError) {
        validationErrors.push(nameError);
      } else {
        const arr = jsStringArray(folders);
        // Walk up the parentFolder chain from the project's direct parent.
        conditions.push(
          `(function() {
  var f = t.parentFolder;
  var wanted = ${arr};
  while (f != null) {
    if (wanted.indexOf(f.name) !== -1 || wanted.indexOf(f.id.primaryKey) !== -1) return true;
    f = f.parent;
  }
  return false;
})()`
        );
      }
    }
  }

  // ── Date predicates: dueDate ─────────────────────────────────────────────
  if (options.dueBefore !== undefined) {
    const expr = resolveDate(options.dueBefore, "dueBefore", validationErrors);
    if (expr) conditions.push(`(t.dueDate != null && t.dueDate < ${expr})`);
  }
  if (options.dueAfter !== undefined) {
    const expr = resolveDate(options.dueAfter, "dueAfter", validationErrors);
    if (expr) conditions.push(`(t.dueDate != null && t.dueDate > ${expr})`);
  }
  if (options.dueOn !== undefined) {
    const parsed = parseDate(options.dueOn);
    if ("code" in parsed) {
      validationErrors.push(
        createError(parsed.code, `Invalid dueOn: ${parsed.message}`, parsed.details)
      );
    } else {
      const start = new Date(parsed.iso);
      const startUtc = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate(),
          0, 0, 0, 0
        )
      );
      const endUtc = new Date(startUtc.getTime() + 86_400_000);
      conditions.push(
        `(t.dueDate != null && t.dueDate >= ${isoToOmniJSDate(startUtc.toISOString())} && t.dueDate < ${isoToOmniJSDate(endUtc.toISOString())})`
      );
    }
  }
  if (options.dueWithin !== undefined) {
    const dur = parseDuration(options.dueWithin);
    if (typeof dur !== "number") {
      validationErrors.push(
        createError(dur.code, `Invalid dueWithin: ${dur.message}`, dur.details)
      );
    } else {
      const future = new Date(Date.now() + dur);
      conditions.push(
        `(t.dueDate != null && t.dueDate >= new Date() && t.dueDate <= ${isoToOmniJSDate(future.toISOString())})`
      );
    }
  }

  // ── Date predicates: deferDate ───────────────────────────────────────────
  if (options.deferBefore !== undefined) {
    const expr = resolveDate(options.deferBefore, "deferBefore", validationErrors);
    if (expr)
      conditions.push(`(t.deferDate != null && t.deferDate < ${expr})`);
  }
  if (options.deferAfter !== undefined) {
    const expr = resolveDate(options.deferAfter, "deferAfter", validationErrors);
    if (expr)
      conditions.push(`(t.deferDate != null && t.deferDate > ${expr})`);
  }
  if (options.deferWithin !== undefined) {
    const dur = parseDuration(options.deferWithin);
    if (typeof dur !== "number") {
      validationErrors.push(
        createError(dur.code, `Invalid deferWithin: ${dur.message}`, dur.details)
      );
    } else {
      const future = new Date(Date.now() + dur);
      conditions.push(
        `(t.deferDate != null && t.deferDate >= new Date() && t.deferDate <= ${isoToOmniJSDate(future.toISOString())})`
      );
    }
  }

  // ── Date predicates: completionDate ──────────────────────────────────────
  if (options.completedBefore !== undefined) {
    const expr = resolveDate(
      options.completedBefore,
      "completedBefore",
      validationErrors
    );
    if (expr)
      conditions.push(
        `(t.completionDate != null && t.completionDate < ${expr})`
      );
  }
  if (options.completedAfter !== undefined) {
    const expr = resolveDate(
      options.completedAfter,
      "completedAfter",
      validationErrors
    );
    if (expr)
      conditions.push(
        `(t.completionDate != null && t.completionDate > ${expr})`
      );
  }

  // ── Date predicates: nextReviewDate ──────────────────────────────────────
  if (options.nextReviewBefore !== undefined) {
    const expr = resolveDate(
      options.nextReviewBefore,
      "nextReviewBefore",
      validationErrors
    );
    if (expr)
      conditions.push(
        `(t.nextReviewDate != null && t.nextReviewDate < ${expr})`
      );
  }
  if (options.nextReviewAfter !== undefined) {
    const expr = resolveDate(
      options.nextReviewAfter,
      "nextReviewAfter",
      validationErrors
    );
    if (expr)
      conditions.push(
        `(t.nextReviewDate != null && t.nextReviewDate > ${expr})`
      );
  }
  if (options.nextReviewWithin !== undefined) {
    const dur = parseDuration(options.nextReviewWithin);
    if (typeof dur !== "number") {
      validationErrors.push(
        createError(
          dur.code,
          `Invalid nextReviewWithin: ${dur.message}`,
          dur.details
        )
      );
    } else {
      const future = new Date(Date.now() + dur);
      conditions.push(
        `(t.nextReviewDate != null && t.nextReviewDate >= new Date() && t.nextReviewDate <= ${isoToOmniJSDate(future.toISOString())})`
      );
    }
  }

  // ── Date predicates: lastReviewDate ──────────────────────────────────────
  if (options.lastReviewedBefore !== undefined) {
    const expr = resolveDate(
      options.lastReviewedBefore,
      "lastReviewedBefore",
      validationErrors
    );
    if (expr)
      conditions.push(
        `(t.lastReviewDate != null && t.lastReviewDate < ${expr})`
      );
  }
  if (options.lastReviewedAfter !== undefined) {
    const expr = resolveDate(
      options.lastReviewedAfter,
      "lastReviewedAfter",
      validationErrors
    );
    if (expr)
      conditions.push(
        `(t.lastReviewDate != null && t.lastReviewDate > ${expr})`
      );
  }

  // ── Numeric: taskCount ───────────────────────────────────────────────────
  if (options.taskCountLt !== undefined) {
    const err = validateFinite(options.taskCountLt, "taskCountLt");
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.task.flattenedTasks.length < ${String(options.taskCountLt)})`
      );
    }
  }
  if (options.taskCountGt !== undefined) {
    const err = validateFinite(options.taskCountGt, "taskCountGt");
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.task.flattenedTasks.length > ${String(options.taskCountGt)})`
      );
    }
  }
  if (options.taskCountEq !== undefined) {
    const err = validateFinite(options.taskCountEq, "taskCountEq");
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.task.flattenedTasks.length === ${String(options.taskCountEq)})`
      );
    }
  }

  // ── Numeric: remainingTaskCount ──────────────────────────────────────────
  const remainingExpr =
    "t.task.flattenedTasks.filter(function(s){ return !s.completed && !s.effectivelyDropped; }).length";

  if (options.remainingTaskCountLt !== undefined) {
    const err = validateFinite(
      options.remainingTaskCountLt,
      "remainingTaskCountLt"
    );
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(${remainingExpr} < ${String(options.remainingTaskCountLt)})`
      );
    }
  }
  if (options.remainingTaskCountGt !== undefined) {
    const err = validateFinite(
      options.remainingTaskCountGt,
      "remainingTaskCountGt"
    );
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(${remainingExpr} > ${String(options.remainingTaskCountGt)})`
      );
    }
  }
  if (options.remainingTaskCountEq !== undefined) {
    const err = validateFinite(
      options.remainingTaskCountEq,
      "remainingTaskCountEq"
    );
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(${remainingExpr} === ${String(options.remainingTaskCountEq)})`
      );
    }
  }

  // ── String matching ──────────────────────────────────────────────────────
  const caseSensitive = options.caseSensitive === true;

  if (options.nameContains !== undefined) {
    const err = validateNames([options.nameContains], "nameContains");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.nameContains)}"`
        : `"${escapeJSString(options.nameContains.toLowerCase())}"`;
      const haystack = caseSensitive ? "t.name" : "t.name.toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) !== -1)`);
    }
  }
  if (options.nameStarts !== undefined) {
    const err = validateNames([options.nameStarts], "nameStarts");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.nameStarts)}"`
        : `"${escapeJSString(options.nameStarts.toLowerCase())}"`;
      const haystack = caseSensitive ? "t.name" : "t.name.toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) === 0)`);
    }
  }
  if (options.nameEquals !== undefined) {
    const err = validateNames([options.nameEquals], "nameEquals");
    if (err) {
      validationErrors.push(err);
    } else if (caseSensitive) {
      conditions.push(
        `(t.name === "${escapeJSString(options.nameEquals)}")`
      );
    } else {
      conditions.push(
        `(t.name.toLowerCase() === "${escapeJSString(options.nameEquals.toLowerCase())}")`
      );
    }
  }
  if (options.nameRegex !== undefined) {
    const err = validateRegex(options.nameRegex, "nameRegex");
    if (err) {
      validationErrors.push(err);
    } else {
      const flags = caseSensitive ? "" : "i";
      conditions.push(
        `(new RegExp("${escapeJSString(options.nameRegex)}", "${flags}")).test(t.name)`
      );
    }
  }
  if (options.noteContains !== undefined) {
    const err = validateNames([options.noteContains], "noteContains");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.noteContains)}"`
        : `"${escapeJSString(options.noteContains.toLowerCase())}"`;
      const haystack = caseSensitive
        ? "(t.note || '')"
        : "(t.note || '').toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) !== -1)`);
    }
  }
  if (options.noteRegex !== undefined) {
    const err = validateRegex(options.noteRegex, "noteRegex");
    if (err) {
      validationErrors.push(err);
    } else {
      const flags = caseSensitive ? "" : "i";
      conditions.push(
        `(new RegExp("${escapeJSString(options.noteRegex)}", "${flags}")).test(t.note || "")`
      );
    }
  }

  return { conditions, validationErrors };
}

/**
 * Build an OmniJS IIFE that walks up a tag's parent chain and returns true
 * if any ancestor matches any of the given name/id values.
 */
function buildAncestorCondition(wanted: string[]): string {
  const arr = jsStringArray(wanted);
  return `(function() {
  var p = t.parent;
  var wanted = ${arr};
  while (p != null) {
    if (wanted.indexOf(p.name) !== -1 || wanted.indexOf(p.id.primaryKey) !== -1) return true;
    p = p.parent;
  }
  return false;
})()`;
}

/**
 * Compile the predicate vocabulary on {@link TagQueryOptions} into a list of
 * OmniJS boolean expressions over the tag variable `t`.
 *
 * Every predicate-bearing field that is set in `options` contributes one
 * expression. Boolean predicates are emitted as-is.
 *
 * @public
 */
export function compileTagPredicates(
  options: TagQueryOptions
): CompiledPredicates {
  const conditions: string[] = [];
  const validationErrors: CliError[] = [];

  // ── Boolean state ────────────────────────────────────────────────────────
  if (options.isRoot === true) conditions.push("(t.parent == null)");
  if (options.isRoot === false) conditions.push("(t.parent != null)");
  if (options.notIsRoot === true) conditions.push("(t.parent != null)");

  if (options.hasChildren === true) conditions.push("(t.tags.length > 0)");
  if (options.noChildren === true) conditions.push("(t.tags.length === 0)");

  if (options.hasNote === true)
    conditions.push('(t.note != null && t.note !== "")');
  if (options.hasNote === false)
    conditions.push('(t.note == null || t.note === "")');

  if (options.allowsNextAction === true)
    conditions.push("(t.allowsNextAction === true)");
  if (options.disallowsNextAction === true)
    conditions.push("(t.allowsNextAction === false)");

  if (options.hasAvailableTasks === true)
    conditions.push("(t.availableTaskCount > 0)");
  if (options.noAvailableTasks === true)
    conditions.push("(t.availableTaskCount === 0)");

  // ── Status ────────────────────────────────────────────────────────────────
  if (options.status !== undefined) {
    switch (options.status) {
      case "active":
        conditions.push("(t.status === Tag.Status.Active)");
        break;
      case "on-hold":
        conditions.push("(t.status === Tag.Status.OnHold)");
        break;
      case "dropped":
        conditions.push("(t.status === Tag.Status.Dropped)");
        break;
      default: {
        const exhaustive: never = options.status;
        validationErrors.push(
          createError(
            ErrorCode.VALIDATION_ERROR,
            `Unknown tag status: ${String(exhaustive)}`,
            "Valid values: active, on-hold, dropped"
          )
        );
      }
    }
  }

  // ── Membership: parent (exact) ────────────────────────────────────────────
  const parents = toList(options.parent);
  if (parents !== null) {
    if (parents.length === 0) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "parent filter cannot be an empty array"
        )
      );
    } else {
      const nameError = validateNames(parents, "parent");
      if (nameError) {
        validationErrors.push(nameError);
      } else if (parents.length === 1) {
        const v = parents[0] ?? "";
        conditions.push(
          `(t.parent != null && (t.parent.name === "${escapeJSString(v)}" || t.parent.id.primaryKey === "${escapeJSString(v)}"))`
        );
      } else {
        const arr = jsStringArray(parents);
        conditions.push(
          `(t.parent != null && (${arr}.indexOf(t.parent.name) !== -1 || ${arr}.indexOf(t.parent.id.primaryKey) !== -1))`
        );
      }
    }
  }

  // ── Membership: ancestor (transitive) ────────────────────────────────────
  const ancestors = toList(options.ancestor);
  if (ancestors !== null) {
    if (ancestors.length === 0) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "ancestor filter cannot be an empty array"
        )
      );
    } else {
      const nameError = validateNames(ancestors, "ancestor");
      if (nameError) {
        validationErrors.push(nameError);
      } else {
        conditions.push(buildAncestorCondition(ancestors));
      }
    }
  }

  // ── Numeric: availableTaskCount ──────────────────────────────────────────
  if (options.availableTaskCountLt !== undefined) {
    const err = validateFinite(options.availableTaskCountLt, "availableTaskCountLt");
    if (err) { validationErrors.push(err); }
    else { conditions.push(`(t.availableTaskCount < ${String(options.availableTaskCountLt)})`); }
  }
  if (options.availableTaskCountGt !== undefined) {
    const err = validateFinite(options.availableTaskCountGt, "availableTaskCountGt");
    if (err) { validationErrors.push(err); }
    else { conditions.push(`(t.availableTaskCount > ${String(options.availableTaskCountGt)})`); }
  }
  if (options.availableTaskCountEq !== undefined) {
    const err = validateFinite(options.availableTaskCountEq, "availableTaskCountEq");
    if (err) { validationErrors.push(err); }
    else { conditions.push(`(t.availableTaskCount === ${String(options.availableTaskCountEq)})`); }
  }

  // ── Numeric: remainingTaskCount ──────────────────────────────────────────
  if (options.remainingTaskCountLt !== undefined) {
    const err = validateFinite(options.remainingTaskCountLt, "remainingTaskCountLt");
    if (err) { validationErrors.push(err); }
    else { conditions.push(`(t.remainingTaskCount < ${String(options.remainingTaskCountLt)})`); }
  }
  if (options.remainingTaskCountGt !== undefined) {
    const err = validateFinite(options.remainingTaskCountGt, "remainingTaskCountGt");
    if (err) { validationErrors.push(err); }
    else { conditions.push(`(t.remainingTaskCount > ${String(options.remainingTaskCountGt)})`); }
  }

  // ── Numeric: childTagCount ───────────────────────────────────────────────
  if (options.childTagCountLt !== undefined) {
    const err = validateFinite(options.childTagCountLt, "childTagCountLt");
    if (err) { validationErrors.push(err); }
    else { conditions.push(`(t.tags.length < ${String(options.childTagCountLt)})`); }
  }
  if (options.childTagCountGt !== undefined) {
    const err = validateFinite(options.childTagCountGt, "childTagCountGt");
    if (err) { validationErrors.push(err); }
    else { conditions.push(`(t.tags.length > ${String(options.childTagCountGt)})`); }
  }

  // ── String matching ──────────────────────────────────────────────────────
  const caseSensitive = options.caseSensitive === true;

  if (options.nameContains !== undefined) {
    const err = validateNames([options.nameContains], "nameContains");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.nameContains)}"`
        : `"${escapeJSString(options.nameContains.toLowerCase())}"`;
      const haystack = caseSensitive ? "t.name" : "t.name.toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) !== -1)`);
    }
  }
  if (options.nameStarts !== undefined) {
    const err = validateNames([options.nameStarts], "nameStarts");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.nameStarts)}"`
        : `"${escapeJSString(options.nameStarts.toLowerCase())}"`;
      const haystack = caseSensitive ? "t.name" : "t.name.toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) === 0)`);
    }
  }
  if (options.nameEquals !== undefined) {
    const err = validateNames([options.nameEquals], "nameEquals");
    if (err) {
      validationErrors.push(err);
    } else if (caseSensitive) {
      conditions.push(`(t.name === "${escapeJSString(options.nameEquals)}")`);
    } else {
      conditions.push(
        `(t.name.toLowerCase() === "${escapeJSString(options.nameEquals.toLowerCase())}")`
      );
    }
  }
  if (options.nameRegex !== undefined) {
    const err = validateRegex(options.nameRegex, "nameRegex");
    if (err) {
      validationErrors.push(err);
    } else {
      const flags = caseSensitive ? "" : "i";
      conditions.push(
        `(new RegExp("${escapeJSString(options.nameRegex)}", "${flags}")).test(t.name)`
      );
    }
  }
  if (options.noteContains !== undefined) {
    const err = validateNames([options.noteContains], "noteContains");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.noteContains)}"`
        : `"${escapeJSString(options.noteContains.toLowerCase())}"`;
      const haystack = caseSensitive
        ? "(t.note || '')"
        : "(t.note || '').toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) !== -1)`);
    }
  }
  if (options.noteRegex !== undefined) {
    const err = validateRegex(options.noteRegex, "noteRegex");
    if (err) {
      validationErrors.push(err);
    } else {
      const flags = caseSensitive ? "" : "i";
      conditions.push(
        `(new RegExp("${escapeJSString(options.noteRegex)}", "${flags}")).test(t.note || "")`
      );
    }
  }

  return { conditions, validationErrors };
}

/**
 * Compile the predicate vocabulary on {@link FolderQueryOptions} into a list of
 * OmniJS boolean expressions over the folder variable `t`.
 *
 * Every predicate-bearing field that is set in `options` contributes one
 * expression. Boolean predicates are emitted as-is. String predicates respect
 * `caseSensitive` (default: false).
 *
 * @public
 */
export function compileFolderPredicates(
  options: FolderQueryOptions
): CompiledPredicates {
  const conditions: string[] = [];
  const validationErrors: CliError[] = [];

  // ── Boolean state ────────────────────────────────────────────────────────
  if (options.isRoot === true) conditions.push("(t.parent == null)");
  if (options.isRoot === false) conditions.push("(t.parent != null)");
  if (options.notIsRoot === true) conditions.push("(t.parent != null)");

  if (options.hasProjects === true)
    conditions.push("(t.projects.length > 0)");
  if (options.hasProjects === false)
    conditions.push("(t.projects.length === 0)");
  if (options.noProjects === true) conditions.push("(t.projects.length === 0)");

  if (options.hasSubfolders === true)
    conditions.push("(t.folders.length > 0)");
  if (options.hasSubfolders === false)
    conditions.push("(t.folders.length === 0)");
  if (options.noSubfolders === true)
    conditions.push("(t.folders.length === 0)");

  if (options.isEmpty === true)
    conditions.push("(t.projects.length === 0 && t.folders.length === 0)");
  if (options.isEmpty === false)
    conditions.push("(t.projects.length > 0 || t.folders.length > 0)");

  // ── Status ────────────────────────────────────────────────────────────────
  if (options.status !== undefined) {
    // Narrowing to a local binding lets TypeScript track the exhaustive check.
    const s: FolderStatus = options.status;
    switch (s) {
      case "active":
        conditions.push("(t.status === Folder.Status.Active)");
        break;
      case "dropped":
        conditions.push("(t.status !== Folder.Status.Active)");
        break;
      default: {
        const exhaustive: never = s;
        validationErrors.push(
          createError(
            ErrorCode.VALIDATION_ERROR,
            `Unknown status: ${String(exhaustive)}`,
            "Valid values: active, dropped"
          )
        );
      }
    }
  }

  // ── Membership: parent (exact, non-transitive) ────────────────────────────
  const parents = toList(options.parent);
  if (parents !== null) {
    if (parents.length === 0) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "parent filter cannot be an empty array"
        )
      );
    } else {
      const nameError = validateNames(parents, "parent");
      if (nameError) {
        validationErrors.push(nameError);
      } else if (parents.length === 1) {
        const val = parents[0] ?? "";
        conditions.push(
          `(t.parent != null && (t.parent.name === "${escapeJSString(val)}" || t.parent.id.primaryKey === "${escapeJSString(val)}"))`
        );
      } else {
        const arr = jsStringArray(parents);
        conditions.push(
          `(t.parent != null && (${arr}.indexOf(t.parent.name) !== -1 || ${arr}.indexOf(t.parent.id.primaryKey) !== -1))`
        );
      }
    }
  }

  // ── Membership: ancestor (transitive) ────────────────────────────────────
  // Reuses `buildAncestorCondition` — the OmniJS IIFE walks `t.parent` up the
  // folder hierarchy, which is correct for both Tag and Folder entities.
  const ancestorList = toList(options.ancestor);
  if (ancestorList !== null) {
    if (ancestorList.length === 0) {
      validationErrors.push(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "ancestor filter cannot be an empty array"
        )
      );
    } else {
      const nameError = validateNames(ancestorList, "ancestor");
      if (nameError) {
        validationErrors.push(nameError);
      } else {
        conditions.push(buildAncestorCondition(ancestorList));
      }
    }
  }

  // ── Numeric: projectCount (direct children) ───────────────────────────────
  if (options.projectCountLt !== undefined) {
    const err = validateFinite(options.projectCountLt, "projectCountLt");
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.projects.length < ${String(options.projectCountLt)})`
      );
    }
  }
  if (options.projectCountGt !== undefined) {
    const err = validateFinite(options.projectCountGt, "projectCountGt");
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.projects.length > ${String(options.projectCountGt)})`
      );
    }
  }
  if (options.projectCountEq !== undefined) {
    const err = validateFinite(options.projectCountEq, "projectCountEq");
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.projects.length === ${String(options.projectCountEq)})`
      );
    }
  }

  // ── Numeric: flattenedProjectCount (recursive) ────────────────────────────
  if (options.flattenedProjectCountLt !== undefined) {
    const err = validateFinite(
      options.flattenedProjectCountLt,
      "flattenedProjectCountLt"
    );
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.flattenedProjects.length < ${String(options.flattenedProjectCountLt)})`
      );
    }
  }
  if (options.flattenedProjectCountGt !== undefined) {
    const err = validateFinite(
      options.flattenedProjectCountGt,
      "flattenedProjectCountGt"
    );
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.flattenedProjects.length > ${String(options.flattenedProjectCountGt)})`
      );
    }
  }

  // ── Numeric: folderCount (direct children) ────────────────────────────────
  if (options.folderCountLt !== undefined) {
    const err = validateFinite(options.folderCountLt, "folderCountLt");
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.folders.length < ${String(options.folderCountLt)})`
      );
    }
  }
  if (options.folderCountGt !== undefined) {
    const err = validateFinite(options.folderCountGt, "folderCountGt");
    if (err) {
      validationErrors.push(err);
    } else {
      conditions.push(
        `(t.folders.length > ${String(options.folderCountGt)})`
      );
    }
  }

  // ── String matching ──────────────────────────────────────────────────────
  const caseSensitive = options.caseSensitive === true;

  if (options.nameContains !== undefined) {
    const err = validateNames([options.nameContains], "nameContains");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.nameContains)}"`
        : `"${escapeJSString(options.nameContains.toLowerCase())}"`;
      const haystack = caseSensitive ? "t.name" : "t.name.toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) !== -1)`);
    }
  }
  if (options.nameStarts !== undefined) {
    const err = validateNames([options.nameStarts], "nameStarts");
    if (err) {
      validationErrors.push(err);
    } else {
      const needle = caseSensitive
        ? `"${escapeJSString(options.nameStarts)}"`
        : `"${escapeJSString(options.nameStarts.toLowerCase())}"`;
      const haystack = caseSensitive ? "t.name" : "t.name.toLowerCase()";
      conditions.push(`(${haystack}.indexOf(${needle}) === 0)`);
    }
  }
  if (options.nameEquals !== undefined) {
    const err = validateNames([options.nameEquals], "nameEquals");
    if (err) {
      validationErrors.push(err);
    } else if (caseSensitive) {
      conditions.push(
        `(t.name === "${escapeJSString(options.nameEquals)}")`
      );
    } else {
      conditions.push(
        `(t.name.toLowerCase() === "${escapeJSString(options.nameEquals.toLowerCase())}")`
      );
    }
  }
  if (options.nameRegex !== undefined) {
    const err = validateRegex(options.nameRegex, "nameRegex");
    if (err) {
      validationErrors.push(err);
    } else {
      const flags = caseSensitive ? "" : "i";
      conditions.push(
        `(new RegExp("${escapeJSString(options.nameRegex)}", "${flags}")).test(t.name)`
      );
    }
  }

  return { conditions, validationErrors };
}

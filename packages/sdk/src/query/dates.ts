import { type CliError, ErrorCode, createError } from "../errors.js";

/**
 * A successfully-parsed date, normalized to ISO 8601 UTC.
 *
 * @public
 */
export interface ParsedDate {
  /** ISO 8601 with milliseconds and Z suffix, e.g. `2026-05-30T00:00:00.000Z`. */
  iso: string;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const MS_PER_WEEK = MS_PER_DAY * 7;
const MS_PER_MONTH_APPROX = MS_PER_DAY * 30;
const MS_PER_YEAR_APPROX = MS_PER_DAY * 365;

/**
 * Parse a duration like `7d`, `1w`, `2m`, `1y` into milliseconds.
 *
 * Units:
 * - `d` — day (24h)
 * - `w` — week (7d)
 * - `m` — month (30d, approximate)
 * - `y` — year (365d, approximate)
 *
 * Returns the millisecond value, or a `CliError` for invalid input.
 *
 * @public
 */
export function parseDuration(input: string): number | CliError {
  if (typeof input !== "string") {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      "Duration must be a string",
      `Got: ${typeof input}`
    );
  }

  const trimmed = input.trim().toLowerCase();
  const match = /^(\d+)\s*([dwmy])$/.exec(trimmed);

  if (!match) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid duration: ${input}`,
      'Expected format: "<number><d|w|m|y>" (e.g., "7d", "1w", "2m", "1y")'
    );
  }

  const quantityStr = match[1];
  const unit = match[2];

  if (quantityStr === undefined || unit === undefined) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid duration: ${input}`
    );
  }

  const quantity = Number.parseInt(quantityStr, 10);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid duration quantity: ${quantityStr}`
    );
  }

  switch (unit) {
    case "d":
      return quantity * MS_PER_DAY;
    case "w":
      return quantity * MS_PER_WEEK;
    case "m":
      return quantity * MS_PER_MONTH_APPROX;
    case "y":
      return quantity * MS_PER_YEAR_APPROX;
    default:
      return createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid duration unit: ${unit}`
      );
  }
}

/**
 * Parse a date string supporting:
 * - ISO 8601 calendar date: `2026-05-30`
 * - ISO 8601 datetime: `2026-05-30T14:00:00Z` or `2026-05-30T14:00:00`
 * - Natural relative: `today`, `tomorrow`, `yesterday`
 * - Offsets: `7d`, `1w`, `2m`, `1y` (interpreted as `now + duration`)
 * - Prefixed offsets: `in 3 days`, `in 1 week`, `in 2 months`, `in 1 year`
 *
 * Returns the normalized ISO string, or a `CliError` for invalid input.
 *
 * @param input - The date expression to parse.
 * @param now - Reference time for relative expressions. Defaults to current time.
 *
 * @public
 */
export function parseDate(input: string, now?: Date): ParsedDate | CliError {
  if (typeof input !== "string") {
    return createError(
      ErrorCode.INVALID_DATE_FORMAT,
      "Date must be a string",
      `Got: ${typeof input}`
    );
  }

  const trimmed = input.trim();
  if (trimmed === "") {
    return createError(ErrorCode.INVALID_DATE_FORMAT, "Date cannot be empty");
  }

  // Reject obvious injection vectors before any further processing.
  if (trimmed.includes('"') || trimmed.includes("\\")) {
    return createError(
      ErrorCode.INVALID_DATE_FORMAT,
      "Invalid characters in date string",
      "Date strings cannot contain quotes or backslashes"
    );
  }

  const reference = now ?? new Date();
  const lower = trimmed.toLowerCase();

  // Natural relative keywords
  if (lower === "now") {
    return { iso: reference.toISOString() };
  }
  if (lower === "today") {
    return { iso: startOfDayUtc(reference).toISOString() };
  }
  if (lower === "tomorrow") {
    const t = startOfDayUtc(reference);
    t.setUTCDate(t.getUTCDate() + 1);
    return { iso: t.toISOString() };
  }
  if (lower === "yesterday") {
    const t = startOfDayUtc(reference);
    t.setUTCDate(t.getUTCDate() - 1);
    return { iso: t.toISOString() };
  }

  // Prefixed offset: "in 3 days" / "in 1 week" / "in 2 months" / "in 1 year"
  const inMatch = /^in\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)$/i.exec(
    lower
  );
  if (inMatch) {
    const quantityStr = inMatch[1];
    const unit = inMatch[2];
    if (quantityStr === undefined || unit === undefined) {
      return createError(
        ErrorCode.INVALID_DATE_FORMAT,
        `Invalid relative date: ${input}`
      );
    }
    const quantity = Number.parseInt(quantityStr, 10);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return createError(
        ErrorCode.INVALID_DATE_FORMAT,
        `Invalid quantity in relative date: ${input}`
      );
    }
    const ms = unitToMs(unit, quantity);
    return { iso: new Date(reference.getTime() + ms).toISOString() };
  }

  // Bare offset: "7d" / "1w" / "2m" / "1y"
  if (/^\d+\s*[dwmy]$/i.test(lower)) {
    const duration = parseDuration(lower);
    if (typeof duration !== "number") {
      return duration;
    }
    return { iso: new Date(reference.getTime() + duration).toISOString() };
  }

  // ISO 8601 — let the platform parser handle it, but be picky about the shape
  // (Date constructor is lenient; we want to reject obviously invalid strings).
  const isoLike =
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  if (isoLike.test(trimmed)) {
    // If it's just a date (no time), interpret as UTC midnight.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    const candidate = dateOnly.test(trimmed)
      ? new Date(`${trimmed}T00:00:00.000Z`)
      : new Date(trimmed);
    if (!Number.isFinite(candidate.getTime())) {
      return createError(
        ErrorCode.INVALID_DATE_FORMAT,
        `Invalid ISO date: ${input}`
      );
    }
    return { iso: candidate.toISOString() };
  }

  return createError(
    ErrorCode.INVALID_DATE_FORMAT,
    `Unrecognized date format: ${input}`,
    'Expected ISO 8601, "today"/"tomorrow"/"yesterday", a duration like "7d", or "in N days/weeks/months/years"'
  );
}

function unitToMs(unit: string, quantity: number): number {
  switch (unit.toLowerCase()) {
    case "day":
    case "days":
      return quantity * MS_PER_DAY;
    case "week":
    case "weeks":
      return quantity * MS_PER_WEEK;
    case "month":
    case "months":
      return quantity * MS_PER_MONTH_APPROX;
    case "year":
    case "years":
      return quantity * MS_PER_YEAR_APPROX;
    default:
      return 0;
  }
}

function startOfDayUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
}

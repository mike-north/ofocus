import type { CliOutput, OFTask, RepetitionRule } from "../types.js";
import { failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { addToInbox } from "./inbox.js";

/**
 * Parsed result from quick capture input.
 */
export interface ParsedQuickInput {
  title: string;
  note: string | null;
  due: string | null;
  defer: string | null;
  flagged: boolean;
  tags: string[];
  project: string | null;
  estimatedMinutes: number | null;
  repeat: RepetitionRule | null;
}

/**
 * Quick capture options.
 */
export interface QuickOptions {
  /** Additional note text to add */
  note?: string | undefined;
}

/**
 * Date keywords for natural language parsing.
 */
const DATE_KEYWORDS: Record<string, () => string> = {
  today: () => formatDate(new Date()),
  tomorrow: () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  },
  yesterday: () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  },
  monday: () => getNextDayOfWeek(1),
  tuesday: () => getNextDayOfWeek(2),
  wednesday: () => getNextDayOfWeek(3),
  thursday: () => getNextDayOfWeek(4),
  friday: () => getNextDayOfWeek(5),
  saturday: () => getNextDayOfWeek(6),
  sunday: () => getNextDayOfWeek(0),
};

/**
 * Format date as string suitable for AppleScript.
 */
function formatDate(date: Date): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = months[date.getMonth()] ?? "January";
  return `${month} ${String(date.getDate())}, ${String(date.getFullYear())}`;
}

/**
 * Get next occurrence of a day of week (0=Sunday, 6=Saturday).
 */
function getNextDayOfWeek(targetDay: number): string {
  const d = new Date();
  const currentDay = d.getDay();
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }
  d.setDate(d.getDate() + daysToAdd);
  return formatDate(d);
}

/**
 * Parse duration strings like "30m", "1h", "1.5h".
 */
function parseDuration(duration: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(m|h|min|hour|hours|minutes?)$/i.exec(
    duration
  );
  if (match?.[1] === undefined || match[2] === undefined) return null;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "h" || unit === "hour" || unit === "hours") {
    return Math.round(value * 60);
  }
  return Math.round(value);
}

/**
 * Parse repetition strings like "daily", "weekly", "every 2 weeks".
 */
function parseRepetition(rep: string): RepetitionRule | null {
  const normalized = rep.toLowerCase();

  // Simple patterns
  if (normalized === "daily") {
    return { frequency: "daily", interval: 1, repeatMethod: "due-again" };
  }
  if (normalized === "weekly") {
    return { frequency: "weekly", interval: 1, repeatMethod: "due-again" };
  }
  if (normalized === "monthly") {
    return { frequency: "monthly", interval: 1, repeatMethod: "due-again" };
  }
  if (normalized === "yearly" || normalized === "annually") {
    return { frequency: "yearly", interval: 1, repeatMethod: "due-again" };
  }

  // "every N" patterns
  const everyMatch = /^every\s+(\d+)\s+(day|week|month|year)s?$/.exec(
    normalized
  );
  if (everyMatch?.[1] !== undefined && everyMatch[2] !== undefined) {
    const interval = parseInt(everyMatch[1], 10);
    const unit = everyMatch[2];
    const frequencyMap: Record<string, RepetitionRule["frequency"]> = {
      day: "daily",
      week: "weekly",
      month: "monthly",
      year: "yearly",
    };
    return {
      frequency: frequencyMap[unit] ?? "daily",
      interval,
      repeatMethod: "due-again",
    };
  }

  return null;
}

/**
 * Parse natural language quick capture input.
 *
 * Syntax:
 * - `@tagname` - Add a tag
 * - `#projectname` - Set project
 * - `!` or `!!` - Flag the task
 * - `~30m` or `~1h` - Set estimated duration
 * - `due:tomorrow` or `due:monday` - Set due date
 * - `defer:tomorrow` - Set defer date
 * - `repeat:daily` or `repeat:weekly` - Set repetition
 * - Everything else is the title
 */
export function parseQuickInput(input: string): ParsedQuickInput {
  const result: ParsedQuickInput = {
    title: "",
    note: null,
    due: null,
    defer: null,
    flagged: false,
    tags: [],
    project: null,
    estimatedMinutes: null,
    repeat: null,
  };

  // Tokenize while preserving quoted strings
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (const char of input) {
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      continue;
    }

    if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
      continue;
    }

    if (char === " " && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  const titleParts: string[] = [];

  for (const token of tokens) {
    // Tags: @tagname
    if (token.startsWith("@")) {
      const tag = token.slice(1);
      if (tag) {
        result.tags.push(tag);
      }
      continue;
    }

    // Project: #projectname
    if (token.startsWith("#")) {
      const project = token.slice(1);
      if (project) {
        result.project = project;
      }
      continue;
    }

    // Flags: ! or !!
    if (/^!+$/.test(token)) {
      result.flagged = true;
      continue;
    }

    // Estimated duration: ~30m, ~1h
    if (token.startsWith("~")) {
      const duration = parseDuration(token.slice(1));
      if (duration !== null) {
        result.estimatedMinutes = duration;
        continue;
      }
    }

    // Due date: due:tomorrow, due:monday
    if (token.toLowerCase().startsWith("due:")) {
      const dateKey = token.slice(4).toLowerCase();
      if (DATE_KEYWORDS[dateKey]) {
        result.due = DATE_KEYWORDS[dateKey]();
        continue;
      }
      // Try as literal date
      result.due = token.slice(4);
      continue;
    }

    // Defer date: defer:tomorrow
    if (token.toLowerCase().startsWith("defer:")) {
      const dateKey = token.slice(6).toLowerCase();
      if (DATE_KEYWORDS[dateKey]) {
        result.defer = DATE_KEYWORDS[dateKey]();
        continue;
      }
      // Try as literal date
      result.defer = token.slice(6);
      continue;
    }

    // Repetition: repeat:daily, repeat:weekly
    if (token.toLowerCase().startsWith("repeat:")) {
      const rep = parseRepetition(token.slice(7));
      if (rep) {
        result.repeat = rep;
        continue;
      }
    }

    // Everything else is part of the title
    titleParts.push(token);
  }

  result.title = titleParts.join(" ").trim();

  return result;
}

/**
 * Quick capture - parse natural language input and add task to inbox.
 */
export async function quickCapture(
  input: string,
  options: QuickOptions = {}
): Promise<CliOutput<OFTask>> {
  // Validate input
  if (!input || input.trim() === "") {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Input cannot be empty")
    );
  }

  // Parse the input
  const parsed = parseQuickInput(input);

  // Validate that we have a title
  if (!parsed.title) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Task title cannot be empty")
    );
  }

  // Add to inbox with parsed options
  return addToInbox(parsed.title, {
    note: options.note ?? parsed.note ?? undefined,
    due: parsed.due ?? undefined,
    defer: parsed.defer ?? undefined,
    flag: parsed.flagged,
    tags: parsed.tags.length > 0 ? parsed.tags : undefined,
    estimatedMinutes: parsed.estimatedMinutes ?? undefined,
    repeat: parsed.repeat ?? undefined,
  });
}

import type { RepetitionRule } from "../types.js";

/**
 * Build iCalendar RRULE string from a RepetitionRule.
 */
export function buildRRule(rule: RepetitionRule): string {
  const parts: string[] = [];

  // Frequency
  const freqMap = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY",
  } as const;
  parts.push(`FREQ=${freqMap[rule.frequency]}`);

  // Interval
  if (rule.interval > 1) {
    parts.push(`INTERVAL=${String(rule.interval)}`);
  }

  // Days of week (for weekly)
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const dayMap: Record<number, string> = {
      0: "SU",
      1: "MO",
      2: "TU",
      3: "WE",
      4: "TH",
      5: "FR",
      6: "SA",
    };
    const days = rule.daysOfWeek.map((d) => dayMap[d]).join(",");
    parts.push(`BYDAY=${days}`);
  }

  // Day of month (for monthly)
  if (rule.dayOfMonth !== undefined) {
    parts.push(`BYMONTHDAY=${String(rule.dayOfMonth)}`);
  }

  return parts.join(";");
}

/**
 * Build AppleScript to set a repetition rule on a task.
 * @param taskVar - The AppleScript variable name for the task
 * @param rule - The repetition rule to apply
 */
export function buildRepetitionRuleScript(
  taskVar: string,
  rule: RepetitionRule
): string {
  const rrule = buildRRule(rule);
  const repetitionMethod =
    rule.repeatMethod === "due-again" ? "due again" : "defer another";

  return `
    set repetition rule of ${taskVar} to {repetition method:${repetitionMethod}, recurrence:"${rrule}"}
  `;
}

/**
 * Build AppleScript to clear a repetition rule from a task.
 * @param taskVar - The AppleScript variable name for the task
 */
export function buildClearRepetitionScript(taskVar: string): string {
  return `
    set repetition rule of ${taskVar} to missing value
  `;
}

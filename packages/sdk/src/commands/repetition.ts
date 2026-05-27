import type { RepetitionRule } from "../types.js";

/**
 * Build an iCalendar RRULE string from a RepetitionRule.
 *
 * The output is the value assigned to `Task.RepetitionRule.ruleString`
 * (or its constructor argument) inside an OmniJS script.
 */
export function buildRRule(rule: RepetitionRule): string {
  const parts: string[] = [];

  const freqMap = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY",
  } as const;
  parts.push(`FREQ=${freqMap[rule.frequency]}`);

  if (rule.interval > 1) {
    parts.push(`INTERVAL=${String(rule.interval)}`);
  }

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

  if (rule.dayOfMonth !== undefined) {
    parts.push(`BYMONTHDAY=${String(rule.dayOfMonth)}`);
  }

  return parts.join(";");
}

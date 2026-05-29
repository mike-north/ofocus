---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Full repetition rule support: Nth-weekday, yearly, scheduled anchor, and apply/clear commands

Expands `RepetitionRule` with new fields and adds dedicated SDK commands plus CLI/MCP surfaces for applying and clearing repetition rules on existing tasks.

**New `RepetitionRule` fields** (fully additive — existing rules continue to work):

- `repeatMethod: "scheduled"` — maps to `Task.RepetitionMethod.Fixed` (strict cadence, date-fixed). Previously only `"due-again"` and `"defer-another"` were supported.
- `daysOfWeekPositions?: number[]` — positional prefix for BYDAY in monthly recurrences (e.g. `[1, -1]` = first and last occurrence). Values must be integers in `[-5, -1] ∪ [1, 5]`. Only valid when `frequency` is `"monthly"`.
- `monthsOfYear?: number[]` — month-of-year values for `BYMONTH=` in yearly recurrences (1=January, 12=December). Only valid when `frequency` is `"yearly"`.

**New RRULE variants now emitted by `buildRRule`**:

- `FREQ=MONTHLY;BYDAY=1MO` — first Monday of every month
- `FREQ=MONTHLY;BYDAY=1MO,-1MO` — first and last Monday
- `FREQ=MONTHLY;BYDAY=1MO,1WE,-1MO,-1WE` — cross-product of positions × days
- `FREQ=YEARLY;BYMONTH=3,6,9,12` — quarterly months
- `FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25` — Christmas Day

**New SDK exports**:

- `repeatMethodToOmniJS(method)` — maps `"due-again" | "defer-another" | "scheduled"` to the OmniJS `Task.RepetitionMethod.*` expression string. All internal callers (`inbox.ts`, `batch.ts`, `subtasks.ts`, `update.ts`) now use this helper instead of hand-rolling the switch.
- `applyRepetitionRule(taskId, rule)` — apply a rule to an existing task.
- `clearRepetitionRule(taskId)` — set `task.repetitionRule = null`.
- `applyRepetitionRuleDescriptor` — descriptor driving CLI + MCP.
- `clearRepetitionRuleDescriptor` — descriptor driving CLI + MCP.
- Types: `ApplyRepetitionRuleResult`, `ClearRepetitionRuleResult`.

**New CLI commands**:

- `ofocus apply-repetition <task-id> --frequency <...> [--interval <n>] [--repeat-method <...>] [--days-of-week <...>] [--day-of-month <n>] [--days-of-week-positions <...>] [--months-of-year <...>]`
- `ofocus clear-repetition <task-id>`

**New MCP tools**:

- `task_apply_repetition`
- `task_clear_repetition`

**Bug fix**: previous callers incorrectly mapped `"defer-another"` to `Task.RepetitionMethod.DeferDate`. The correct OmniJS constant is `Task.RepetitionMethod.Start`. This is now enforced through the shared `repeatMethodToOmniJS` helper.

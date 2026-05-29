---
"@ofocus/sdk": patch
"ofocus": patch
---

Fix dropped/blocked/available/effectivelyCompleted/effectivelyDropped filters to use the OmniJS Task.Status enum

The filter predicates for `--dropped`, `--blocked`, `--available`, `--effectively-completed`, and `--effectively-dropped` previously referenced non-existent OmniJS Task boolean properties (`t.dropped`, `t.blocked`, `t.effectivelyDropped`, `t.effectivelyCompleted`). These properties read back `undefined` in the OmniJS engine, so all these filters silently returned 0 results.

The correct OmniJS API is the `taskStatus` property compared against `Task.Status.*` enum values (verified live against OmniFocus):

- `Task.Status.Dropped` — covers directly-dropped tasks and tasks in dropped ancestor projects
- `Task.Status.Blocked` — covers tasks blocked by a sequential predecessor
- `Task.Status.Completed` — covers own completion and completion through a completed ancestor
- `Task.Status.Available`, `Next`, `DueSoon`, `Overdue` — the four actionable statuses used for `available: true`

The `remainingTaskCount` expression in `compileProjectPredicates` is also fixed to use `taskStatus` enum comparisons instead of the non-existent `effectivelyDropped` property.

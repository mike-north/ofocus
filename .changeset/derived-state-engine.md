---
"@ofocus/sdk": minor
"@ofocus/productivity": minor
---

Add the derived-state engine (A3): explicit `effectiveStatus`, `blockedReason`
(ordered by binding precedence), `isNextAction`, and project `stalled`/`empty` —
via an enriched wrapping-SDK surface in `@ofocus/productivity`
(`queryTasksEnriched`, `queryProjectsEnriched`) plus `stalled-projects` and
`next-actions` commands. The SDK gains raw `taskStatus`, project
`availableTaskCount`, and task effective-date query fields.

---
name: ofocus-triage
description: Triage the OmniFocus inbox and co-plan with the user. Use when the user asks to process/triage their inbox, plan or break down tasks, run a weekly review, unstick a stalled project, or when acting on an "OmniFocus changed" notification from the assistant. Proposes dispositions for approval and applies them via the ofocus CLI.
---

# OmniFocus Inbox Triage & Co-Planning

Use the `ofocus` CLI (see the `ofocus` skill for the full command reference). For a proactive "what should I focus on" summary, use the **`ofocus-brief`** skill instead; this skill is for _acting_ — triaging, planning, reviewing.

**Compute, don't reason.** OmniFocus has already computed the hard parts — call the deterministic commands rather than pulling raw task lists into context and reasoning over them:

| Need                                              | Command                                   |
| ------------------------------------------------- | ----------------------------------------- |
| Due today / overdue / flagged                     | `ofocus today`                            |
| The week ahead                                    | `ofocus this-week`                        |
| Stuck projects (active, no available next action) | `ofocus stalled-projects`                 |
| The next action per active project                | `ofocus next-actions`                     |
| Raw inbox / flagged / filtered lists              | `ofocus tasks --in-inbox`, `--flagged`, … |
| Workload stats                                    | `ofocus stats`                            |
| What changed                                      | `ofocus changes`                          |

**Always read machine output with `--format toon`** — identical data to JSON in ~40% fewer tokens, no information loss.

## Triage the inbox

1. Read the inbox: `ofocus tasks --in-inbox --format toon`.
2. For each item, decide a proposed disposition: a project, tags, defer/due dates, flag, or drop/delete. Use `ofocus next-actions` / `stalled-projects` to place an item where it actually moves work forward.
3. **Present all proposals as one batch for the user to approve or amend. Never mutate without confirmation.**
4. On approval, apply with `ofocus update <id> …` (or `ofocus update-batch <ids…>` for shared changes; `ofocus complete` / `drop` / `delete` as decided).

## Co-plan

- Break large or vague items into concrete next actions with `ofocus subtask <parent-id> "<title>"`.
- Turn an inbox note into an actionable task title + project.
- When a project is **stalled** (from `ofocus stalled-projects`), the fix is usually a _decision_: propose a concrete next action and, on approval, add it so the project becomes unstuck.

## Weekly review

- `ofocus projects-for-review` → walk each; after reviewing, `ofocus review <project-id>`.
- `ofocus stalled-projects` → for each, propose a next action (or on-hold/drop) so nothing sits silently stuck.
- `ofocus next-actions` → sanity-check that every active project has a sensible next step.

## Acting on a change notification

When the assistant surfaces an OmniFocus change (a SessionStart/end-of-turn digest, an urgent interjection, or a soft nudge to add a follow-up task), review **live state** — `ofocus today`, `ofocus tasks --in-inbox`, `ofocus tasks --flagged` — and triage what's there. Do not rely on the change log; the notification is only the signal that something is worth a look. For a soft nudge, add a task to your task list to follow up when you finish your current work (skip if you already have one).

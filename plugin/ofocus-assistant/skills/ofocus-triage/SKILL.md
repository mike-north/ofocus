---
name: ofocus-triage
description: Triage the OmniFocus inbox and co-plan with the user. Use when the user asks to process/triage their inbox, plan or break down tasks, run a weekly review, or when acting on an "OmniFocus changed" notification from the assistant. Proposes dispositions for approval and applies them via the ofocus CLI.
---

# OmniFocus Inbox Triage & Co-Planning

Use the `ofocus` CLI (see the `ofocus` skill for the full command reference). **Compute, don't reason:** for "due today / this week / what changed / workload," call `ofocus forecast`, `ofocus changes`, and `ofocus stats` rather than pulling raw task lists into context and reasoning over them.

## Triage the inbox
1. Read the inbox: `ofocus tasks --in-inbox --format json`.
2. For each item, decide a proposed disposition: a project, tags, defer/due dates, flag, or drop/delete.
3. **Present all proposals as one batch for the user to approve or amend. Never mutate without confirmation.**
4. On approval, apply with `ofocus update <id> …` (or `ofocus update-batch <ids…>` for shared changes; `ofocus complete` / `drop` / `delete` as decided).

## Co-plan
- Break large or vague items into concrete next actions with `ofocus subtask <parent-id> "<title>"`.
- Turn an inbox note into an actionable task title + project.

## Weekly review
- `ofocus projects-for-review` → walk each; after reviewing, `ofocus review <project-id>`.
- Surface stalled projects (active projects with no available next action) for attention.

## Acting on a change notification
When the assistant surfaces an OmniFocus change (a SessionStart/end-of-turn digest, an urgent interjection, or a soft nudge to add a follow-up task), review **live state** — `ofocus tasks --in-inbox`, `ofocus tasks --flagged`, `ofocus forecast` — and triage what's there. Do not rely on the change log; the notification is only the signal that something is worth a look. For a soft nudge, add a task to your task list to follow up when you finish your current work (skip if you already have one).

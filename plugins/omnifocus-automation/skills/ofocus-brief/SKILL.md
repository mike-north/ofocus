---
name: ofocus-brief
description: Give the user a proactive OmniFocus "chief of staff" briefing — what changed, what's due today, what's overdue, what's stuck, and the next action per project, synthesized into the few things that matter. Use when the user asks for a brief, standup, daily review, "what should I focus on", "what's on my plate", "catch me up on OmniFocus", or at the start of a working session.
---

# OmniFocus Chief-of-Staff Brief

Act as the user's chief of staff: do the homework with deterministic commands, then hand them **the few things that matter** — not a data dump. Synthesize and prioritize; offer to handle the rest.

## Gather (compute, don't reason)

Run these and read the output — **always `--format toon`** (identical data to JSON, ~40% fewer tokens). Don't pull raw task lists into context and reason over them; these commands have already done the computing:

| What                                                                          | Command                                      |
| ----------------------------------------------------------------------------- | -------------------------------------------- |
| Due today, overdue, flagged (with how-overdue / how-soon)                     | `ofocus today --format toon`                 |
| The week ahead, grouped by day                                                | `ofocus this-week --format toon`             |
| Stuck projects — active, with remaining work but **no available next action** | `ofocus stalled-projects --format toon`      |
| The single next action per active project                                     | `ofocus next-actions --format toon`          |
| Inbox backlog awaiting triage                                                 | `ofocus tasks --in-inbox --count`            |
| What changed since the last review (only if a watch is configured)            | `ofocus changes --watch agent --format toon` |

Run them concurrently where you can. If one errors (e.g. OmniFocus not running), note it in a phrase and continue with what you have — never block the whole brief on one missing piece.

## Synthesize the brief

Lead with **the 3–5 things that actually matter today**, chosen in priority order: overdue → due-today → flagged → newly-urgent. Then a tight rundown. Keep it scannable — prefer counts plus the specific high-signal items over full lists.

Suggested shape (adapt to what's actually there; omit empty sections):

> **Here's your day.**
>
> **Focus — the few that matter:** 1–3 items worth protecting time for, named (the overdue/flagged/due-today that can't slip).
>
> **Due today / overdue:** the remainder as a short list or a count.
>
> **Needs attention:** stalled projects by name — these have remaining work but _no available next action_, so they need a **decision**, not just doing. And: _N_ inbox items waiting to be triaged.
>
> **This week:** one line on what's coming.

End by **offering to act**, concretely — pick the highest-leverage next move and propose it: triage the inbox, unstick a named stalled project (propose its next step), break down a big item, or defer/reschedule what realistically won't happen today. A chief of staff doesn't just report; they tee up the next move.

## Principles

- **Prioritize, don't enumerate.** The value is in deciding what matters, not in listing everything. If a section would be a wall of rows, give a count and the top 2–3.
- **Explain "stuck."** A stalled project isn't "do this" — it's "this needs a decision or a defined next action." Surface it that way so the user knows it needs _thought_, not just time.
- **Read-only here.** The brief only reads. When the user accepts an offer to act, hand off to the `ofocus-triage` skill (propose → confirm → apply). Never mutate OmniFocus without explicit confirmation.
- **Respect their time.** Brief means brief. A few lines they can act on beats a complete report they have to wade through.

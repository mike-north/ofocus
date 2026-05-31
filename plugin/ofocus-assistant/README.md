# ofocus-assistant

A Claude Code plugin that turns OmniFocus into a collaborative surface: it proactively surfaces what changed and helps triage your inbox and plan — built on the `ofocus` CLI.

> Requires macOS with OmniFocus and the `ofocus` CLI installed and on `PATH`.

## What it does

A tiered, low-noise change-notification model over a shared `ofocus changes` watch, plus a triage skill. Tracking is keyed per session, so concurrent agent sessions never silence each other.

- **SessionStart digest** — at session start, injects a short summary of what changed since the last refresh.
- **End-of-turn surface (Stop)** — when the agent finishes a turn, surfaces anything that changed while it worked (no mid-work interruption).
- **Urgent interjection (PreToolUse)** — for time-sensitive changes only (a task became overdue/due-today, was newly flagged, or gained the configured agent tag), injects a one-line note mid-turn so it doesn't wait for the turn to end.
- **Soft nudge (PreToolUse, throttled)** — for non-urgent changes on long runs, at most once per `NUDGE_INTERVAL`, a one-line reminder to add a follow-up task (the agent dedups against its own task list). The soft nudge does not consume the change — the authoritative summary still arrives at the next end-of-turn/SessionStart.
- **Triage skill** — `ofocus-triage` guides inbox processing, task breakdown, and weekly review (propose-then-apply).

## Configuration (env)

| Variable | Default | Meaning |
| --- | --- | --- |
| `OFOCUS_ASSISTANT_WATCH` | `agent` | The shared `ofocus changes` watch name. |
| `OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS` | `300000` | Debounce for the shared background refresh (5 min). |
| `OFOCUS_ASSISTANT_NUDGE_INTERVAL_MS` | `600000` | Soft-nudge throttle (10 min). |
| `OFOCUS_ASSISTANT_URGENT_DUE_TODAY` | `true` | Treat newly due-today (not just overdue) as urgent. |
| `OFOCUS_ASSISTANT_AGENT_TAG` | (unset) | If set, a task gaining this tag is treated as urgent. |
| `OFOCUS_BIN` | `ofocus` | Path/name of the ofocus CLI. |
| `OFOCUS_STATE_DIR` | `~/.ofocus` | Where the watch cache and hook state live. |
| `OFOCUS_ASSISTANT_DISABLE` | (unset) | If set, the hook is a silent no-op. |

The hook is **fail-open**: if `ofocus` is missing or errors, it injects nothing and never blocks a tool call or turn.

## Manual test (hooks load at session start — restart required)

1. Install/enable the plugin and restart Claude Code.
2. `ofocus changes --watch agent --reset` to baseline.
3. **SessionStart digest:** add an inbox item, then start a fresh session → confirm the digest names the change.
4. **End-of-turn surface:** within a session, add a change, wait for the debounce, finish a turn → confirm the change is surfaced.
5. **Urgent interjection:** flag a task → on the next tool call, confirm a one-line urgent note appears immediately.
6. **Soft nudge:** make a non-urgent change (e.g. add an inbox item) on a long run → confirm a single throttled nudge and that the agent self-schedules a review task.
7. **Multi-agent:** in two concurrent sessions, confirm both are notified independently.

# @ofocus/productivity

Productivity niceties built on [`@ofocus/sdk`](../sdk).

> **Note**: Requires macOS with OmniFocus 4+ installed.

## Installation

```bash
pnpm add @ofocus/productivity
```

## `ofocus changes`

Detect what changed in OmniFocus since the last look. Results include field-level diffs and a fingerprint fast path so unchanged databases return instantly.

### Read modes

| Mode | Flag | Behaviour |
| ---- | ---- | --------- |
| Cached (default) | _(none)_ | Returns the most recently computed snapshot instantly. |
| Fresh | `--fresh` | Forces a live scan and updates the cache. |
| Pending | `--pending` | Returns accumulated deltas since the last `--pending` drain (useful in notification hooks). |

### Other flags

| Flag | Description |
| ---- | ----------- |
| `--reset` | Clear the stored snapshot and exit. |
| `--semantic` | Append a natural-language summary produced by `OFOCUS_SUMMARY_CMD` (fail-open — omitted if the command is unset or fails). |
| `--generation-since <n>` | Used with `--pending`: only deliver accumulated deltas whose generation is greater than `<n>` (otherwise reports `notModified`). Lets a notification hook avoid re-reporting deltas it has already drained. |

### Environment variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `OFOCUS_STATE_DIR` | `~/.ofocus` | Directory where watch caches are stored. |
| `OFOCUS_SUMMARY_CMD` | _(unset)_ | Shell command for `--semantic` summaries. Receives the diff JSON on stdin and must print a plain-text summary to stdout. |

### Examples

```bash
# What changed since I last looked?
ofocus changes

# Force a fresh scan
ofocus changes --fresh

# Drain accumulated deltas (e.g., in a launchd hook)
ofocus changes --pending

# Include a natural-language summary (requires OFOCUS_SUMMARY_CMD)
OFOCUS_SUMMARY_CMD="llm -m gpt-4o" ofocus changes --semantic

# Reset the stored snapshot
ofocus changes --reset
```

## Resolve

Turn a fuzzy human reference into a concrete OmniFocus entity. The scorer is deterministic (no calendar access; temporal anchors are resolved against the recurrence engine, not a live calendar).

```bash
ofocus resolve <query> [--kind <kind>] [--limit N]
```

| Flag | Default | Description |
| ---- | ------- | ----------- |
| `--kind` | `project` | Entity kind to search. One of `project`, `task`, `tag`, `folder`, `temporal-anchor`, `any` (`any` = project + task). |
| `--limit` | `5` | Maximum number of candidates returned in ambiguous/none results. |

### Result statuses

| Status | Meaning |
| ------ | ------- |
| `resolved` | A single high-confidence match that clearly beats the runner-up. The `resolved` field carries `id`, `name`, `kind`, and (for `temporal-anchor`) `nextOccurrence`. |
| `ambiguous` | A tight ranked candidate set — the caller must choose. Each candidate has `id`, `name`, `kind`, and a numeric `score`. |
| `none` | Nothing crossed the match floor. A `suggestions` array (possibly empty) lists near-misses. |

### Examples

```bash
# Resolve a project by fuzzy name
ofocus resolve "falcon" --kind project --format json

# Resolve a repeating task and get its next occurrence
ofocus resolve "stand-up" --kind temporal-anchor --format json

# Search across projects and tasks
ofocus resolve "billing" --kind any --limit 3 --format json
```

## Calendar links

Link OmniFocus tasks to calendar events the agent supplies (`ofocus` never reads a calendar itself) and reason about them deterministically.

```bash
# Link a task as prep for a meeting (event data comes from your calendar tool)
ofocus link <taskId> --type prep-for \
  --event '{"eventId":"abc","title":"1:1 with Sarah","start":"2026-06-02T15:00:00Z","end":"2026-06-02T15:30:00Z"}'

# Reserve a work block for a task
ofocus link <taskId> --type time-block --event '{...}'

# Is this meeting's prep done and on track?
ofocus readiness --event-id abc --format json

# Refresh the stored event with current calendar data while assessing
ofocus readiness --event-id abc --event '{...current event...}' --format json

# List links (each annotated with refresh status; time-blocks show coverage)
ofocus links --task <taskId> --format json
ofocus links --event-id abc --format json

# Drop links whose task no longer exists
ofocus links --task <taskId> --prune

# Remove a specific link
ofocus unlink <taskId> --event-id abc --type prep-for
```

| Link type | Computation |
| --------- | ----------- |
| `prep-for` | Meeting **readiness** (`ready` / `not-ready` / `at-risk`) + lead-time `suggestedDue` (event start − estimate) and a `late` flag. |
| `time-block` | **Block coverage** — whether the reserved block is at least the task's estimated minutes. |

Each link carries a **`needsRefresh`** signal: when the stored event snapshot is older than 24h, or the event start has passed while prep is still open, `ofocus` flags it so the agent re-supplies current calendar data.

Links are stored under `OFOCUS_STATE_DIR` (default `~/.ofocus`) via a pluggable `LinkStore` (cloud backends can be added behind the same interface).

## Temporal

Inspect upcoming repeating tasks and get focused digests of what needs attention.

| Command | Description |
| ------- | ----------- |
| `ofocus next-occurrences <taskId> [--count N] [--from <date>]` | Project the next N due dates for a specific repeating task, accounting for its repeat rule and method. |
| `ofocus occurrences [--days N]` | List all upcoming repeat instances across every repeating task in a rolling window (default 14 days). |
| `ofocus today` | Digest of overdue, due-today, and flagged tasks, each annotated with how overdue or how soon it is due. |
| `ofocus this-week` | Day-by-day forecast for the next seven days, with tasks grouped by calendar day and annotated with time until due. |

## License

MIT

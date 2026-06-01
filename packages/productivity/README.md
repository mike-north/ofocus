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

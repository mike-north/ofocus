# @ofocus/productivity

## 0.1.0

### Minor Changes

- 02c3b27: Add `ofocus changes`, a change-detection command that reports what changed in OmniFocus since the last look — cache-first and instant by default, with `--fresh` for a live scan, `--pending` for accumulated deltas (for a notification hook), field-level diffs, a fingerprint fast path, and an opt-in `--semantic` natural-language summary via a user-configured command (`OFOCUS_SUMMARY_CMD`). Introduces the new `@ofocus/productivity` package (productivity niceties built on `@ofocus/sdk`), surfaced through the CLI and MCP server.

  Known follow-ups (not yet wired): scope filters to narrow a watch (e.g. `--project`/`--tag`), the `--since` stateless cursor, wiring the Full Disk Access mtime accelerator into the command hot path, and by-generation caching of semantic summaries.

- dbf79e5: Add `ofocus resolve <query>` — fuzzy, ranked resolution of OmniFocus entities (project/task/tag/folder) that returns a confident match, a tight candidate set, or none, so an agent can pass a loose reference instead of scanning lists. `--kind temporal-anchor` fuzzy-matches a repeating task and returns its next occurrence. Surfaced through the CLI and MCP server.
- 9e296b1: Add an OmniFocus temporal engine: `ofocus next-occurrences <task>` (the next dates a repeating task is due, accounting for its repeat rule and method), `ofocus occurrences [--days N]` (upcoming repeat instances across all repeating tasks in a window), and `ofocus today` / `ofocus this-week` digests (overdue / due-today / flagged, and a day-by-day week view, with computed "due in / overdue by" durations). Surfaced through the CLI and MCP server.

### Patch Changes

- 9d3577f: Fix an EPIPE crash in `ofocus changes --semantic`. Writing the diff packet to a
  summary command that doesn't read stdin (or exits immediately, e.g. a misconfigured
  `OFOCUS_SUMMARY_CMD`) no longer surfaces as an unhandled exception — the broken-pipe
  error is swallowed, consistent with the command's fail-open contract.
- Updated dependencies [dfdb766]
- Updated dependencies [912ef62]
- Updated dependencies [11053c0]
- Updated dependencies [7a0815d]
- Updated dependencies [dfd0290]
- Updated dependencies [59d2493]
- Updated dependencies [90d3b85]
- Updated dependencies [09baed6]
- Updated dependencies [c92d880]
- Updated dependencies [7e02ede]
- Updated dependencies [f37560f]
- Updated dependencies [8bbc457]
- Updated dependencies [83eae3a]
- Updated dependencies [b97a283]
- Updated dependencies [cfc89de]
  - @ofocus/sdk@0.5.0

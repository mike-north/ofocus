---
"@ofocus/productivity": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Add `ofocus changes`, a change-detection command that reports what changed in OmniFocus since the last look — cache-first and instant by default, with `--fresh` for a live scan, `--pending` for accumulated deltas (for a notification hook), field-level diffs, a fingerprint fast path, and an opt-in `--semantic` natural-language summary via a user-configured command (`OFOCUS_SUMMARY_CMD`). Introduces the new `@ofocus/productivity` package (productivity niceties built on `@ofocus/sdk`), surfaced through the CLI and MCP server.

Known follow-ups (not yet wired): scope filters to narrow a watch (e.g. `--project`/`--tag`), the `--since` stateless cursor, wiring the Full Disk Access mtime accelerator into the command hot path, and by-generation caching of semantic summaries.

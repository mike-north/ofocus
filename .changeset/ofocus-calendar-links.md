---
"@ofocus/productivity": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Add calendar-conversance: link OmniFocus tasks to agent-supplied calendar events (`prep-for` / `time-block`) via `ofocus link`/`unlink`/`links`, with deterministic meeting **readiness**, lead-time, and time-block **coverage** computations and a `needsRefresh` staleness signal (`ofocus readiness`). `ofocus` never reads a calendar; all event data is agent-supplied. Links persist behind a pluggable `LinkStore` (local JSON by default). Surfaced through the CLI and MCP server.

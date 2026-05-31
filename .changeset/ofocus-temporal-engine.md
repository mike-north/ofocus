---
"@ofocus/productivity": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Add an OmniFocus temporal engine: `ofocus next-occurrences <task>` (the next dates a repeating task is due, accounting for its repeat rule and method), `ofocus occurrences [--days N]` (upcoming repeat instances across all repeating tasks in a window), and `ofocus today` / `ofocus this-week` digests (overdue / due-today / flagged, and a day-by-day week view, with computed "due in / overdue by" durations). Surfaced through the CLI and MCP server.

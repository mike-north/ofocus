---
"@ofocus/cli": minor
"ofocus": minor
---

Agent-aware default output format. When no `--format` is given, the CLI now emits token-efficient TOON automatically if it detects an AI coding agent (Claude Code, Cursor, Gemini CLI, Aider) is invoking it, and JSON otherwise — so agents no longer need to remember `--format toon`.

The resolution order is `--human` → explicit `--format` → `$OFOCUS_FORMAT` (`json` or `toon`) → agent detection, so an explicit flag or the env var always wins. Set `OFOCUS_FORMAT=json` (or pass `--format json`) when piping CLI output to a JSON tool such as `jq` from inside an agent session.

---
"ofocus": patch
---

The agent-facing docs (`AGENT_INSTRUCTIONS.md`, `AGENT_CLI_INSTRUCTIONS.md`, `skills/ofocus/SKILL.md`) are now generated from the descriptor registry and regenerated automatically by `pnpm build`. They are marked `linguist-generated` in `.gitattributes`. This eliminates the manual-doc drift that was flagged across prior code reviews.

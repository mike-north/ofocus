---
"ofocus": patch
---

Add agent-docs auto-generator infrastructure under `scripts/generate-agent-docs.ts` and a root `pnpm generate:agent-docs` script.

The generator reads all `*Descriptor` exports from the built `@ofocus/sdk` and renders three markdown documents: `AGENT_INSTRUCTIONS.md` (MCP-facing reference), `AGENT_CLI_INSTRUCTIONS.md` (CLI-facing reference), and `skills/ofocus/SKILL.md` (Claude skill metadata).

Output is NOT yet wired into `pnpm build` and the hand-maintained docs are NOT overwritten — that switchover happens in a follow-up PR after the W3 registry workstream completes.

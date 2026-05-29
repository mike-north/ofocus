---
"@ofocus/cli": patch
"@ofocus/mcp": patch
"ofocus": patch
---

Refresh README for OmniJS; add MCP smoke test and CLI UAT subprocess harness

- README: confirmed OmniJS (OmniAutomation) wording is accurate throughout; no AppleScript references remain.
- `@ofocus/mcp`: added `packages/mcp/tests/smoke.test.ts` — boots the MCP server in-process via `InMemoryTransport`, asserts the full tool manifest (58 tools across 5 domain categories), and round-trips representative calls per category with the OmniJS bridge mocked. No OmniFocus installation required; CI-safe.
- `@ofocus/cli`: added `packages/cli/tests/uat/helpers.ts` (reusable `runCli` subprocess harness) and `packages/cli/tests/uat/list-commands.test.ts` (asserts JSON envelope shape, `CommandInfo` fields, core domain names, and human formatter output). The UAT suite is skipped by default and opts in via `OFOCUS_UAT=1` — run with `pnpm -F @ofocus/cli build && OFOCUS_UAT=1 pnpm -F @ofocus/cli test`.

No public API surface changes.

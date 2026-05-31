# OFocus — GitHub Copilot instructions

Canonical guidance: [`docs/agent-guide.md`](../docs/agent-guide.md). Architecture:
[`docs/architecture.md`](../docs/architecture.md). Design specs (the contracts):
[`docs/superpowers/specs/`](../docs/superpowers/specs/).

When **generating** code or **reviewing** a pull request in this repo, hold the change to the
specs and flag any dissonance:

- **Specs are the contract.** If a change's behavior contradicts a spec
  (`docs/superpowers/specs/*`) — e.g. the `changes` read-mode semantics, a watch baselining at
  generation `0`, `--semantic` being fail-open — call it out. A PR that changes behavior but
  leaves a spec asserting the old contract is a defect; the spec should be updated in the same
  PR (or the code corrected).
- **Package/layer discipline.** `@ofocus/sdk` must stay minimal (only `zod`). Flag any
  network call, child process, or heavy dependency added to the SDK — those belong in
  `@ofocus/productivity` or higher, and must be fail-open. Deterministic "fuzzy" logic (e.g.
  ranked search) is Layer 2, not the plugin.
- **Single source of truth.** Commands are defined once via `defineCommand`; CLI, MCP, and the
  generated docs derive from descriptors. Flag any hand-maintained parallel command list, and
  flag new MCP tools missing from `packages/mcp/tests/fixtures/expected-tools.ts`.
- **Generated files.** `AGENT_*.md`, `skills/ofocus/SKILL.md`, and `packages/sdk/docs/*` are
  generated — flag hand-edits; the source/generator should change instead.
- **Tests.** Prefer spec-derived assertions over snapshot/gold-master. Flag tautological tests.
- **Security.** OmniJS/`eval` runs unsandboxed against the user's live database; user-provided
  values used in filesystem paths (e.g. a watch name) must be sanitized.

See [`docs/agent-guide.md`](../docs/agent-guide.md) §3–4 for the full dissonance checklist and
what to do on a mismatch.

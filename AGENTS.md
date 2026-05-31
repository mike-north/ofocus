# OFocus — guidance for coding agents

**Canonical guidance lives in [`docs/agent-guide.md`](./docs/agent-guide.md). Read it before
non-trivial work.** This file is a thin pointer (for Codex and other AGENTS.md-aware tools);
update guidance in the agent guide, not here.

## Essentials (don't skip)

- **Architecture:** [`docs/architecture.md`](./docs/architecture.md) — package graph, the
  OmniJS bridge, the descriptor registry, query/error/output models, how to add a command.
- **Specs (the contracts):** [`docs/superpowers/specs/`](./docs/superpowers/specs/) — the
  principles/roadmap and the `changes` primitive. Read the relevant spec **before** changing
  the change-detection engine, the descriptor registry, or layer/package boundaries.
- **Detect dissonance.** Treat the spec as the contract. If spec, plan, and code disagree,
  **stop and reconcile** — fix the code to match the spec, or update the spec in the same
  change if the contract is intentionally changing. Never silently diverge. (agent-guide §3–4.)
- **Package discipline.** `@ofocus/sdk` stays minimal (only `zod`); network/process/heavy
  things go in `@ofocus/productivity`+ and are fail-open. Deterministic-but-fuzzy logic is L2,
  not "the plugin".
- **Single source of truth.** Commands are defined once via `defineCommand`; CLI/MCP/docs
  derive from descriptors. Don't hand-maintain parallel lists. Regenerate agent docs
  (`pnpm build`) when the command surface changes; commit the generated files.
- **Spec-first tests** (assert spec-derived values, not program output) and a **changeset**
  for published-package changes.

Full detail, the doc map, and the dissonance checklist: [`docs/agent-guide.md`](./docs/agent-guide.md).

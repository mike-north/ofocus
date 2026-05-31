# OFocus Agent Collaboration — Design Principles & Roadmap

**Date:** 2026-05-30
**Status:** Approved direction (north star for subsequent specs)
**Scope:** Establishes the thesis, interaction patterns, layering boundary, and capability
roadmap that every downstream spec (A1–A4, the plugin) refers back to. This document does
not specify implementation — it constrains it.

---

## Thesis

> **Reserve the agent for judgment, conversation, and ambiguous intent. Push every
> mechanical, temporal, aggregational, and lookup computation into deterministic code that
> hands the agent decision-ready data — and as little of it as possible.**

LLM agents are unreliable and token-expensive at exactly the things computers are perfect
at: date math, recurrence expansion, set diffs, aggregation, ranked lookup. Every such
computation an agent performs "in its head" is both a chance to be wrong and a chance to
burn context. The OFocus tooling exists to absorb that work.

## The four interaction patterns

Everything we build realizes one or more of these. New capabilities should be justifiable
in terms of them.

1. **Compute, don't reason.** Deterministic code owns date arithmetic, recurrence
   expansion, diffs, and aggregation. The agent never recomputes what the tool can state.
   *(A1 diffs, A2 recurrence, A3 derived state)*

2. **Resolve, don't dump.** The agent passes *fuzzy references* ("Project Falcon"); the
   tool returns either a resolved entity or a **tight ranked candidate set** for
   disambiguation — not a wall of rows to reason over. *(A4)*

3. **Anchor, don't compute-in-head.** Temporal references ("next stand-up", "end of
   sprint") resolve to concrete dates inside the tool, never by agent arithmetic.
   *(A2 + A4)*

4. **Push state, don't poll-and-diff.** Reads are cache-first and instant; the tool tracks
   *what the agent has already seen* (a per-watch `generation`) and corrections are pushed
   into the agent's context out of band. The agent does no snapshot bookkeeping.
   *(A1 data + plugin hook)*

Across all four: **the agent supplies judgment and fuzzy intent; the tool returns
decision-ready, fully-resolved, minimal data.**

## The three layers

The system is built in three layers. The first two live **inside the OFocus tool**
(SDK / CLI / MCP); the third is the **agent plugin** on top.

### Layer 1 — Programmatic core

A complete, performant, **explicit** interface to OmniFocus: CRUD, queries, filters, batch
operations, `eval`. "Give me exactly what I ask for." Most existing commands live here.

- *Audience:* programs and power users who know precisely what they want.
- *Property:* direct and unsurprising — no inference, no magic.

### Layer 2 — Productivity niceties (still inside the tool)

**Actor-agnostic** conveniences that absorb mechanical work so *anyone* is more productive —
not just agents. The defining image is a **human at a terminal** writing a quick command:

```
ofocus add "prep talking points" --before "1:1 with Sarah"
ofocus today                # what's due today
ofocus next-occurrence <id> # when does this repeat next
```

Deterministic, built on Layer 1. This is where most of the roadmap lives: change detection
(A1), recurrence expansion / digests (A2), derived state (A3), and **fuzzy search /
resolution / anchored create (A4)**.

- *Audience:* humans-at-terminal **and** agents.
- *Litmus test:* **"Would a human typing a quick command want this, and is the answer
  deterministic (or deterministically rankable)?"** → yes ⇒ Layer 2.
- Note: fuzzy matching is deterministic, so it belongs here — "fuzzy" is not a synonym for
  "agent-only." A terminal user wants `--before "1:1 with Sarah"` to just work.

### Layer 3 — Agent interaction patterns (the plugin)

Chief-of-staff behaviors specific to operating inside an agent runtime (Claude Code,
Cowork, ChatGPT, Codex): the **PreToolUse change-notification hook**, proactive
monitoring/alerting, "what's due today" surfaced on a cadence, multi-turn inbox triage and
co-planning, the disambiguation *conversation* (using Layer 2's candidate sets), action-item
tracking, and human↔agent handoff conventions.

- *Audience:* agents (and the human via the agent).
- *Litmus test:* **"Is this only meaningful inside an agent's runtime, or about
  *delivering / orchestrating* rather than *computing*?"** → yes ⇒ Layer 3.

### Why the boundary lands where it does

A terminal human wants fuzzy search (L2); only an agent runtime even *has* a "PreToolUse
hook" (L3). So the change-detection **data** (cache, `generation`, pending-delta query) is
L2, while the **hook that pushes addendums into context** is L3. The four interaction
patterns map across the layers:

| Pattern | Realized in |
| --- | --- |
| 1 — Compute, don't reason | **L2** (built on L1) |
| 2 — Resolve, don't dump | **L2** provides candidates; **L3** runs the conversation |
| 3 — Anchor, don't compute-in-head | **L2** (anchor resolution / anchored create) |
| 4 — Push state, don't poll-and-diff | **L2** provides change data; **L3** the hook delivery |

Placement is decided **case-by-case** at each capability's design cycle, but these tests are
the default.

## Package architecture

The three layers map onto separate packages so consumers take on only the weight they want.

| Package | Layer | Role | Dependencies |
| --- | --- | --- | --- |
| **`@ofocus/sdk`** | L1 | Core programmatic interface. What you reach for to write a deterministic OmniFocus program. | **Zero runtime dependencies** (load-bearing contract) |
| **`@ofocus/productivity`** *(new)* | L2 | The niceties — fuzzy search, anchored create, recurrence expansion, derived state, change detection. | Depends on `@ofocus/sdk`. **Sanctioned home for any extra weight** a nicety needs (still minimal by preference; Node built-ins like `child_process` are fine). |
| **`@ofocus/cli`** | L1+L2 | Terminal interface, ready to go. Consumes **both** core and productivity. | sdk + productivity |
| **`@ofocus/mcp`** | L1+L2 | MCP server. Consumes **both** core and productivity. | sdk + productivity |
| **`ofocus`** | — | Umbrella, re-exports sdk + productivity + cli + mcp. | all |
| **(the plugin)** | L3 | Claude Code / agent plugin. Not an npm package; consumes the CLI/MCP. | — |

**Dependency direction (acyclic):**
`sdk ← productivity ← {cli, mcp} ← ofocus`. The plugin (L3) sits outside the npm graph and
drives the CLI/MCP.

**Why split L1 from L2:** someone who wants only a great OmniFocus SDK gets `@ofocus/sdk`
lean and dependency-free — fuzzy-search/summary machinery never leaks in as undesired
weight. The productivity suite is opt-in.

**Shared mechanisms:** `defineCommand` and the descriptor registry stay in `@ofocus/sdk`
(pure utilities); `@ofocus/productivity` imports them to define its own commands. The CLI and
MCP compose the **union** of the core and productivity command registries, so both surface
automatically in the CLI, the MCP server, and the generated agent docs.

**Loose / external dependencies** (a user-configured summary command, network calls) remain
loose and **fail-open**, invoked lazily — preferably from `@ofocus/productivity` via Node
built-ins so both CLI and MCP inherit them without duplication, never from `@ofocus/sdk`.

## Capability roadmap

Built in layers. Each item below gets its own spec → plan → implementation cycle. "A first,
then the plugin" — the plugin (B) consumes the tool capabilities (A1–A4).

| ID | Capability | Layer | Patterns | Status |
| --- | --- | --- | --- | --- |
| **A1** | `changes` primitive — cache-first reads, `generation`, field-level diffs, fingerprint fast path (+ optional Full Disk Access accelerator), `--fresh`, `--semantic` | **L2** (data); hook is L3 | 1, 4 | **Spec'd first** |
| **A2** | Temporal engine — recurrence *expansion* (`next-occurrences`), occurrence forecasting in a window, computed `dueIn` / `overdueBy`, `today` / `this-week` digests | **L2** | 1, 3 | Planned |
| **A3** | Derived-state engine — explicit `available` / `blocked` / `stalledProject` / `nextAction` fields; stalled-project query | **L2** | 1 | Planned |
| **A4** | Resolution & disambiguation — fuzzy/ranked entity search, the disambiguation response contract, temporal-anchor resolution (built on A2), anchored-create convenience (`--before "1:1 with Sarah"`) | **L2** | 2, 3 | Planned |
| **B** | The agent plugin — PreToolUse change-notification hook (consumes A1's pending-delta query), inbox-triage / co-planning skills, proactive monitoring, action-item tracking; the chief-of-staff layer that exercises judgment over L1/L2's decision-ready data | **L3** | all | Planned |

Layer 1 (the programmatic core) is the existing command surface; the roadmap items are the
Layer 2 niceties built on it, plus the Layer 3 plugin.

### The disambiguation contract (A4, defined here as a cross-cutting convention)

A single response shape reused anywhere the tool resolves a fuzzy reference:

```jsonc
// unambiguous
{ "resolved": { "id": "a1", "name": "…" }, "confidence": "high" }
// ambiguous — a TIGHT ranked set, minimal fields, never a full dump
{ "ambiguous": true, "candidates": [ { "id": "a1", "name": "…", "context": "Work/Infra", "score": 0.92 } ] }
// nothing matched — closest suggestions, explicit about the miss (e.g. anchor lives in Calendar, not OmniFocus)
{ "none": true, "suggestions": [ { "id": "…", "name": "…" } ] }
```

### Out of scope (current boundary)

- **Calendar / EventKit bridging.** OmniFocus holds no calendar events; temporal-anchor
  resolution (A4) scopes to OmniFocus entities (e.g. a repeating task named "Stand-up") and
  returns `{ none: true }` rather than guessing when an anchor refers to a calendar event.
  A Calendar bridge is a possible future plugin-layer concern.
- **A long-lived daemon.** A1's background refresh is a debounced detached process, not a
  daemon. A launchd-managed daemon that refreshes while no agent is active is a clean later
  optimization on the same interface.

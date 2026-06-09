# Derived State Engine (A3) — Design

**Date:** 2026-06-08
**Status:** Approved direction
**Scope:** Turns OmniFocus's implicit task/project state into **explicit, decision-ready
derived facts** an agent can act on without re-reasoning: effective task status, the *reason* a
task is blocked, next-action surfacing, and project stalled/empty signals. Defines the
layering, the field/command contracts, governance, and testing. This is the roadmap's **A3**
capability.

**See also:** [Agent principles & roadmap](./2026-05-30-ofocus-agent-principles.md) ·
[Architecture](../architecture.md) ·
[Typed OmniAutomation foundation](./2026-06-08-ofocus-typed-omniautomation-design.md) (A3's
OmniJS enrichment is authored on that foundation; A3 is sequenced after it as its first
consumer).

---

## 1. Thesis

> Reserve the agent for judgment; compute the mechanical facts. Today OmniFocus exposes
> availability/blocking only implicitly (a bare `t.blocked` boolean, a coarse status), forcing
> the agent to reason over scattered flags. A3 computes the **decision-ready** facts —
> *can I act on this? if not, why? what's the one next thing? which projects are stuck?* —
> deterministically, and hands them back as explicit fields.

The single highest-leverage piece is the **reason** a task is blocked: OmniFocus tells you a
task is blocked but not *whether it's a future defer date, a sequential predecessor, incomplete
children, or an on-hold/deferred project*. That reason is pure "compute, don't reason" payoff.

---

## 2. Guiding principle

**`effectiveStatus` encodes *actionability*; urgency lives in temporal fields.** A task is
`available` or `blocked` by whether you can act on it *now* — which legitimately changes as
defer gates pass, and that change is meaningful. Due-soon/overdue is pure *urgency*, already
conveyed by A2's `dueIn`/`overdueBy`, so it **never** enters status. One concept per field; one
source of truth for time.

---

## 3. Layering (the load-bearing architecture decision)

Derived facts split by **opinion content**, to keep `@ofocus/sdk` a conventional,
no-inference SDK:

| Concern | Home | Rationale |
| --- | --- | --- |
| **Faithful native** facts (raw `taskStatus` enum, project `availableTaskCount`, task `effectiveDueDate`/`effectiveDeferDate`) | **`@ofocus/sdk`** | Zero opinion — "exactly what OmniFocus says." These are genuine gaps the conventional SDK should close. |
| **Opinionated derivations** (`effectiveStatus`, `blockedReason`, `isNextAction`, project `stalled`/`empty`) | **`@ofocus/productivity`** (an enriched **wrapping-SDK** surface) | Computed conventions / inference — the "compute, don't reason" niceties. Keeping them out of the SDK preserves its no-magic property. |

The SDK gains nothing opinionated; it merely stops hiding native facts. Everything carrying a
judgment lives in the wrapper. This supersedes the initial "fields in the SDK field-spec"
sketch: putting the precedence logic into the SDK would erode exactly the conventional-SDK
property the SDK is prized for.

**Composability** is preserved without compromising the SDK: native filters still push down
into OmniJS via the SDK; the **derived** predicates/sorts/groups run as a **TypeScript
post-pass** in the wrapper over the enriched result set. Clean division of labor.

**Determinism bonus:** because derived fields never enter the SDK field spec, they can never
pollute `changes`' raw snapshot/fingerprint — `blockedReason`'s time-drift can't cause spurious
diffs. Correct by construction.

---

## 4. SDK additions (faithful, raw)

Added to the existing field specs (`packages/sdk/src/query/fields.ts`):

- **`taskStatus`** — the native `Task.Status` as a string
  (`available`/`blocked`/`next`/`dueSoon`/`overdue`/`completed`/`dropped`). Currently used for
  predicates but never surfaced as output; this closes that gap.
- Project **`availableTaskCount`** alongside the existing `remainingTaskCount`.
- Task **`effectiveDueDate`** / **`effectiveDeferDate`** (projects already expose these).

These are pure, zero-opinion native reads.

---

## 5. Productivity: enriched wrapping-SDK surface

Programmatic query functions returning **additive supersets** —
`OFTask & { effectiveStatus, blockedReason, isNextAction }` and
`OFProject & { stalled, empty }` — e.g. `queryTasksEnriched(options)` /
`queryProjectsEnriched(options)`, each returning the SDK's `CliOutput<T>` envelope for
consistency. These are first-class, supported API (§9) — the typed authoring surface an agent
uses to write durable workflows.

### 5.1 `effectiveStatus` ∈ `{ available, blocked, completed, dropped }`
Pure transform over raw `taskStatus`:
- `{ available, next, dueSoon, overdue }` → **`available`** (all actionable),
- `blocked` (incl. future-deferred) → **`blocked`**,
- terminal via `effectivelyCompleted`/`effectivelyDropped` → **`completed`** / **`dropped`**
  (so inherited completion/drop is honored).

### 5.2 `isNextAction` (boolean)
**Decision (resolving the native-`Next` caveat):** computed **structurally**, not by trusting
native `Task.Status.Next`. `isNextAction` is `true` when the task is the **first `available`
action within its containing project, by the project's task order.** The enriched query has the
full per-project task list, so this is deterministic. This deliberately diverges from native
`Task.Status.Next` (which is single-valued and would *not* mark an overdue or due-soon first
action as "next") so that the first actionable step is identified regardless of its urgency.

### 5.3 `blockedReason` — `string[]`, ordered by binding precedence
Populated **only** when `effectiveStatus === "blocked"` (empty otherwise). Taxonomy, ordered
most-binding first:

1. `project-dropped`
2. `project-done`
3. `project-on-hold`
4. `project-deferred` — project `effectiveDeferDate` in the future
5. `own-defer` — the task's own `deferDate` in the future
6. `sequential-predecessor` — an earlier sibling/action incomplete in a sequential container
7. `incomplete-children` — the task is waiting on its own unfinished subtasks

The array contains **all applicable** reasons (nothing hidden), ordered so that `[0]` is the
**binding constraint** — an agent wanting "the one thing to resolve" takes `[0]`.

### 5.4 Project `stalled` / `empty` (booleans, mutually exclusive)
- **`stalled`** — `status === active && remainingActions ≥ 1 && availableActions === 0`
  (real work exists; all of it blocked).
- **`empty`** — `status === active && remainingActions === 0` (finished everything; complete
  the project or add a next step).
- Both `false` for non-active projects.

### 5.5 How computed
`effectiveStatus` and `stalled`/`empty` are **pure transforms** over native fields the SDK
returns. `blockedReason`'s two *relational* reasons (`sequential-predecessor`,
`incomplete-children`) need a small **OmniJS enrichment pass** (ordered siblings / child
completion) — **authored on `defineOmniScript`** from the typed-OmniAutomation foundation, the
same shape as the existing `scan-task-state` pattern. Derived predicates/sorts/groups run as a
TS post-pass; native filters push down to the SDK.

---

## 6. Convenience commands (productivity; CLI + MCP)

Thin descriptors over the enriched functions (the established `runReadiness`/`runToday`
pattern — logic in importable functions, descriptor is glue, CLI/MCP auto-derive):

- **`stalled-projects`** — active projects where `stalled`, decision-ready (name, folder,
  remaining count). Preset over `queryProjectsEnriched`.
- **`next-actions`** — the single next action per active project ("the one thing to do in each
  project"). Preset over `queryTasksEnriched` filtered to `isNextAction`.

---

## 7. CLI/MCP surfacing

- The **generic `tasks` / `projects`** commands gain the **raw native fields** from §4 (so
  `--fields taskStatus`, plus the existing `--available`/`--blocked` predicates, answer most
  "can I act on this?" questions with no new surface).
- The **opinionated** derived facts surface through the two convenience commands (§6) and the
  **programmatic** enriched API (§5).
- A productivity **enriched-tasks command** (so `blockedReason` rides arbitrary task queries at
  the CLI/MCP) is a **forthcoming option**, deliberately out of A3 v1 to keep the surface
  focused; the programmatic enriched query covers that need for authors today.

---

## 8. Governance

Bring `@ofocus/productivity` under **api-extractor + api-report + TSDoc + changesets** (the SDK
already has this; productivity does not). A3 substantially expands productivity's public
surface — the enriched functions and derived types (`EffectiveStatus`, `BlockedReason`,
`EnrichedTask`, `EnrichedProject`, …) become the authoring API agents depend on — so it ships
**governed**. Included in A3 scope.

---

## 9. Testing (spec-first; spec-derived assertions, never snapshots)

- **Unit:** the transforms and the `blockedReason` precedence over hand-built OmniFocus-state
  fixtures via the injected scan seam (runs without OmniFocus). Each assertion cites the rule
  it derives from, e.g. *"project on-hold + incomplete sequential predecessor →
  `blockedReason === ['project-on-hold','sequential-predecessor']`"*; *"active project, 3
  remaining, 0 available → `stalled === true, empty === false`"*.
- **UAT (gated on `OmniFocus.app`; skipped in CI):** `stalled-projects` and `next-actions`
  driven as CLI subprocesses against a live database.

---

## 10. Relationship to the typed-OmniAutomation foundation

A3 is the foundation's **first real consumer**: its relational `blockedReason` enrichment is
authored with `defineOmniScript` rather than a hand-built OmniJS string, proving the typed core
on genuine work. A3 is therefore **sequenced after** the foundation. (If the foundation slips,
the enrichment can ship as an interim string and migrate — but the intended path is typed from
the start.)

---

## 11. Out of scope (v1)

A project-**health enum** (we chose `stalled` + `empty` booleans); time-relative status values
in `effectiveStatus`; project scoring / prioritization / cross-project ranking; an SDK
field-extension API; a separate `productivity-sdk` package (kept as a future option); the
enriched CLI/MCP task command (§7, forthcoming).

---

## 12. Roadmap reconciliation (same change set)

Update [the principles doc](./2026-05-30-ofocus-agent-principles.md): mark **A2 / A4 / calendar
conversance shipped**, reconcile the stale "calendar out of scope" line to the
agent-supplies-snapshots boundary that actually shipped, record **A3's actual shape** (raw
native gaps in L1 + the derived engine as L2's enriched wrapping-SDK surface — *not* the
original "A3 = L2 field-spec" classification), and reset "what's next after A3."

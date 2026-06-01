# A4b — Calendar-Conversance & Task↔Event Linkage (`ofocus link` / `ofocus readiness`)

**Date:** 2026-06-01
**Status:** Design — pending review
**Layer:** **L2 — Productivity nicety** (`@ofocus/productivity`; surfaced through `@ofocus/cli` + `@ofocus/mcp`). `@ofocus/sdk` unchanged.
**North star:** [OFocus Agent Collaboration — Design Principles](./2026-05-30-ofocus-agent-principles.md) — realizes **pattern 1, "compute, don't make the agent reason"** (readiness, lead-time, block coverage are deterministic) and **pattern 4, "push state, don't poll"** (the link store is the durable shared state between agent sessions).
**Builds on:** A2 temporal engine (`dueIn`/`overdueBy`), A4a resolve (the agent typically resolves a task by fuzzy reference, then links it), the existing SDK task query and `update` command, and the `OFOCUS_STATE_DIR` conventions established by `changes` (A1).

---

## 1. Goal

Let an agent (or a human at a terminal) record and reason about the relationships between **OmniFocus tasks** and **calendar events** — without `ofocus` ever reading a calendar. The agent brings calendar data from its own calendar MCP/CLI; `ofocus` becomes *conversant* in calendar: it stores agent-supplied event snapshots, models two link types, and absorbs the deterministic computations an agent otherwise gets wrong — **is this meeting's prep done?**, **when should this prep task be finished?**, **does this time-block actually cover the work?**

This is genuinely new: today `ofocus` has no concept of an event and no task↔event association.

## 2. Scope

**In scope (v1):**
- A **task↔event link primitive**: create/upsert, delete, and query links in **both** directions (links for a task; tasks for an event), persisted in a durable store.
- An agent-supplied **event snapshot** model with an explicit **`needsRefresh`** staleness signal.
- A **pluggable storage adapter** (`LinkStore` interface) with a default local-JSON implementation; the interface is designed so a cloud backend (e.g. Airtable) for cloud agents is a drop-in later.
- **Two link types** — `prep-for` and `time-block` — each with a distinct, well-defined deterministic computation.
- **Meeting readiness + lead-time** (the headline computation) for `prep-for` links; **block coverage** for `time-block` links.

**Out of scope (deferred):**
- **Reading a calendar.** `ofocus` never touches EventKit or any calendar API. All event data is agent-supplied. *(Non-negotiable architectural boundary.)*
- **Multi-event conflict / overlap detection** for time-blocks (does a block collide with other events?) — the seed of a follow-on **A4b-2**.
- **Auto-applying** suggested due dates. v1 reports `suggestedDue`; the agent writes it via the existing `update` command if it chooses. Auto-apply is an A4b-2 convenience.
- **Cloud storage adapters** themselves — only the *interface* and a reusable conformance test ship in v1; `file` is the only backend.
- **Anchored-create** (`add … --before "<event>"`) — depends on the create path; a separate follow-on.

## 3. Architecture

All in `@ofocus/productivity` (L2), which already has the network-capable, fail-open posture appropriate for a pluggable (eventually cloud-backed) store. `@ofocus/sdk` is unchanged.

### 3.1 Data model — `src/links/types.ts`
```ts
export type LinkType = "prep-for" | "time-block";

export interface EventSnapshot {
  eventId: string;          // stable id from the agent's calendar source
  title: string;
  start: string;            // ISO 8601
  end: string;              // ISO 8601
  location?: string;
  source?: string;          // optional provenance: "google" | "ms365" | …
  capturedAt: string;       // when the agent supplied this snapshot (ISO 8601)
}

export interface TaskEventLink {
  taskId: string;
  linkType: LinkType;
  event: EventSnapshot;
  note?: string;            // optional free text describing the link
  createdAt: string;        // ISO 8601
}
```

- **Identity = composite key** `${taskId}::${linkType}::${eventId}`. Linking the same (task, type, event) triple again is an **upsert**: it refreshes the snapshot and `capturedAt` rather than creating a duplicate. This makes linking idempotent and avoids generating random ids (keeps the pure layer free of `Date.now`/`Math.random`).
- All timestamps are agent-supplied or injected (`now`); pure functions never call `Date.now()`.

### 3.2 Storage adapter — `src/links/store.ts`
```ts
export interface LinkStore {
  upsert(link: TaskEventLink): Promise<void>;
  remove(taskId: string, linkType: LinkType, eventId: string): Promise<boolean>; // false if absent
  byTask(taskId: string): Promise<TaskEventLink[]>;
  byEvent(eventId: string): Promise<TaskEventLink[]>;
  all(): Promise<TaskEventLink[]>;     // for reconcile / prune
}
```
- **Default `FileLinkStore`**: a single JSON document at `${OFOCUS_STATE_DIR}/links.json`.
  - **Atomic writes:** write to a temp file in the same dir, then `rename` over the target.
  - **Path safety:** reuse the `OFOCUS_STATE_DIR` resolution + sanitize approach from the `changes` cache.
  - **Resilient reads:** a missing file → empty link set (success, not an error). A corrupt/unparseable file → reported as a `failure` on read (don't silently discard user state), with a clear `STATE_CORRUPT`-style message.
- **Adapter selection:** env var `OFOCUS_LINK_STORE` (default `"file"`). v1 implements `file` only; an unknown value → `VALIDATION_ERROR` at startup of a link command.
- **Conformance suite:** a reusable test factory exercises any `LinkStore` implementation (upsert/idempotency/remove/by-task/by-event/all) so a future Airtable/cloud adapter is verified against the same contract.

### 3.3 Pure computation — `src/links/readiness.ts`
Deterministic, injected `now`; no I/O.

- **`needsRefresh(link, now): { needsRefresh: boolean; reason?: string }`** — `true` when either:
  - `now − event.capturedAt` exceeds a staleness threshold (module const, e.g. 24h), **or**
  - `event.start < now` while the link is still actionable (a `prep-for` task not yet completed) — the event may have moved and the snapshot can no longer be trusted.
  The `reason` is a short human/agent-readable string. This is what lets the agent know to re-supply fresh calendar data.

- **`readiness(event, prepTasks, now)`** — for an event `E` and its `prep-for` linked tasks `Tᵢ` (task state injected by the handler from a live fetch):
  - Per task: `status` ∈ `"done"` (completed) | `"pending"`; `taskMissing: true` if the task no longer exists. For pending tasks: `timeUntilEvent = dueIn(E.start, now)`; `suggestedDue = E.start − estimatedMinutes` (when an estimate exists); `late = Tᵢ.due == null || Tᵢ.due > suggestedDue`.
  - **Verdict:** `"ready"` iff every prep task is `done`; otherwise `"not-ready"` with `{ done, total, pending }`. The verdict is **`"at-risk"`** when pending tasks remain **and** (any pending task has `now ≥ suggestedDue`, **or** `E.start` falls within a near-term window const) — i.e. there is still prep to do and you are past when you should have started.
  - Carries the `needsRefresh` result so a stale event surfaces in the readiness answer.

- **`blockCoverage(event, estimatedMinutes)`** — for a `time-block` link: `{ blockMinutes, estimateMinutes, covers: (E.end − E.start) ≥ estimatedMinutes }`. A cheap "does the reserved block actually fit the work?" check. No cross-event conflict detection (A4b-2).

### 3.4 Commands — `src/commands/link.ts` and `src/commands/readiness.ts`
Descriptors via `defineCommand`; injected deps (`LinkStore` + task fetcher + `now`) so handlers are unit-testable without OmniFocus or disk.

| Command | Synopsis | Behaviour |
| --- | --- | --- |
| `link` | `ofocus link <taskId> --event <json> [--type prep-for\|time-block] [--note <text>]` | Validate event JSON + the task's existence; **upsert** the link; return the stored link (with `needsRefresh`). |
| `unlink` | `ofocus unlink <taskId> --event-id <id> [--type prep-for\|time-block]` | Remove by composite key; report whether a link was removed. |
| `links` | `ofocus links (--task <id> \| --event-id <id>) [--prune]` | List links in one direction (exactly one selector required). Each link is annotated with `needsRefresh`, plus `blockCoverage` (time-block) and per-task readiness fields where cheap. `--prune` drops links whose task no longer exists. |
| `readiness` | `ofocus readiness --event-id <id> [--event <json>] [--now <iso>]` | Meeting readiness for an event: gather its `prep-for` links, fetch live task state, compute the §3.3 verdict. An inline `--event` override force-refreshes the snapshot (and persists it); `--now` injects the clock for determinism/testing. |

- **`--event <json>`** mirrors the established `repeat`-as-JSON-string precedent in `update.ts` (`z.preprocess` → structured object); MCP receives it as a structured object via the shared `inputSchema`. Shape: `{ eventId, title, start, end, location?, source? }` (`capturedAt` is stamped by the handler from injected `now`, not supplied by the caller).
- **Default `--type`** is `prep-for` (the readiness-bearing, most common case).

### 3.5 Surfacing & reuse
- Add the link/unlink/links/readiness descriptors to `productivityDescriptors` (`src/index.ts`); add a `registerCliCommand` per command in `packages/cli/src/cli.ts`; add the new tool names to `PRODUCTIVITY_TOOLS` in `packages/mcp/tests/fixtures/expected-tools.ts`; regenerate agent docs (`pnpm build`). MCP/catalog/docs otherwise auto-include them.
- Reuses: A2 `dueIn`/`overdueBy`; the SDK task query (completion/estimate/due + orphan detection); `defineCommand`, `CliOutput`, `success`/`failure`/`ErrorCode`; the `changes` state-dir + sanitize conventions. **No new SDK surface; no calendar access; no new runtime dependency** (the file store uses Node built-ins).

## 4. Error handling
Reuse `CliError`/`ErrorCode`.
- **Invalid event data:** unparseable `--event` JSON, missing required field, non-ISO `start`/`end`, or `end < start` → `VALIDATION_ERROR`.
- **Unknown task at link time:** validate `taskId` against a live task fetch. If the task does not exist → `VALIDATION_ERROR`. If **OmniFocus is unreachable**, store the link anyway (L2 fail-open) and mark `taskVerified: false` so the caller knows verification was skipped.
- **Persistence failures are hard failures:** a mutation (`link`/`unlink`/`--prune`) that cannot write the store returns `failure` — a link that didn't persist must never look saved.
- **Reads are lenient:** a missing store → empty result (success). A corrupt store → `failure` with a clear message (never silently drop state).
- **Unknown `OFOCUS_LINK_STORE`** → `VALIDATION_ERROR`.

## 5. Testing (spec-first, multi-layer; no snapshots)
Every expected value is hand-derived; no gold-master/snapshot assertions.
- **Unit — pure (`readiness.ts`):** `readiness` verdict for ready / not-ready / at-risk boundaries (including the `now ≥ suggestedDue` and near-term-window edges); `suggestedDue`/`late` with and without an estimate and with a missing task; `blockCoverage` exact/under/over; `needsRefresh` for both triggers (capturedAt age; past-start-with-open-prep) and the negative case; composite-key **upsert idempotency** (re-link refreshes, doesn't duplicate). Inject `now`; assert hand-derived values.
- **Unit — store:** `FileLinkStore` round-trips (upsert/remove/byTask/byEvent/all) in a temp `OFOCUS_STATE_DIR`; atomic-write behaviour; missing file → empty; corrupt file → failure. Plus a **reusable `LinkStore` conformance suite** runnable against any adapter.
- **Unit — commands:** handlers with injected store + task fetcher + `now` — contract shapes for link/unlink/links(both directions)/readiness; orphan marking + `--prune`; `taskVerified:false` when the fetcher signals OmniFocus-unreachable; the `--event` override refreshing the snapshot; all the §4 validation errors (bad JSON, non-ISO, `end<start`, unknown task, unknown store backend).
- **UAT (live, auto-skip without OmniFocus):** against the real DB in a temp `OFOCUS_STATE_DIR` — link a real task to a synthetic event, `links --task`/`links --event-id`, `readiness` (verify it reflects the task's real completion/estimate), `unlink`, and `--prune`. Shape/sanity assertions (live data varies), not fixed values.

## 6. File structure
```
packages/productivity/src/links/
  types.ts          # LinkType, EventSnapshot, TaskEventLink, readiness/result types
  store.ts          # LinkStore interface + FileLinkStore (atomic JSON, OFOCUS_STATE_DIR)
  readiness.ts      # pure: readiness, suggestedDue/late, blockCoverage, needsRefresh
packages/productivity/src/commands/
  link.ts           # link / unlink / links / prune descriptors + handlers
  readiness.ts      # readiness descriptor + handler
packages/productivity/tests/unit/
  readiness.test.ts, store.test.ts, link-commands.test.ts  (+ store-conformance helper)
packages/productivity/tests/uat/
  links.uat.test.ts
# wiring: src/index.ts, packages/cli/src/cli.ts, packages/mcp/tests/fixtures/expected-tools.ts, regenerated docs
```

## 7. Open implementation questions (resolve during planning; non-blocking)
1. Exact staleness threshold const for `needsRefresh` (24h is a starting point) and the "near-term window" const for the `at-risk` verdict — tune during UAT.
2. Whether `links --task` should also compute readiness-style annotations per linked event, or keep that to the event-centric `readiness` command (default: keep `readiness` as the single rich compute entry point; `links` stays a listing with cheap annotations).
3. Whether `prune` should also remove links to **completed/dropped** prep tasks or retain them as history (default: retain — only remove links whose task no longer exists at all).
4. CLI ergonomics for `--event`: JSON blob only (consistent with `update`'s `repeat`) vs. also offering convenience flags (`--event-start`, …). Default: JSON blob in v1; convenience flags are a later nicety.

## 8. Out of scope / roadmap
- **A4b-2** — time-block conflict/overlap detection (across multiple agent-supplied events) and auto-apply of `suggestedDue` via `update`.
- **Cloud `LinkStore` adapters** (Airtable, cloud KV) for cloud agents — the interface and conformance suite in v1 make these additive.
- **Anchored-create** (`add … --before "<event>"`) — depends on the create path; a small follow-on once linking + resolve exist.

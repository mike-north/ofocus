# Derived State Engine (A3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose OmniFocus's implicit task/project state as explicit, decision-ready derived facts — effective status, *why* a task is blocked, the next action per project, and stalled/empty projects — without making the agent re-reason.

**Architecture:** Raw native facts (`taskStatus`, project `availableTaskCount`, task effective dates) are added to `@ofocus/sdk`'s field specs — zero opinion. The opinionated derivations (`effectiveStatus`, `blockedReason`, `isNextAction`, `stalled`/`empty`) live in `@ofocus/productivity` as an enriched **wrapping-SDK** surface (`queryTasksEnriched`/`queryProjectsEnriched`) plus two convenience commands (`stalled-projects`, `next-actions`). The two relational `blockedReason` causes are computed via a typed `defineOmniScript` enrichment pass (the foundation's first real consumer). Derived predicates/sorts run as a TS post-pass; native filters push down to the SDK.

**Tech Stack:** TypeScript (ES2022, strict, NodeNext), pnpm workspace + project references, Vitest, ESLint + Prettier, API Extractor, Changesets. `@ofocus/productivity` depends on `@ofocus/sdk` (and now consumes `defineOmniScript` from it).

**Spec:** [`docs/specs/2026-06-08-ofocus-derived-state-design.md`](../specs/2026-06-08-ofocus-derived-state-design.md)

**Shipping note:** This plan can land as **two PRs** if preferred — PR-A = Tasks 1–2 + 12 (SDK raw fields + roadmap reconciliation); PR-B = Tasks 3–11 (productivity enriched surface + commands + governance). Single-PR is fine too.

---

## Established patterns to mirror (read first)

- **Enriched query + command shape:** `packages/productivity/src/commands/digests.ts` — imports `queryTasks`/`queryForecast`/`OFTask`/`defineCommand`/`success`/`failure` from `@ofocus/sdk`, pushes all OmniFocus I/O into **injected fetchers** (so the pure logic is unit-testable offline), defines `run*` functions + `*Descriptor`s, and exports both. **Mirror this exactly** for the enriched queries and the two commands.
- **Field specs:** `packages/sdk/src/query/fields.ts` — `taskFieldSpec.fields` / `projectFieldSpec.fields` are `Record<string, { omnijsExpr: string }>`. Add new keys here.
- **Typed OmniJS authoring (foundation):** `defineOmniScript`/`runOmniScript` from `@ofocus/sdk` — used for the relational enrichment pass (Task 5).
- **Descriptor → CLI/MCP/docs:** adding a descriptor to `productivityDescriptors` (`packages/productivity/src/index.ts`) auto-surfaces it in the CLI (`packages/cli/src/commands/index.ts` spreads `...productivityDescriptors`) and MCP (`packages/mcp/src/tools/productivity.ts` loops `registerMcpTool`). New MCP tools must also be added to `packages/mcp/tests/fixtures/expected-tools.ts`.

## File structure

- **`@ofocus/sdk`** (raw native fields only): modify `packages/sdk/src/query/fields.ts`.
- **`@ofocus/productivity`** (the derived engine):
  - `src/derived/types.ts` — `EffectiveStatus`, `BlockedReason`, `EnrichedTask`, `EnrichedProject`, the raw-fact input types.
  - `src/derived/compute.ts` — pure transforms: `effectiveStatus`, `blockedReason`, `stalled`, `empty`.
  - `src/derived/next-action.ts` — `markNextActions` (structural "first available per project").
  - `src/derived/relational.ts` — the `defineOmniScript` enrichment pass + its result type.
  - `src/commands/enriched.ts` — `queryTasksEnriched` / `queryProjectsEnriched`.
  - `src/commands/stalled-projects.ts`, `src/commands/next-actions.ts` — the two descriptors.
  - `api-extractor.json`, `api-report/`, updated `package.json` (governance).

---

## Task 1: SDK — raw native task fields (`taskStatus`, effective dates)

**Files:**
- Modify: `packages/sdk/src/query/fields.ts`
- Test: `packages/sdk/tests/unit/query/fields-derived.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { taskFieldSpec } from "../../../src/query/fields.js";

describe("taskFieldSpec raw-native additions (A3 spec §4)", () => {
  it("exposes taskStatus mapping the native Task.Status enum to lowercase strings", () => {
    const expr = taskFieldSpec.fields.taskStatus?.omnijsExpr;
    expect(expr).toBeDefined();
    // Must reference the native enum and yield the 7 documented values.
    expect(expr).toContain("Task.Status");
    for (const v of ["available", "blocked", "next", "dueSoon", "overdue", "completed", "dropped"]) {
      expect(expr).toContain(`"${v}"`);
    }
  });
  it("exposes task effectiveDueDate and effectiveDeferDate as ISO-or-null", () => {
    expect(taskFieldSpec.fields.effectiveDueDate?.omnijsExpr).toContain("effectiveDueDate");
    expect(taskFieldSpec.fields.effectiveDeferDate?.omnijsExpr).toContain("effectiveDeferDate");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/query/fields-derived.test.ts`
Expected: FAIL (fields undefined).

- [ ] **Step 3: Add the fields** to `taskFieldSpec.fields` in `packages/sdk/src/query/fields.ts` (alongside the existing entries):

```ts
    taskStatus: {
      omnijsExpr:
        '(t.taskStatus === Task.Status.Available ? "available" : ' +
        't.taskStatus === Task.Status.Blocked ? "blocked" : ' +
        't.taskStatus === Task.Status.Next ? "next" : ' +
        't.taskStatus === Task.Status.DueSoon ? "dueSoon" : ' +
        't.taskStatus === Task.Status.Overdue ? "overdue" : ' +
        't.taskStatus === Task.Status.Completed ? "completed" : ' +
        't.taskStatus === Task.Status.Dropped ? "dropped" : "available")',
    },
    effectiveDueDate: {
      omnijsExpr: "(t.effectiveDueDate ? t.effectiveDueDate.toISOString() : null)",
    },
    effectiveDeferDate: {
      omnijsExpr: "(t.effectiveDeferDate ? t.effectiveDeferDate.toISOString() : null)",
    },
```

- [ ] **Step 4: Run the test — expect PASS.** `cd packages/sdk && pnpm exec vitest run tests/unit/query/fields-derived.test.ts`

- [ ] **Step 5: Lint/format then commit.** Run `pnpm lint` + `pnpm exec prettier --check packages/sdk/src/query/fields.ts`.

```bash
git add packages/sdk
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(sdk): expose native taskStatus and task effective dates as query fields"
```

---

## Task 2: SDK — project `availableTaskCount` field

**Files:**
- Modify: `packages/sdk/src/query/fields.ts`
- Test: `packages/sdk/tests/unit/query/fields-derived.test.ts` (extend)

- [ ] **Step 1: Add the failing assertion** to the test file from Task 1:

```ts
import { projectFieldSpec } from "../../../src/query/fields.js";

it("project field spec exposes availableTaskCount (A3 spec §4)", () => {
  const expr = projectFieldSpec.fields.availableTaskCount?.omnijsExpr;
  expect(expr).toBeDefined();
  expect(expr).toContain("available");
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Add to `projectFieldSpec.fields`** (next to `remainingTaskCount`):

```ts
    availableTaskCount: {
      omnijsExpr:
        "t.task.flattenedTasks.filter(function(s){ return s.taskStatus === Task.Status.Available || s.taskStatus === Task.Status.Next || s.taskStatus === Task.Status.DueSoon || s.taskStatus === Task.Status.Overdue; }).length",
    },
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Build the SDK to confirm api-report is unaffected** (field-spec keys don't change the exported type signature): `cd packages/sdk && pnpm build` — expect no api-report diff. If a diff appears, review and include it.

- [ ] **Step 6: Commit.**

```bash
git add packages/sdk
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(sdk): expose project availableTaskCount query field"
```

---

## Task 3: Productivity — API-Extractor governance setup

The new enriched surface must ship governed (spec §8). Productivity currently has no API Extractor.

**Files:**
- Create: `packages/productivity/api-extractor.json`, `packages/productivity/temp/.gitkeep`
- Modify: `packages/productivity/package.json`

- [ ] **Step 1: Add `api-extractor.json`** mirroring `packages/sdk/api-extractor.json`, with `reportFileName: "ofocus-productivity.api.md"`, `apiJsonFilePath: temp/ofocus-productivity.api.json`, and `dtsRollup.untrimmedFilePath: dist/ofocus-productivity.d.ts`.

- [ ] **Step 2: Update `package.json`** — set `"types": "./dist/ofocus-productivity.d.ts"`, add `"api-report"` to `files`, and change scripts:

```json
    "build": "tsc --build && api-extractor run --local --verbose",
    "build:tsc": "tsc --build",
    "api-extractor": "api-extractor run --verbose",
```

- [ ] **Step 3: Add `@microsoft/api-extractor`** to productivity devDependencies if not inherited (check the repo root first; the SDK already depends on it — match the same version). Run `pnpm install`.

- [ ] **Step 4: Generate the baseline report.** `cd packages/productivity && pnpm build`. Expect `api-report/ofocus-productivity.api.md` to be created capturing the *existing* exports. Review it for sanity.

- [ ] **Step 5: Commit.**

```bash
git add packages/productivity pnpm-lock.yaml
git commit --author="Mike North <michael.l.north@gmail.com>" -m "build(productivity): add API Extractor governance (report + rollup)"
```

---

## Task 4: Productivity — derived-state pure transforms

**Files:**
- Create: `packages/productivity/src/derived/types.ts`, `packages/productivity/src/derived/compute.ts`
- Test: `packages/productivity/tests/unit/derived-compute.test.ts`

- [ ] **Step 1: Write the failing test** (assertions trace to spec §5; each cites its rule):

```ts
import { describe, it, expect } from "vitest";
import { effectiveStatus, blockedReason, projectHealth } from "../../src/derived/compute.js";

describe("effectiveStatus (spec §5.1: actionability only)", () => {
  it("collapses available/next/dueSoon/overdue to 'available'", () => {
    for (const s of ["available", "next", "dueSoon", "overdue"] as const) {
      expect(effectiveStatus({ taskStatus: s, effectivelyCompleted: false, effectivelyDropped: false })).toBe("available");
    }
  });
  it("maps blocked to 'blocked', and terminal via effectively* flags", () => {
    expect(effectiveStatus({ taskStatus: "blocked", effectivelyCompleted: false, effectivelyDropped: false })).toBe("blocked");
    expect(effectiveStatus({ taskStatus: "available", effectivelyCompleted: true, effectivelyDropped: false })).toBe("completed");
    expect(effectiveStatus({ taskStatus: "available", effectivelyCompleted: false, effectivelyDropped: true })).toBe("dropped");
  });
});

describe("blockedReason (spec §5.3: array ordered by binding precedence)", () => {
  it("orders project-on-hold before sequential-predecessor; [0] is binding", () => {
    const reasons = blockedReason({
      projectStatus: "on-hold", projectDeferInFuture: false, ownDeferInFuture: false,
      hasIncompleteSequentialPredecessor: true, hasIncompleteChildren: false,
    });
    expect(reasons).toEqual(["project-on-hold", "sequential-predecessor"]);
    expect(reasons[0]).toBe("project-on-hold");
  });
  it("returns empty array when nothing blocks", () => {
    expect(blockedReason({
      projectStatus: "active", projectDeferInFuture: false, ownDeferInFuture: false,
      hasIncompleteSequentialPredecessor: false, hasIncompleteChildren: false,
    })).toEqual([]);
  });
});

describe("projectHealth (spec §5.4: stalled vs empty)", () => {
  it("active + remaining>=1 + available===0 → stalled", () => {
    expect(projectHealth({ status: "active", remainingTaskCount: 3, availableTaskCount: 0 })).toEqual({ stalled: true, empty: false });
  });
  it("active + remaining===0 → empty (not stalled)", () => {
    expect(projectHealth({ status: "active", remainingTaskCount: 0, availableTaskCount: 0 })).toEqual({ stalled: false, empty: true });
  });
  it("non-active → neither", () => {
    expect(projectHealth({ status: "on-hold", remainingTaskCount: 3, availableTaskCount: 0 })).toEqual({ stalled: false, empty: false });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Write `src/derived/types.ts`** (all `@public`): `EffectiveStatus = "available" | "blocked" | "completed" | "dropped"`; `BlockedReason = "project-dropped" | "project-done" | "project-on-hold" | "project-deferred" | "own-defer" | "sequential-predecessor" | "incomplete-children"`; input fact types (`EffectiveStatusFacts`, `BlockedReasonFacts`, `ProjectHealthFacts`) matching the test shapes; and the enriched output types `EnrichedTask` / `EnrichedProject` (defined here, used in Task 6):

```ts
import type { OFTask, OFProject } from "@ofocus/sdk";

/** @public */ export type EffectiveStatus = "available" | "blocked" | "completed" | "dropped";
/** @public */ export type BlockedReason =
  | "project-dropped" | "project-done" | "project-on-hold" | "project-deferred"
  | "own-defer" | "sequential-predecessor" | "incomplete-children";

/** @public */ export interface EnrichedTask extends OFTask {
  taskStatus: string;
  effectiveStatus: EffectiveStatus;
  /** Ordered by binding precedence; `[0]` is the binding constraint. Empty unless blocked. */
  blockedReason: BlockedReason[];
  isNextAction: boolean;
}
/** @public */ export interface EnrichedProject extends OFProject {
  availableTaskCount: number;
  stalled: boolean;
  empty: boolean;
}
```

- [ ] **Step 4: Write `src/derived/compute.ts`** — the pure transforms. `effectiveStatus` maps actionability; `blockedReason` assembles the array in the fixed precedence; `projectHealth` computes stalled/empty:

```ts
import type { BlockedReason, EffectiveStatus } from "./types.js";

/** @public */
export function effectiveStatus(f: {
  taskStatus: string; effectivelyCompleted: boolean; effectivelyDropped: boolean;
}): EffectiveStatus {
  if (f.effectivelyCompleted) return "completed";
  if (f.effectivelyDropped) return "dropped";
  if (f.taskStatus === "completed") return "completed";
  if (f.taskStatus === "dropped") return "dropped";
  return f.taskStatus === "blocked" ? "blocked" : "available";
}

/** Precedence: most-binding first (spec §5.3). */
const PRECEDENCE: BlockedReason[] = [
  "project-dropped", "project-done", "project-on-hold", "project-deferred",
  "own-defer", "sequential-predecessor", "incomplete-children",
];

/** @public */
export function blockedReason(f: {
  projectStatus: "active" | "on-hold" | "completed" | "dropped" | null;
  projectDeferInFuture: boolean; ownDeferInFuture: boolean;
  hasIncompleteSequentialPredecessor: boolean; hasIncompleteChildren: boolean;
}): BlockedReason[] {
  const present = new Set<BlockedReason>();
  if (f.projectStatus === "dropped") present.add("project-dropped");
  if (f.projectStatus === "completed") present.add("project-done");
  if (f.projectStatus === "on-hold") present.add("project-on-hold");
  if (f.projectDeferInFuture) present.add("project-deferred");
  if (f.ownDeferInFuture) present.add("own-defer");
  if (f.hasIncompleteSequentialPredecessor) present.add("sequential-predecessor");
  if (f.hasIncompleteChildren) present.add("incomplete-children");
  return PRECEDENCE.filter((r) => present.has(r));
}

/** @public */
export function projectHealth(f: {
  status: string; remainingTaskCount: number; availableTaskCount: number;
}): { stalled: boolean; empty: boolean } {
  if (f.status !== "active") return { stalled: false, empty: false };
  if (f.remainingTaskCount === 0) return { stalled: false, empty: true };
  return { stalled: f.availableTaskCount === 0, empty: false };
}
```

- [ ] **Step 5: Run — expect PASS.** `cd packages/productivity && pnpm exec vitest run tests/unit/derived-compute.test.ts`

- [ ] **Step 6: Lint/format, commit.**

```bash
git add packages/productivity
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(productivity): add derived-state pure transforms (effectiveStatus, blockedReason, projectHealth)"
```

---

## Task 5: Productivity — relational enrichment via `defineOmniScript`

Two `blockedReason` causes need relational data (ordered siblings / child completion). Author the OmniJS pass typed, using the foundation.

**Files:**
- Create: `packages/productivity/src/derived/relational.ts`
- Test: `packages/productivity/tests/unit/derived-relational.test.ts`

- [ ] **Step 1: Write the failing test** — verify the script is defined with the foundation and shape of its result:

```ts
import { describe, it, expect } from "vitest";
import { relationalFactsScript } from "../../src/derived/relational.js";

describe("relationalFactsScript", () => {
  it("is an OmniScript whose body inspects sequential predecessors and children", () => {
    expect(relationalFactsScript.kind).toBe("script");
    expect(relationalFactsScript.source).toContain("flattenedTasks");
    expect(relationalFactsScript.source).toContain("children");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Write `src/derived/relational.ts`** — a `defineOmniScript` taking `{ taskIds: string[] }` and returning, per task, the two relational booleans. The body references only its arg + OmniFocus globals (the `no-omniscript-closure` rule enforces this):

```ts
import { defineOmniScript, runOmniScript, type CliOutput } from "@ofocus/sdk";

/** @public */
export interface RelationalFacts {
  taskId: string;
  hasIncompleteSequentialPredecessor: boolean;
  hasIncompleteChildren: boolean;
}

/** @public */
export const relationalFactsScript = defineOmniScript(
  (args: { taskIds: string[] }) => {
    return args.taskIds.map((id) => {
      const t = flattenedTasks.byId(id);
      if (t === null) {
        return { taskId: id, hasIncompleteSequentialPredecessor: false, hasIncompleteChildren: false };
      }
      const hasIncompleteChildren = t.children.some((c) => !c.completed && !c.dropped);
      // Sequential predecessor: in a sequential container, an earlier sibling is incomplete.
      const container = t.containingProject;
      let hasPred = false;
      if (container !== null && container.sequential) {
        const siblings = container.task.children;
        for (const s of siblings) {
          if (s.id.primaryKey === t.id.primaryKey) break;
          if (!s.completed && !s.dropped) { hasPred = true; break; }
        }
      }
      return { taskId: id, hasIncompleteSequentialPredecessor: hasPred, hasIncompleteChildren };
    });
  },
);

/** @public */
export async function fetchRelationalFacts(taskIds: string[]): Promise<CliOutput<RelationalFacts[]>> {
  return runOmniScript(relationalFactsScript, { taskIds });
}
```

> Note: the typed body must be self-contained (no closures/imports). Run `pnpm lint` to confirm `no-omniscript-closure` does not flag it. If the OmniJS `Task`/`Project` API surface used here (`.children`, `.containingProject`, `.sequential`, `.task.children`) is missing from `@ofocus/omnijs-types`, extend that package's `src/types.ts`/`src/globals.ts` slice as part of this task (and regenerate its api-report).

- [ ] **Step 4: Run — expect PASS.** Also run `pnpm lint` (the guardrail must not flag the body).

- [ ] **Step 5: Commit.**

```bash
git add packages/productivity packages/omnijs-types
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(productivity): add typed relational-facts enrichment for blockedReason"
```

---

## Task 6: Productivity — enriched query functions

**Files:**
- Create: `packages/productivity/src/commands/enriched.ts`
- Test: `packages/productivity/tests/unit/enriched.test.ts`

- [ ] **Step 1: Write the failing test** with **injected fetchers** (mirror `digests.ts` testability — no live OmniFocus):

```ts
import { describe, it, expect } from "vitest";
import { enrichTasks } from "../../src/commands/enriched.js";

describe("enrichTasks (pure assembly over injected raw data)", () => {
  it("computes effectiveStatus, blockedReason, and isNextAction (spec §5)", () => {
    const rawTasks = [
      { id: "a", name: "first", taskStatus: "available", effectivelyCompleted: false, effectivelyDropped: false,
        deferDate: null, effectiveDeferDate: null, projectId: "p", projectName: "P", /* …OFTask fields… */ },
      { id: "b", name: "second", taskStatus: "blocked", effectivelyCompleted: false, effectivelyDropped: false,
        deferDate: null, effectiveDeferDate: null, projectId: "p", projectName: "P" },
    ] as never[];
    const projects = new Map([["p", { status: "active", deferInFuture: false, sequential: true }]]);
    const relational = new Map([
      ["a", { hasIncompleteSequentialPredecessor: false, hasIncompleteChildren: false }],
      ["b", { hasIncompleteSequentialPredecessor: true, hasIncompleteChildren: false }],
    ]);
    const enriched = enrichTasks(rawTasks, projects, relational, "2026-06-08T00:00:00Z");
    expect(enriched[0]!.effectiveStatus).toBe("available");
    expect(enriched[0]!.isNextAction).toBe(true); // first available in sequential project P
    expect(enriched[1]!.effectiveStatus).toBe("blocked");
    expect(enriched[1]!.blockedReason).toEqual(["sequential-predecessor"]);
    expect(enriched[1]!.isNextAction).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Write `src/commands/enriched.ts`.** Provide a **pure** `enrichTasks(rawTasks, projectFacts, relational, nowIso)` (assembles the derived fields using Task 4's transforms + Task 5's relational facts + the structural next-action rule from Task 7's helper) AND the I/O-driven `queryTasksEnriched(options, deps?)` / `queryProjectsEnriched(options, deps?)` that: (a) call the SDK query with the required raw `--fields`, (b) gather project facts + run `fetchRelationalFacts` for blocked tasks, (c) call the pure assembler, (d) apply derived predicates/sorts/groups as a TS post-pass. Inject the SDK calls via a `deps` object defaulting to the real ones (mirror `digests.ts` `*Deps`). Return `CliOutput<QueryResult<EnrichedTask>>` / `…<EnrichedProject>`.

  The pure assembler and the next-action marking are the parts under test; the `query*Enriched` wrappers are thin orchestration. Keep `enrichTasks`/`enrichProjects` exported and pure.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Lint/format, commit.**

```bash
git add packages/productivity
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(productivity): add enriched task/project queries (wrapping-SDK surface)"
```

---

## Task 7: Productivity — structural next-action marking

(Implement the helper used by Task 6; written as its own task for a focused test. If executing strictly in order, Task 6 imports it — implement Task 7's helper first or stub then fill. Recommended: do Task 7 before Task 6's Step 3.)

**Files:**
- Create: `packages/productivity/src/derived/next-action.ts`
- Test: `packages/productivity/tests/unit/next-action.test.ts`

- [ ] **Step 1: Write the failing test** (spec §5.2 — first `available` action per project by order; diverges from native single-valued `Next`):

```ts
import { describe, it, expect } from "vitest";
import { markNextActions } from "../../src/derived/next-action.js";

it("marks the first available task per project as the next action (spec §5.2)", () => {
  const tasks = [
    { id: "a", projectId: "p", effectiveStatus: "available" },
    { id: "b", projectId: "p", effectiveStatus: "available" },
    { id: "c", projectId: "q", effectiveStatus: "blocked" },
    { id: "d", projectId: "q", effectiveStatus: "available" },
  ] as never[];
  const flags = markNextActions(tasks);
  expect(flags).toEqual({ a: true, b: false, c: false, d: true });
});
it("an overdue/due-soon first action still counts (it is 'available')", () => {
  const tasks = [{ id: "x", projectId: "p", effectiveStatus: "available" }] as never[];
  expect(markNextActions(tasks)).toEqual({ x: true });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Write `src/derived/next-action.ts`:**

```ts
/**
 * Mark the first `available` task in each project (by input order) as the next
 * action. Diverges from native single-valued `Task.Status.Next` so an overdue
 * or due-soon first action still qualifies (spec §5.2).
 * @public
 */
export function markNextActions(
  tasks: readonly { id: string; projectId: string | null; effectiveStatus: string }[],
): Record<string, boolean> {
  const seenProject = new Set<string>();
  const out: Record<string, boolean> = {};
  for (const t of tasks) {
    const key = t.projectId ?? "__inbox__";
    const isNext = t.effectiveStatus === "available" && !seenProject.has(key);
    if (isNext) seenProject.add(key);
    out[t.id] = isNext;
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit.**

```bash
git add packages/productivity
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(productivity): add structural next-action marking"
```

---

## Task 8: Productivity — `stalled-projects` command

**Files:**
- Create: `packages/productivity/src/commands/stalled-projects.ts`
- Modify: `packages/productivity/src/index.ts` (export + add to `productivityDescriptors`)
- Test: `packages/productivity/tests/unit/stalled-projects.test.ts`

- [ ] **Step 1: Write the failing test** — `runStalledProjects(deps)` returns only active projects where `stalled`, using an injected enriched-project fetcher (mirror `digests.ts` deps). Assert it filters to stalled and shapes a decision-ready list (name, folder, remainingTaskCount).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `runStalledProjects` + `stalledProjectsDescriptor` (via `defineCommand`, `cliName: "stalled-projects"`, `mcpName: "stalled_projects"`) over `queryProjectsEnriched` filtered to `stalled === true`. Export both from `src/index.ts` and append `stalledProjectsDescriptor` to `productivityDescriptors`.

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(productivity): add stalled-projects command`.

---

## Task 9: Productivity — `next-actions` command

**Files:**
- Create: `packages/productivity/src/commands/next-actions.ts`
- Modify: `packages/productivity/src/index.ts`
- Test: `packages/productivity/tests/unit/next-actions.test.ts`

- [ ] **Step 1: Write the failing test** — `runNextActions(deps)` returns the single `isNextAction` task per active project, grouped by project, using an injected enriched-task fetcher.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `runNextActions` + `nextActionsDescriptor` (`cliName: "next-actions"`, `mcpName: "next_actions"`) over `queryTasksEnriched` filtered to `isNextAction`. Export + append to `productivityDescriptors`.

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(productivity): add next-actions command`.

---

## Task 10: Wire CLI/MCP/docs + expected-tools fixture

**Files:**
- Modify: `packages/mcp/tests/fixtures/expected-tools.ts`
- Regenerate: `AGENT_*.md`, `skills/ofocus/SKILL.md` (via build), productivity api-report
- Test: existing CLI/MCP registry integration tests

- [ ] **Step 1:** Add `stalled_projects` and `next_actions` to `packages/mcp/tests/fixtures/expected-tools.ts` (match the existing entry format).

- [ ] **Step 2: Build the workspace** — `pnpm build` (regenerates agent docs from the descriptor union and the productivity api-report). Review the doc diff: the two new commands should appear in `AGENT_CLI_INSTRUCTIONS.md` / `AGENT_INSTRUCTIONS.md` / `SKILL.md`, and the productivity api-report should now include the enriched surface + the two commands.

- [ ] **Step 3: Run CLI + MCP unit/integration tests** — `pnpm -r run test:unit` for cli/mcp/productivity/sdk. Expect PASS (the MCP expected-tools test now matches).

- [ ] **Step 4: Commit** `feat: surface stalled-projects and next-actions in CLI and MCP` (include regenerated docs + api-report + fixture).

---

## Task 11: Changeset

**Files:**
- Create: `.changeset/derived-state-engine.md`

- [ ] **Step 1: Write the changeset:**

```md
---
"@ofocus/sdk": minor
"@ofocus/productivity": minor
"@ofocus/omnijs-types": patch
---

Add the derived-state engine (A3): explicit effectiveStatus, blockedReason
(ordered by binding precedence), isNextAction, and project stalled/empty —
via an enriched wrapping-SDK surface in `@ofocus/productivity` plus
`stalled-projects` and `next-actions` commands. The SDK gains raw `taskStatus`,
project `availableTaskCount`, and task effective-date query fields.
```

(Include `@ofocus/omnijs-types` only if Task 5 extended its slice.)

- [ ] **Step 2: Commit** `git add .changeset` → `chore: changeset for derived-state engine`.

---

## Task 12: Roadmap reconciliation (overdue — both A3 and the foundation spec call for it)

**Files:**
- Modify: `docs/specs/2026-05-30-ofocus-agent-principles.md`

- [ ] **Step 1:** In the capability roadmap table (around lines 147–151), change the **Status** column: **A2 → Shipped**, **A4 → Shipped**, and add a row (or note) that **calendar conversance shipped** (agent-supplies-snapshots boundary). Set **A3 → Shipped** once this tranche merges (or "In progress" until then).

- [ ] **Step 2:** Reconcile the "Out of scope" section: the "Calendar / EventKit bridging … out of scope" line is stale — calendar conversance shipped via agent-supplied event snapshots (no calendar read in the tool). Reword to describe the boundary that actually shipped.

- [ ] **Step 3:** Record **A3's actual shape**: raw native fields in L1 (`@ofocus/sdk` field specs) + the derived engine as L2's enriched wrapping-SDK surface in `@ofocus/productivity` — *not* the original "A3 = L2 field-spec" classification. Add the **"type-safe at every layer"** tenet and the typed-OmniAutomation foundation to the roadmap. Reset "what's next after A3."

- [ ] **Step 4: Commit** `docs(specs): reconcile roadmap — A2/A4/calendar shipped, record A3 shape and typed-authoring tenet`.

---

## Final verification

- [ ] Run `/clean_blt` (clean build + lint + test). Fix any failure attributable to this change; the pre-existing `packages/cli test:unit` quirk and flaky productivity temporal UAT are not blockers.
- [ ] Add a **gated UAT** (`packages/productivity/tests/uat/derived-state.uat.test.ts`, `describe.skip` unless `/Applications/OmniFocus.app` exists) driving `stalled-projects` and `next-actions` against a live database, asserting the envelope shape (mirror the existing productivity UAT pattern).
- [ ] Confirm both api-reports (sdk, productivity) are committed and reflect the new surface.

---

## Self-review (completed during planning)

- **Spec coverage:** §4 raw fields → Tasks 1–2; §5.1 effectiveStatus / §5.3 blockedReason / §5.4 stalled-empty → Task 4; §5.2 isNextAction → Task 7; §5.5 relational enrichment via defineOmniScript → Task 5; §5 enriched wrapping-SDK surface → Task 6; §6 convenience commands → Tasks 8–9; §7 CLI/MCP surfacing → Task 10; §8 governance → Task 3; §9 testing → tests throughout + final gated UAT; §12 roadmap reconciliation → Task 12.
- **Type consistency:** `EnrichedTask`/`EnrichedProject` (Task 4 types.ts) consumed by Tasks 6/8/9; `effectiveStatus`/`blockedReason`/`projectHealth` (Task 4) and `markNextActions` (Task 7) consumed by Task 6; `relationalFactsScript`/`fetchRelationalFacts` (Task 5) consumed by Task 6; descriptor names (`stalled-projects`/`stalled_projects`, `next-actions`/`next_actions`) consistent across Tasks 8/9/10.
- **Ordering note:** Task 7's `markNextActions` is a dependency of Task 6 — implement Task 7 before Task 6 Step 3 (flagged in Task 7).
- **Placeholder scan:** the two convenience-command tasks (8/9) and Task 6's wrapper reference "mirror `digests.ts`" for the descriptor/deps boilerplate rather than repeating it; all novel logic (transforms, precedence, omnijs expressions, relational pass, next-action rule) is given in full.

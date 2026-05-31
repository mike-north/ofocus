# `ofocus resolve` — Fuzzy Resolution & Disambiguation (A4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `ofocus resolve <query>` — fuzzy/ranked resolution of OmniFocus entities (and repeating-task temporal anchors) returning a disambiguation contract (resolved / ambiguous / none), so an agent passes a fuzzy reference and gets a confident match or a tight candidate set.

**Architecture:** All in `@ofocus/productivity` (L2). A pure, zero-dependency multi-signal ranking engine (`score`/`rankCandidates`/`classify`) ranks candidate entities **in-process**; the candidate sets come from the existing SDK entity queries (`queryProjects/queryTasks/queryTags/queryFolders`) and, for `--kind temporal-anchor`, from A2's `scanRepeatingTasks` + `parseRRule`/`expandOccurrences`. SDK unchanged; no calendar access; no new runtime dependency.

**Tech Stack:** TypeScript (ESM, NodeNext, strict tsconfig incl. `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`), Zod, **vitest**. Branch `claude/ofocus-resolve` (stacked on A2 / `claude/ofocus-temporal-engine`).

**Spec:** [`docs/superpowers/specs/2026-05-31-ofocus-resolve-disambiguation-design.md`](../specs/2026-05-31-ofocus-resolve-disambiguation-design.md)

**Conventions (every commit):** author `--author="Mike North <michael.l.north@gmail.com>"`, no AI trailers, run from the worktree root. Tests: `pnpm --filter @ofocus/productivity exec vitest run <file>`.

**Confirmed reuse points:**
- Exported from `@ofocus/sdk`: `queryProjects`, `queryTasks`, `queryTags`, `queryFolders` (each `(options) => Promise<CliOutput<QueryResult<T>>>`; the list lives at `{ kind: "list"; items: T[] }`), `defineCommand`, `success`, `failure`, `createError`, `ErrorCode`, types `OFProject`/`OFTask`/`OFTag`/`OFFolder`, `CliOutput`.
- Context fields: `OFProject.folderName`, `OFTask.projectName`, `OFTag.parentName`, `OFFolder.parentName` (all `string | null`).
- A2 (this branch): `scanRepeatingTasks(): Promise<TaskRule[]>`, `parseRRule(ruleString, repeatMethod)`, `expandOccurrences(rule, anchorISO, count, {fromISO})`, type `TaskRule` — in `packages/productivity/src/recurrence/`.
- The `QueryResult` unwrap helper pattern (`kind === "list" ? items : []`) used in `packages/productivity/src/commands/digests.ts` (`itemsOf`); replicate or extract a shared helper.
- Command/descriptor + injected-deps pattern: `packages/productivity/src/commands/next-occurrences.ts`. CLI registration: `packages/cli/src/cli.ts` (the temporal commands block). MCP fixture: `packages/mcp/tests/fixtures/expected-tools.ts` (`PRODUCTIVITY_TOOLS`).

---

## File Structure
```
packages/productivity/src/resolve/
  types.ts     # ResolveCandidate, DisambiguationResult, ResolveKind
  rank.ts      # score, rankCandidates, classify, RANK_THRESHOLDS (pure)
packages/productivity/src/commands/
  resolve.ts   # resolveDescriptor + runResolve (entity kinds + temporal-anchor)
packages/productivity/tests/unit/
  rank.test.ts, classify.test.ts, resolve.test.ts
packages/productivity/tests/uat/
  resolve.uat.test.ts
# wiring: src/index.ts, packages/cli/src/cli.ts, packages/mcp/tests/fixtures/expected-tools.ts, regenerated agent docs
```

---

## Task 1: Contract types

**Files:** Create `packages/productivity/src/resolve/types.ts`

- [ ] **Step 1: Write `types.ts`**
```ts
/** Entity kinds resolvable by `ofocus resolve`. */
export type ResolveKind = "project" | "task" | "tag" | "folder";

/** A ranked candidate. `context` is minimal disambiguating detail (folder/project/parent). */
export interface ResolveCandidate {
  id: string;
  name: string;
  kind: ResolveKind;
  /** folder path (project) / project (task) / parent (tag/folder); omitted when none. */
  context?: string;
  /** Match score in [0,1], rounded to 2 decimals. */
  score: number;
}

/** A resolved temporal anchor carries the next occurrence (A2). */
export interface ResolvedAnchor extends ResolveCandidate {
  nextOccurrence: string | null;
  occurrences?: string[];
}

/** The disambiguation contract (spec §3.2). `T` is the candidate shape. */
export type DisambiguationResult<T extends { score: number }> =
  | { status: "resolved"; resolved: T; confidence: "high" }
  | { status: "ambiguous"; candidates: T[] }
  | { status: "none"; suggestions: T[]; note?: string };
```

- [ ] **Step 2: Verify compile** — `pnpm --filter @ofocus/productivity exec tsc --noEmit -p tsconfig.json` (or `pnpm -w exec tsc --build`). Expected: clean.
- [ ] **Step 3: Commit**
```bash
git add packages/productivity/src/resolve/types.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(productivity): resolve disambiguation contract types"
```

---

## Task 2: The `score` multi-signal scorer (pure)

**Files:** Create `packages/productivity/src/resolve/rank.ts` (score only); Test `packages/productivity/tests/unit/rank.test.ts`

- [ ] **Step 1: Write the failing test** (assert ORDERING and BUCKETS, not brittle exact decimals — per spec §5)
```ts
import { describe, it, expect } from "vitest";
import { score } from "../../src/resolve/rank.js";

describe("score", () => {
  it("exact (normalized) match scores 1", () => {
    expect(score("Project Falcon", "Project Falcon")).toBe(1);
    expect(score("  project   falcon ", "Project Falcon")).toBe(1); // normalized
  });
  it("empty query scores 0", () => {
    expect(score("", "Anything")).toBe(0);
  });
  it("prefix scores higher than mid-string substring", () => {
    expect(score("Project", "Project Falcon")).toBeGreaterThan(score("Falcon", "Project Falcon"));
  });
  it("substring beats unrelated", () => {
    expect(score("falcon", "Project Falcon")).toBeGreaterThan(score("zzz", "Project Falcon"));
  });
  it("token-subsequence is word-order-independent", () => {
    expect(score("falcon project", "Project Falcon")).toBeGreaterThan(0.6);
  });
  it("tolerates a typo via edit distance (less than a clean substring)", () => {
    const typo = score("falcn", "Project Falcon");
    expect(typo).toBeGreaterThan(0.3);
    expect(typo).toBeLessThan(score("falcon", "Project Falcon"));
  });
  it("acronym/initialism matches leading letters", () => {
    expect(score("PF", "Project Falcon")).toBeGreaterThan(0.5);
    expect(score("PF", "Personal Finance")).toBeGreaterThan(0.5);
  });
  it("is case-insensitive", () => {
    expect(score("PROJECT falcon", "project Falcon")).toBe(1);
  });
  it("unrelated query scores near zero", () => {
    expect(score("quarterly taxes", "Project Falcon")).toBeLessThan(0.3);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — `pnpm --filter @ofocus/productivity exec vitest run tests/unit/rank.test.ts`

- [ ] **Step 3: Implement `score` in `rank.ts`**
```ts
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
function tokens(s: string): string[] {
  return s.length === 0 ? [] : s.split(" ");
}
/** Levenshtein distance (iterative, O(n·m)). */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}

/**
 * Fuzzy match score in [0,1], deterministic, case-insensitive. Combines several
 * signals via a max (best signal wins). See spec §3.1.
 */
export function score(query: string, name: string): number {
  const q = norm(query);
  const n = norm(name);
  if (q.length === 0) return 0;
  if (q === n) return 1;

  const signals: number[] = [];
  if (n.startsWith(q)) signals.push(0.95);
  else if (n.includes(q)) signals.push(0.85);

  // token-subsequence: every query token is a prefix of a distinct name token (order-independent)
  const qts = tokens(q);
  const nts = tokens(n);
  if (qts.length > 0) {
    const used = new Array<boolean>(nts.length).fill(false);
    let matched = 0;
    for (const qt of qts) {
      const idx = nts.findIndex((nt, i) => !used[i] && nt.startsWith(qt));
      if (idx >= 0) { used[idx] = true; matched++; }
    }
    if (matched === qts.length) signals.push(0.8);
  }

  // acronym/initialism: query letters (no spaces) match leading letters of the first tokens
  if (!q.includes(" ") && q.length >= 2 && nts.length >= q.length) {
    const initials = nts.slice(0, q.length).map((t) => t[0] ?? "").join("");
    if (initials === q) signals.push(0.7);
  }

  // edit-distance similarity over the whole string (typos)
  const dist = levenshtein(q, n);
  const sim = 1 - dist / Math.max(q.length, n.length);
  if (sim > 0.6) signals.push(sim * 0.9);

  const best = signals.length > 0 ? Math.max(...signals) : 0;
  return Math.min(1, Math.max(0, best));
}
```

- [ ] **Step 4: Run, confirm PASS.** If a bucket assertion fails, tune the per-signal weights (keep the relative ordering the tests encode) — do NOT weaken the tests.
- [ ] **Step 5: `pnpm exec eslint packages/productivity/src` + `pnpm -w exec tsc --build`; fix issues. Commit.**
```bash
git add packages/productivity/src/resolve/rank.ts packages/productivity/tests/unit/rank.test.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(productivity): multi-signal fuzzy score()"
```

---

## Task 3: `rankCandidates` + `classify`

**Files:** Modify `rank.ts`; Test `packages/productivity/tests/unit/classify.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { rankCandidates, classify, RANK_THRESHOLDS } from "../../src/resolve/rank.js";

const items = [
  { id: "a", name: "Project Falcon", kind: "project" as const },
  { id: "b", name: "Falcon Mobile App", kind: "project" as const },
  { id: "c", name: "Quarterly Taxes", kind: "project" as const },
];

describe("rankCandidates", () => {
  it("scores, sorts desc, floors, and limits", () => {
    const r = rankCandidates("falcon", items, { limit: 5 });
    expect(r[0]!.id).toBe("a"); // 'Project Falcon' — but either Falcon item may top; both contain 'falcon'
    expect(r.map((c) => c.id)).toContain("b");
    expect(r.find((c) => c.id === "c")).toBeUndefined(); // taxes floored out
    expect(r.every((c, i) => i === 0 || c.score <= r[i - 1]!.score)).toBe(true);
  });
  it("respects limit", () => {
    expect(rankCandidates("a", items, { limit: 1 }).length).toBeLessThanOrEqual(1);
  });
});

describe("classify", () => {
  const cand = (id: string, sc: number) => ({ id, name: id, kind: "project" as const, score: sc });
  it("resolved: single strong candidate", () => {
    const r = classify([cand("a", 0.95)], RANK_THRESHOLDS);
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.resolved.id).toBe("a");
  });
  it("resolved: clear winner beyond margin", () => {
    expect(classify([cand("a", 0.95), cand("b", 0.5)], RANK_THRESHOLDS).status).toBe("resolved");
  });
  it("ambiguous: two strong within margin", () => {
    expect(classify([cand("a", 0.9), cand("b", 0.85)], RANK_THRESHOLDS).status).toBe("ambiguous");
  });
  it("ambiguous: top below T_high but above T_low", () => {
    expect(classify([cand("a", 0.6), cand("b", 0.55)], RANK_THRESHOLDS).status).toBe("ambiguous");
  });
  it("none: everything below T_low → suggestions", () => {
    const r = classify([cand("a", 0.3)], RANK_THRESHOLDS);
    expect(r.status).toBe("none");
    if (r.status === "none") expect(r.suggestions.length).toBeGreaterThanOrEqual(0);
  });
  it("none: empty input", () => {
    expect(classify([], RANK_THRESHOLDS).status).toBe("none");
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Implement in `rank.ts`**
```ts
import type { DisambiguationResult } from "./types.js";

export interface RankThresholds { tHigh: number; margin: number; tLow: number; limit: number; }
export const RANK_THRESHOLDS: RankThresholds = { tHigh: 0.85, margin: 0.15, tLow: 0.4, limit: 5 };

export interface RankOpts { limit?: number; floor?: number; }

/** Score, sort desc (tie-break: shorter name, then name asc), floor, limit. */
export function rankCandidates<T extends { name: string }>(
  query: string,
  items: readonly T[],
  opts: RankOpts = {},
): (T & { score: number })[] {
  const floor = opts.floor ?? 0.2;
  const limit = opts.limit ?? RANK_THRESHOLDS.limit;
  const scored = items
    .map((it) => ({ ...it, score: Math.round(score(query, it.name) * 100) / 100 }))
    .filter((c) => c.score >= floor)
    .sort((a, b) =>
      b.score - a.score ||
      a.name.length - b.name.length ||
      a.name.localeCompare(b.name),
    );
  return scored.slice(0, limit);
}

/** Map scored candidates to the disambiguation contract (spec §3.2). */
export function classify<T extends { score: number }>(
  scored: readonly T[],
  t: RankThresholds = RANK_THRESHOLDS,
): DisambiguationResult<T> {
  if (scored.length === 0) return { status: "none", suggestions: [] };
  const top = scored[0]!;
  const second = scored[1];
  const clearWinner = second === undefined || top.score - second.score >= t.margin;
  if (top.score >= t.tHigh && clearWinner) {
    return { status: "resolved", resolved: top, confidence: "high" };
  }
  const candidates = scored.filter((c) => c.score >= t.tLow);
  if (candidates.length > 0) return { status: "ambiguous", candidates };
  return { status: "none", suggestions: scored.slice(0, 3) };
}
```

- [ ] **Step 4: Run, confirm PASS.** **Step 5: eslint + tsc --build; commit.**
```bash
git add packages/productivity/src/resolve/rank.ts packages/productivity/tests/unit/classify.test.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(productivity): rankCandidates + classify (disambiguation contract)"
```

---

## Task 4: `resolve` command — entity kinds

**Files:** Create `packages/productivity/src/commands/resolve.ts`; Test `packages/productivity/tests/unit/resolve.test.ts`; Modify `packages/productivity/src/index.ts`

- [ ] **Step 1: Write the failing test** (inject entity fetchers; no live OmniFocus)
```ts
import { describe, it, expect } from "vitest";
import { runResolve, type ResolveDeps } from "../../src/commands/resolve.js";

const projects = [
  { id: "a", name: "Project Falcon", folderName: "Work/Infra" },
  { id: "b", name: "Falcon Mobile App", folderName: "Work/Apps" },
  { id: "c", name: "Quarterly Taxes", folderName: null },
];
const deps = (over: Partial<ResolveDeps> = {}): ResolveDeps => ({
  fetchProjects: async () => projects.map((p) => ({ id: p.id, name: p.name, kind: "project", context: p.folderName ?? undefined })),
  fetchTasks: async () => [],
  fetchTags: async () => [],
  fetchFolders: async () => [],
  resolveAnchor: async () => ({ status: "none", suggestions: [] }),
  ...over,
});

describe("runResolve (entity)", () => {
  it("ambiguous → candidates for two close Falcon projects", async () => {
    const out = await runResolve({ query: "falcon", kind: "project" }, deps());
    expect(out.success).toBe(true);
    const d = out.data!;
    expect(["ambiguous", "resolved"]).toContain(d.status);
    if (d.status === "ambiguous") {
      expect(d.candidates.map((c) => c.id).sort()).toEqual(["a", "b"]);
      expect(d.candidates[0]!.context).toBeDefined();
    }
  });
  it("resolved → exact name", async () => {
    const out = await runResolve({ query: "Project Falcon", kind: "project" }, deps());
    expect(out.data!.status).toBe("resolved");
  });
  it("none → unrelated query yields status none", async () => {
    const out = await runResolve({ query: "zzzzz nonsense", kind: "project" }, deps());
    expect(out.data!.status).toBe("none");
  });
  it("empty query → failure", async () => {
    const out = await runResolve({ query: "  ", kind: "project" }, deps());
    expect(out.success).toBe(false);
  });
  it("kind 'any' unions project+task", async () => {
    const out = await runResolve({ query: "falcon", kind: "any" }, deps({
      fetchTasks: async () => [{ id: "t1", name: "Falcon launch checklist", kind: "task", context: "Project Falcon" }],
    }));
    const d = out.data!;
    if (d.status === "ambiguous") expect(d.candidates.some((c) => c.kind === "task")).toBe(true);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Implement `resolve.ts`**
```ts
import { z } from "zod";
import { type CliOutput, defineCommand, success, failure, createError, ErrorCode } from "@ofocus/sdk";
import { rankCandidates, classify, RANK_THRESHOLDS } from "../resolve/rank.js";
import type { DisambiguationResult, ResolveCandidate, ResolvedAnchor } from "../resolve/types.js";

export type ResolveOutput =
  | DisambiguationResult<ResolveCandidate>
  | DisambiguationResult<ResolvedAnchor>;

export interface ResolveDeps {
  fetchProjects: () => Promise<ResolveCandidate[]>;
  fetchTasks: () => Promise<ResolveCandidate[]>;
  fetchTags: () => Promise<ResolveCandidate[]>;
  fetchFolders: () => Promise<ResolveCandidate[]>;
  /** temporal-anchor resolution (Task 5); entity-only tests stub this. */
  resolveAnchor: (query: string, limit: number) => Promise<DisambiguationResult<ResolvedAnchor>>;
}

interface ResolveInput {
  query?: string;
  kind?: "project" | "task" | "tag" | "folder" | "temporal-anchor" | "any";
  limit?: number;
}

export async function runResolve(
  input: ResolveInput,
  deps: ResolveDeps,
): Promise<CliOutput<ResolveOutput>> {
  const query = (input.query ?? "").trim();
  if (query.length === 0) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, "resolve requires a non-empty query"));
  }
  const kind = input.kind ?? "project";
  const limit = input.limit ?? RANK_THRESHOLDS.limit;

  if (kind === "temporal-anchor") {
    return success(await deps.resolveAnchor(query, limit));
  }

  let items: ResolveCandidate[];
  switch (kind) {
    case "project": items = await deps.fetchProjects(); break;
    case "task": items = await deps.fetchTasks(); break;
    case "tag": items = await deps.fetchTags(); break;
    case "folder": items = await deps.fetchFolders(); break;
    case "any": items = [...(await deps.fetchProjects()), ...(await deps.fetchTasks())]; break;
  }
  const ranked = rankCandidates(query, items, { limit });
  return success(classify(ranked, RANK_THRESHOLDS));
}

export const resolveDescriptor = defineCommand({
  name: "resolve",
  cliName: "resolve",
  mcpName: "resolve",
  description:
    "Resolve a fuzzy reference to an OmniFocus entity. Returns a confidently resolved match, a tight ranked candidate set (ambiguous), or none. --kind temporal-anchor matches a repeating task and returns its next occurrence.",
  cliPositional: ["query"],
  inputSchema: z.object({
    query: z.string().describe("Fuzzy reference, e.g. 'Project Falcon' or 'next stand-up'"),
    kind: z
      .enum(["project", "task", "tag", "folder", "temporal-anchor", "any"])
      .optional()
      .describe("What to resolve (default: project; 'any' = project + task)"),
    limit: z.number().int().positive().optional().describe("Max candidates (default 5)"),
  }),
  handler: async (parsed): Promise<CliOutput<ResolveOutput>> => runResolve(parsed, realDeps()),
});
```
Also implement `realDeps()` (below the descriptor) wiring the real queries — reuse the `itemsOf` unwrap from digests (extract it to a tiny shared `src/resolve/fetch.ts` or inline). Map each entity to `{id,name,kind,context}`:
```ts
import { queryProjects, queryTasks, queryTags, queryFolders } from "@ofocus/sdk";
import type { QueryResult } from "@ofocus/sdk"; // if exported; else use the digests itemsOf pattern

function itemsOf<T>(r: { kind: string } & Record<string, unknown>): T[] {
  return r.kind === "list" ? ((r as { items: T[] }).items) : [];
}
function realDeps(): ResolveDeps {
  return {
    fetchProjects: async () => {
      const res = await queryProjects({ all: true });
      if (!res.success || res.data === null) return [];
      return itemsOf<{ id: string; name: string; folderName: string | null }>(res.data)
        .map((p) => ({ id: p.id, name: p.name, kind: "project" as const, ...(p.folderName ? { context: p.folderName } : {}) }));
    },
    fetchTasks: async () => {
      const res = await queryTasks({ all: true, notCompleted: true });
      if (!res.success || res.data === null) return [];
      return itemsOf<{ id: string; name: string; projectName: string | null }>(res.data)
        .map((t) => ({ id: t.id, name: t.name, kind: "task" as const, ...(t.projectName ? { context: t.projectName } : {}) }));
    },
    fetchTags: async () => {
      const res = await queryTags({ all: true });
      if (!res.success || res.data === null) return [];
      return itemsOf<{ id: string; name: string; parentName: string | null }>(res.data)
        .map((t) => ({ id: t.id, name: t.name, kind: "tag" as const, ...(t.parentName ? { context: t.parentName } : {}) }));
    },
    fetchFolders: async () => {
      const res = await queryFolders({ all: true });
      if (!res.success || res.data === null) return [];
      return itemsOf<{ id: string; name: string; parentName?: string | null }>(res.data)
        .map((f) => ({ id: f.id, name: f.name, kind: "folder" as const, ...(f.parentName ? { context: f.parentName } : {}) }));
    },
    resolveAnchor: async () => ({ status: "none", suggestions: [] }), // replaced in Task 5
  };
}
```
(Confirm `QueryResult` discriminant + the exact query option names (`all`, `notCompleted`) against `packages/sdk/src/query/types.ts` — the digests command (`digests.ts`) already uses `all: true` and `itemsOf`; mirror it. If `queryFolders`/`queryTags` don't accept `all`, drop it — they're small sets.)

- [ ] **Step 4: Run, confirm PASS.**
- [ ] **Step 5: Register** — in `packages/productivity/src/index.ts` add `resolveDescriptor` to `productivityDescriptors` and export `runResolve`/types. In `packages/mcp/tests/fixtures/expected-tools.ts` add `"resolve"` to `PRODUCTIVITY_TOOLS`.
- [ ] **Step 6: eslint + `tsc --build` + productivity & mcp suites green. Commit.**
```bash
git add packages/productivity/src/commands/resolve.ts packages/productivity/src/resolve packages/productivity/tests/unit/resolve.test.ts packages/productivity/src/index.ts packages/mcp/tests/fixtures/expected-tools.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(productivity): resolve command (entity kinds)"
```

---

## Task 5: Temporal-anchor resolution

**Files:** Modify `packages/productivity/src/commands/resolve.ts` (implement `resolveAnchor` in `realDeps`); Test `packages/productivity/tests/unit/resolve.test.ts` (add cases)

- [ ] **Step 1: Add the failing test** (inject a repeating-task set + a fake expander)
```ts
import { runResolve, type ResolveDeps } from "../../src/commands/resolve.js";
// reuse the `deps` factory; override resolveAnchor with the REAL logic under test by
// testing the exported `buildAnchorResolver` (see impl) with injected scan + expand.
import { buildAnchorResolver } from "../../src/commands/resolve.js";

describe("temporal-anchor resolution", () => {
  const repeating = [
    { id: "s", name: "Team Stand-up", ruleString: "FREQ=WEEKLY;BYDAY=MO", method: "DueDate" as const, dueDate: "2026-06-01T16:00:00.000Z", deferDate: null, completionDate: null },
    { id: "x", name: "Water the plants", ruleString: "FREQ=DAILY", method: "DueDate" as const, dueDate: "2026-06-01T12:00:00.000Z", deferDate: null, completionDate: null },
  ];
  const resolver = buildAnchorResolver({
    scanRepeatingTasks: async () => repeating,
    now: "2026-05-31T00:00:00.000Z",
  });

  it("resolves 'stand-up' and attaches a next occurrence", async () => {
    const r = await resolver("stand up", 5);
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") {
      expect(r.resolved.id).toBe("s");
      expect(typeof r.resolved.nextOccurrence).toBe("string");
    }
  });
  it("returns none + calendar hint when nothing matches", async () => {
    const r = await resolver("dentist appointment", 5);
    expect(r.status).toBe("none");
    if (r.status === "none") expect(r.note ?? "").toMatch(/calendar/i);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Implement** in `resolve.ts`: export `buildAnchorResolver(deps: { scanRepeatingTasks; now })` returning `(query, limit) => Promise<DisambiguationResult<ResolvedAnchor>>`. It maps the repeating tasks to candidates `{id,name,kind:"task",context?}`, `rankCandidates` + `classify`; if `resolved`, parse the rule (`parseRRule(ruleString, methodMap(method))`, anchor = `dueDate ?? deferDate ?? now`) and `expandOccurrences(rule, anchor, 1, { fromISO: now })[0] ?? null` → attach `nextOccurrence` (+ optionally `occurrences` for a small count); if `ambiguous`, map candidates to `ResolvedAnchor` with `nextOccurrence: null` (or computed per candidate — keep `null` for v1 simplicity, documented); if `none`, set `note: "No repeating OmniFocus task matched; this may be a calendar event — resolve it with your calendar tool."`. Reuse the `methodMap` from `next-occurrences.ts` (export it there and import, to avoid duplication). Wire `realDeps().resolveAnchor = buildAnchorResolver({ scanRepeatingTasks, now: new Date().toISOString() })`.
- [ ] **Step 4: Run, confirm PASS (incl. the Task 4 entity tests still pass).**
- [ ] **Step 5: eslint + tsc + suites; commit.**
```bash
git add packages/productivity/src/commands/resolve.ts packages/productivity/src/commands/next-occurrences.ts packages/productivity/tests/unit/resolve.test.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(productivity): temporal-anchor resolution in resolve"
```

---

## Task 6: CLI wiring + clean gate + docs

**Files:** Modify `packages/cli/src/cli.ts`; regenerate agent docs

- [ ] **Step 1: Register in `packages/cli/src/cli.ts`** — import `resolveDescriptor` from `@ofocus/productivity` (add to the existing productivity import block) and add, alongside the temporal-engine registrations:
```ts
registerCliCommand(program, resolveDescriptor, (result, cmd) => {
  output(result, getOutputFormat(getGlobalOpts(cmd)));
});
```
- [ ] **Step 2: Clean gate** — `pnpm clean && pnpm build` (regenerates AGENT_INSTRUCTIONS/AGENT_CLI_INSTRUCTIONS/SKILL.md to include `resolve`), `pnpm lint`, `pnpm test`. All green (CI-relevant; live UATs may run locally). 
- [ ] **Step 3: Smoke** — `node packages/cli/dist/index.js resolve --help` shows `--kind`/`--limit`; `node packages/cli/dist/index.js list-commands --format json` includes `resolve`.
- [ ] **Step 4: Commit** (include regenerated docs)
```bash
git add packages/cli/src/cli.ts AGENT_INSTRUCTIONS.md AGENT_CLI_INSTRUCTIONS.md skills/ofocus/SKILL.md
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(cli): surface resolve command; regenerate agent docs"
```

---

## Task 7: Live UAT

**Files:** Create `packages/productivity/tests/uat/resolve.uat.test.ts`

- [ ] **Step 1: Write the UAT** mirroring `tests/uat/temporal.uat.test.ts` (build-gated `describe.skip`; OmniFocus-gated live `it`; `nonAgenticEnv` for `--help`; temp `OFOCUS_STATE_DIR`; generous per-test timeout e.g. `, 30000` to avoid live-scan flakiness). Shape/sanity assertions only:
  - `resolve --help` documents `--kind` and `--limit`.
  - **live**: `resolve "<a real project-name fragment>" --kind project` → `data.status` is one of resolved/ambiguous/none; if resolved/ambiguous, candidate/resolved has `id`,`name`,`kind:"project"`.
  - **live**: a deliberately abbreviated/typo query for that same project still surfaces it among `resolved`/`ambiguous` candidates.
  - **live**: `resolve "<a real repeating-task fragment>" --kind temporal-anchor` → resolved with a string `nextOccurrence`, OR (if no match) `none` with a calendar `note`.
  Derive the "real" fragments dynamically (e.g., run `node CLI projects --format json` / `occurrences --days 365` and take a name fragment) so the test isn't machine-specific; skip the assertion if the DB has no projects/repeats.
- [ ] **Step 2: Build + run** `pnpm --filter @ofocus/productivity exec vitest run tests/uat/resolve.uat.test.ts` — `--help` passes; live passes (OmniFocus here) or skips.
- [ ] **Step 3: Commit**
```bash
git add packages/productivity/tests/uat/resolve.uat.test.ts
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "test(productivity): UAT for resolve command"
```

---

## Task 8: Changeset + README

**Files:** Create `.changeset/ofocus-resolve.md`; modify `packages/productivity/README.md`

- [ ] **Step 1: Changeset** — minor bump `@ofocus/productivity`, `@ofocus/cli`, `@ofocus/mcp`, `ofocus` (NOT `@ofocus/sdk`). Summary:
  > Add `ofocus resolve <query>` — fuzzy, ranked resolution of OmniFocus entities (project/task/tag/folder) returning a confident match, a tight candidate set, or none. `--kind temporal-anchor` fuzzy-matches a repeating task and returns its next occurrence. Surfaced through the CLI and MCP server.
- [ ] **Step 2: README** — add a "Resolve" section to `packages/productivity/README.md` documenting `ofocus resolve <query> [--kind …] [--limit N]` and the resolved/ambiguous/none result shape, matching the existing table style.
- [ ] **Step 3: Commit**
```bash
git add .changeset/ofocus-resolve.md packages/productivity/README.md
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "docs(productivity): changeset + README for resolve"
```

---

## Self-Review

**Spec coverage:** ranking engine §3.1 → Tasks 2–3; contract §3.2 → Task 1; `resolve` entity kinds §3.3 → Task 4; temporal-anchor §3.3 → Task 5; surfacing §3.4 → Tasks 4 (descriptor/MCP) + 6 (CLI/docs); error handling §4 → Task 4 (empty-query failure, query-failure propagation via `!res.success → []` — NOTE: the plan currently treats a failed entity query as empty; if you prefer propagating the failure as a `CliOutput` error, adjust `realDeps` to return a discriminated result and surface it — left as an intentional simplification: empty-on-failure keeps `resolve` resilient, matching a "best-effort match" UX; revisit if strictness is wanted); testing §5 → Tasks 2,3,4,5 (unit) + 7 (UAT); file structure §6 → all.

**Placeholder scan:** No TBDs. The one judgement call (failed-query → empty vs propagate) is called out explicitly in Task 4 / here, with the chosen behavior stated.

**Type consistency:** `ResolveCandidate`/`ResolvedAnchor`/`DisambiguationResult`/`ResolveKind` (Task 1) are used consistently in `rank.ts` (Task 3: `classify<T>` generic) and `resolve.ts` (Tasks 4–5). `score`/`rankCandidates`/`classify`/`RANK_THRESHOLDS` signatures match between definition (Tasks 2–3) and use (Task 4). `runResolve`/`ResolveDeps`/`buildAnchorResolver`/`methodMap` names consistent across Tasks 4–5. `itemsOf` mirrors the digests pattern.

**Known follow-ups (deferred per spec §8):** anchored-create; A4b calendar-conversance/linkage. Ambiguous temporal-anchor candidates carry `nextOccurrence: null` in v1 (documented).

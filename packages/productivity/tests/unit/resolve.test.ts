/**
 * Unit tests for the `resolve` command — entity kinds and temporal-anchor.
 *
 * Entity resolution and ranking are driven by the deterministic fuzzy scorer in
 * `src/resolve/rank.ts`; these tests assert the disambiguation contract
 * (resolved / ambiguous / none) for the supported kinds, and the temporal-anchor
 * resolver's next-occurrence attachment and calendar-fallback note.
 */
import { describe, it, expect } from "vitest";
import {
  runResolve,
  buildAnchorResolver,
  type ResolveDeps,
} from "../../src/commands/resolve.js";
import type { ResolveCandidate } from "../../src/resolve/types.js";

const projects: ResolveCandidate[] = [
  { id: "a", name: "Project Falcon", kind: "project", context: "Work/Infra", score: 0 },
  { id: "b", name: "Falcon Mobile App", kind: "project", context: "Work/Apps", score: 0 },
  { id: "c", name: "Quarterly Taxes", kind: "project", score: 0 },
];
const deps = (over: Partial<ResolveDeps> = {}): ResolveDeps => ({
  fetchProjects: async () => projects.map((p) => ({ ...p, score: 0 })),
  fetchTasks: async () => [],
  fetchTags: async () => [],
  fetchFolders: async () => [],
  resolveAnchor: async () => ({ status: "none", suggestions: [] }),
  ...over,
});

describe("runResolve (entity)", () => {
  it("resolved → exact name", async () => {
    const out = await runResolve({ query: "Project Falcon", kind: "project" }, deps());
    expect(out.success).toBe(true);
    expect(out.data!.status).toBe("resolved");
  });
  it("ambiguous → two Falcon projects, candidates carry context", async () => {
    const out = await runResolve({ query: "falcon", kind: "project" }, deps());
    const d = out.data!;
    expect(["ambiguous", "resolved"]).toContain(d.status);
    if (d.status === "ambiguous") {
      expect(d.candidates.map((c) => c.id).sort()).toEqual(["a", "b"]);
      expect(d.candidates.some((c) => c.context !== undefined)).toBe(true);
    }
  });
  it("none → unrelated query", async () => {
    expect((await runResolve({ query: "zzzzz nonsense", kind: "project" }, deps())).data!.status).toBe("none");
  });
  it("empty query → failure", async () => {
    expect((await runResolve({ query: "   ", kind: "project" }, deps())).success).toBe(false);
  });
  it("kind 'any' unions project + task", async () => {
    const out = await runResolve({ query: "falcon", kind: "any" }, deps({
      fetchTasks: async () => [{ id: "t1", name: "Falcon launch checklist", kind: "task", context: "Project Falcon", score: 0 }],
    }));
    const d = out.data!;
    if (d.status === "ambiguous") expect(d.candidates.some((c) => c.kind === "task")).toBe(true);
  });
  it("defaults to project kind and routes to fetchProjects", async () => {
    let tasksCalled = false;
    const out = await runResolve({ query: "Project Falcon" }, deps({
      fetchTasks: async () => {
        tasksCalled = true;
        return [];
      },
    }));
    expect(out.data!.status).toBe("resolved");
    expect(tasksCalled).toBe(false);
  });
  it("kind 'temporal-anchor' delegates to resolveAnchor", async () => {
    const out = await runResolve({ query: "anything", kind: "temporal-anchor" }, deps({
      resolveAnchor: async () => ({
        status: "resolved",
        resolved: { id: "z", name: "Daily", kind: "task", score: 1, nextOccurrence: "2026-06-01T00:00:00.000Z" },
        confidence: "high",
      }),
    }));
    expect(out.success).toBe(true);
    expect(out.data!.status).toBe("resolved");
  });
});

describe("buildAnchorResolver (temporal-anchor)", () => {
  const repeating = [
    // Use "stand-up" (hyphenated, one token) as the query in tests: the scorer
    // does NOT split on hyphens, so "stand up" (two tokens) scores 0 against
    // "Team Stand-up" — see src/resolve/rank.ts. "stand-up" is a substring of
    // "team stand-up" → 0.85 (resolves; clear winner over the 0-scoring plants).
    { id: "s", name: "Team Stand-up", ruleString: "FREQ=WEEKLY;BYDAY=MO", method: "DueDate" as const, dueDate: "2026-06-01T16:00:00.000Z", deferDate: null, completionDate: null },
    { id: "x", name: "Water the plants", ruleString: "FREQ=DAILY", method: "DueDate" as const, dueDate: "2026-06-01T12:00:00.000Z", deferDate: null, completionDate: null },
  ];
  const resolver = buildAnchorResolver({ scanRepeatingTasks: async () => repeating, now: "2026-05-31T00:00:00.000Z" });

  it("resolves 'stand-up' and attaches a next occurrence", async () => {
    const r = await resolver("stand-up", 5);
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") {
      expect(r.resolved.id).toBe("s");
      expect(typeof r.resolved.nextOccurrence).toBe("string");
    }
  });
  it("none + calendar hint when nothing matches", async () => {
    const r = await resolver("dentist appointment", 5);
    expect(r.status).toBe("none");
    if (r.status === "none") expect(r.note ?? "").toMatch(/calendar/i);
  });
  it("ambiguous candidates carry a null nextOccurrence", async () => {
    // Two distinct daily-standup-ish repeating tasks tie at the same score, so
    // classify() returns ambiguous; the resolver must not enrich candidates.
    const ambiguous = buildAnchorResolver({
      scanRepeatingTasks: async () => [
        { id: "m", name: "Standup Morning", ruleString: "FREQ=DAILY", method: "DueDate" as const, dueDate: "2026-06-01T09:00:00.000Z", deferDate: null, completionDate: null },
        { id: "n", name: "Standup Evening", ruleString: "FREQ=DAILY", method: "DueDate" as const, dueDate: "2026-06-01T17:00:00.000Z", deferDate: null, completionDate: null },
      ],
      now: "2026-05-31T00:00:00.000Z",
    });
    const r = await ambiguous("standup", 5);
    if (r.status === "ambiguous") {
      expect(r.candidates.every((c) => c.nextOccurrence === null)).toBe(true);
    }
  });
});

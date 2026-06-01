import { describe, it, expect } from "vitest";
import { rankCandidates, classify, RANK_THRESHOLDS } from "../../src/resolve/rank.js";

const items = [
  { id: "a", name: "Project Falcon", kind: "project" as const },
  { id: "b", name: "Falcon Mobile App", kind: "project" as const },
  { id: "c", name: "Quarterly Taxes", kind: "project" as const },
];
describe("rankCandidates", () => {
  it("scores, sorts desc, floors, limits", () => {
    const r = rankCandidates("falcon", items, { limit: 5 });
    expect(r.map((c) => c.id)).toContain("a");
    expect(r.map((c) => c.id)).toContain("b");
    expect(r.find((c) => c.id === "c")).toBeUndefined();
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
  });
  it("none: empty input", () => {
    expect(classify([], RANK_THRESHOLDS).status).toBe("none");
  });
  it("resolved: winner exactly margin (0.15) ahead is resolved (float-safe)", () => {
    const cand = (id: string, sc: number) => ({ id, name: id, kind: "project" as const, score: sc });
    expect(classify([cand("a", 0.95), cand("b", 0.8)]).status).toBe("resolved");
  });
  it("ambiguous: candidate exactly at tLow (0.4) is included", () => {
    const cand = (id: string, sc: number) => ({ id, name: id, kind: "project" as const, score: sc });
    const r = classify([cand("a", 0.6), cand("b", 0.4)]);
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") expect(r.candidates.map((c) => c.id)).toContain("b");
  });
});

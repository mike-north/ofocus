import { describe, it, expect } from "vitest";
import { score } from "../../src/resolve/rank.js";

describe("score", () => {
  it("exact (normalized) match scores 1", () => {
    expect(score("Project Falcon", "Project Falcon")).toBe(1);
    expect(score("  project   falcon ", "Project Falcon")).toBe(1);
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
  it("does not false-positive on coincidental token overlap", () => {
    // 'mom'↔'mom' must not carry an unrelated multi-word match above the candidate floor.
    expect(score("call mom", "Tall Mom Jeans")).toBeLessThan(0.4);
    expect(score("fix bug", "Fox Bag")).toBeLessThan(0.4);
    expect(score("review", "Renew License")).toBeLessThan(0.4);
  });
  it("empty name does not throw / NaN", () => {
    expect(score("x", "")).toBe(0);
    expect(score("", "")).toBe(0);
  });
});

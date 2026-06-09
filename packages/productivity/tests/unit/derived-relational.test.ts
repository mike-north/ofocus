/**
 * Tests for the relationalFactsScript OmniScript that computes sequential-predecessor
 * and incomplete-children facts needed by the blockedReason enrichment (spec §5.5).
 *
 * @see docs/specs/2026-06-08-ofocus-derived-state-design.md §5.5
 */
import { describe, it, expect } from "vitest";
import { relationalFactsScript } from "../../src/derived/relational.js";

describe("relationalFactsScript", () => {
  it("is an OmniScript whose body inspects sequential predecessors and children", () => {
    expect(relationalFactsScript.kind).toBe("script");
    expect(relationalFactsScript.source).toContain("flattenedTasks");
    expect(relationalFactsScript.source).toContain("children");
  });

  it("source contains containingProject for sequential container inspection", () => {
    expect(relationalFactsScript.source).toContain("containingProject");
    expect(relationalFactsScript.source).toContain("sequential");
  });

  it("source inspects completed and dropped flags", () => {
    expect(relationalFactsScript.source).toContain("completed");
    expect(relationalFactsScript.source).toContain("dropped");
  });

  it("source includes taskIds parameter mapping", () => {
    expect(relationalFactsScript.source).toContain("taskIds");
  });
});

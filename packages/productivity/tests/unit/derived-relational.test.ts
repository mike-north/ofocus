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

  it("source uses foundSelf guard to avoid false positives for nested tasks", () => {
    // spec §5.5: only a direct top-level action of the project can have a
    // sequential predecessor; nested tasks (in action groups) are not in
    // project.task.children so foundSelf stays false — conservative no-predecessor.
    expect(relationalFactsScript.source).toContain("foundSelf");
  });

  it("source inspects completed and dropped flags", () => {
    expect(relationalFactsScript.source).toContain("completed");
    expect(relationalFactsScript.source).toContain("dropped");
  });

  it("source includes taskIds parameter mapping", () => {
    expect(relationalFactsScript.source).toContain("taskIds");
  });
});

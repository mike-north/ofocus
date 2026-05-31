import { describe, it, expect } from "vitest";
import {
  buildScanScript,
  buildFingerprintScript,
  parseScanResult,
} from "../../src/changes/scan.js";

describe("buildScanScript", () => {
  it("includes flattenedTasks and flattenedProjects for the default classes", () => {
    const script = buildScanScript(["tasks", "projects"]);
    expect(script).toContain("flattenedTasks");
    expect(script).toContain("flattenedProjects");
    expect(script).toContain("toISOString");
  });
  it("omits classes that are not requested", () => {
    const script = buildScanScript(["tasks"]);
    expect(script).not.toContain("flattenedTags");
  });
  it("maps project status to a string enum, not the raw Status object", () => {
    const script = buildScanScript(["projects"]);
    expect(script).toContain("projectStatusStr");
    expect(script).toContain("Project.Status.OnHold");
    expect(script).not.toContain('readField(o, "status")');
  });
});

describe("parseScanResult", () => {
  it("groups raw rows into a Snapshot keyed by id", () => {
    const raw = {
      tasks: [
        { id: "a", modified: "2026-05-30T01:00:00.000Z", name: "A", flagged: false },
      ],
      projects: [],
    };
    const snap = parseScanResult(raw, ["tasks", "projects"]);
    expect(snap.tasks!["a"]).toEqual({
      id: "a",
      modified: "2026-05-30T01:00:00.000Z",
      fields: expect.objectContaining({ name: "A", flagged: false }),
    });
    expect(snap.projects).toEqual({});
  });
});

describe("buildFingerprintScript", () => {
  it("returns counts and max-modified per class plus lastSyncDate", () => {
    const script = buildFingerprintScript(["tasks"]);
    expect(script).toContain("lastSyncDate");
    expect(script).toContain("flattenedTasks");
  });
});

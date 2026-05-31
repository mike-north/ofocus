import { describe, it, expect } from "vitest";
import { summarize } from "../../src/changes/semantic.js";

describe("summarize", () => {
  it("pipes the packet to the configured command on stdin and returns stdout", async () => {
    const res = await summarize({ hello: "world" }, "cat");
    expect(res.summary).toContain("hello");
    expect(res.note).toBeUndefined();
  });

  it("fails open with a note when no command is configured", async () => {
    const res = await summarize({ x: 1 }, undefined);
    expect(res.summary).toBeUndefined();
    expect(res.note).toMatch(/not configured/i);
  });

  it("fails open with a note when the command exits non-zero", async () => {
    const res = await summarize({ x: 1 }, "false");
    expect(res.summary).toBeUndefined();
    expect(res.note).toBeTruthy();
  });
});

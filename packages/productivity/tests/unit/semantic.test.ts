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

  it("does not throw on a broken stdin pipe (large packet to a non-reading command)", async () => {
    // Regression: `true` (and `false`) close their stdin read end immediately,
    // so writing the packet fails with EPIPE. That write error must be swallowed,
    // not surface as an unhandled exception that crashes the test run.
    const big = { blob: "x".repeat(200_000) };
    await expect(summarize(big, "true")).resolves.toEqual(
      expect.objectContaining({ note: expect.any(String) }),
    );
  });
});

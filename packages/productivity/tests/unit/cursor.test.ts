import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "../../src/changes/cursor.js";
import { computeFingerprint } from "../../src/changes/fingerprint.js";

const fp = () =>
  computeFingerprint(
    { tasks: { a: { id: "a", modified: "2026-05-30T01:00:00.000Z", fields: {} } } },
    "2026-01-01T00:00:00.000Z"
  );

describe("cursor", () => {
  it("round-trips a fingerprint", () => {
    const cursor = encodeCursor(fp());
    expect(decodeCursor(cursor)).toEqual(fp());
  });

  it("produces an opaque, URL-safe-ish string (no whitespace)", () => {
    expect(encodeCursor(fp())).not.toMatch(/\s/);
  });

  it("returns null for a malformed cursor instead of throwing", () => {
    expect(decodeCursor("not-base64-$$")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
});

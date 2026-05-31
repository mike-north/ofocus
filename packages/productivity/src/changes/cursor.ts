import type { Fingerprint } from "./types.js";

/** Encode a fingerprint as an opaque base64 cursor (the "ETag"). */
export function encodeCursor(fingerprint: Fingerprint): string {
  return Buffer.from(JSON.stringify(fingerprint), "utf8").toString("base64url");
}

/** Decode a cursor back into a fingerprint, or null if malformed. */
export function decodeCursor(cursor: string): Fingerprint | null {
  if (cursor.length === 0) return null;
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "classes" in parsed &&
      "lastSyncDate" in parsed
    ) {
      return parsed as Fingerprint;
    }
    return null;
  } catch {
    return null;
  }
}

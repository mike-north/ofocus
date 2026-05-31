import type {
  ClassFingerprint,
  Fingerprint,
  Snapshot,
  WatchedClass,
} from "./types.js";

/** Compute the cheap global fingerprint for a snapshot (spec §4.2). */
export function computeFingerprint(
  snapshot: Snapshot,
  lastSyncDate: string | null,
  dbMtime?: string | null,
): Fingerprint {
  const classes: Partial<Record<WatchedClass, ClassFingerprint>> = {};
  for (const [cls, objects] of Object.entries(snapshot) as [
    WatchedClass,
    Record<string, { modified: string }>,
  ][]) {
    let count = 0;
    let maxModified: string | null = null;
    for (const obj of Object.values(objects)) {
      count += 1;
      if (maxModified === null || obj.modified > maxModified) {
        maxModified = obj.modified;
      }
    }
    classes[cls] = { count, maxModified };
  }
  const fp: Fingerprint = { classes, lastSyncDate };
  if (dbMtime !== undefined) fp.dbMtime = dbMtime;
  return fp;
}

/** Structural equality of two fingerprints. */
export function fingerprintsEqual(a: Fingerprint, b: Fingerprint): boolean {
  if (a.lastSyncDate !== b.lastSyncDate) return false;
  if ((a.dbMtime ?? null) !== (b.dbMtime ?? null)) return false;
  const classKeys = new Set<string>([
    ...Object.keys(a.classes),
    ...Object.keys(b.classes),
  ]);
  for (const key of classKeys) {
    const ca = a.classes[key as WatchedClass];
    const cb = b.classes[key as WatchedClass];
    if (!ca || !cb) return false;
    if (ca.count !== cb.count || ca.maxModified !== cb.maxModified) return false;
  }
  return true;
}

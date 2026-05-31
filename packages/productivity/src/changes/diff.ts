import {
  type ChangeSet,
  type ChangedObject,
  type FieldDelta,
  type Snapshot,
  type WatchedClass,
  type WatchedObject,
  emptyChangeSet,
} from "./types.js";

/** Stable structural equality for watched field values (handles arrays/objects). */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Compute field-level deltas between two objects' watched fields. */
function computeDelta(
  prev: WatchedObject,
  next: WatchedObject
): Record<string, FieldDelta> | null {
  const delta: Record<string, FieldDelta> = {};
  const keys = new Set<string>([
    ...Object.keys(prev.fields),
    ...Object.keys(next.fields),
  ]);
  for (const key of keys) {
    if (!valuesEqual(prev.fields[key], next.fields[key])) {
      delta[key] = { from: prev.fields[key] ?? null, to: next.fields[key] ?? null };
    }
  }
  return Object.keys(delta).length > 0 ? delta : null;
}

/** Diff two snapshots into added / updated / removed (spec §6). */
export function diffSnapshots(prev: Snapshot, next: Snapshot): ChangeSet {
  const cs = emptyChangeSet();
  const classes = new Set<WatchedClass>([
    ...(Object.keys(prev) as WatchedClass[]),
    ...(Object.keys(next) as WatchedClass[]),
  ]);

  for (const cls of classes) {
    const prevObjs = prev[cls] ?? {};
    const nextObjs = next[cls] ?? {};

    for (const [id, nextObj] of Object.entries(nextObjs)) {
      const prevObj = prevObjs[id];
      if (!prevObj) {
        cs.added.push({ id, class: cls, object: nextObj.fields });
        continue;
      }
      const delta = computeDelta(prevObj, nextObj);
      if (delta) {
        const changed: ChangedObject = {
          id,
          class: cls,
          object: nextObj.fields,
          delta,
        };
        cs.updated.push(changed);
      }
    }

    for (const [id, prevObj] of Object.entries(prevObjs)) {
      if (!nextObjs[id]) {
        cs.removed.push({ id, class: cls, object: prevObj.fields });
      }
    }
  }

  return cs;
}

import type { CacheFile } from "./cache.js";
import { type ChangeSet, type ChangedObject, emptyChangeSet } from "./types.js";

function isEmpty(cs: ChangeSet): boolean {
  return cs.added.length === 0 && cs.updated.length === 0 && cs.removed.length === 0;
}

function indexById(list: ChangedObject[]): Map<string, ChangedObject> {
  const m = new Map<string, ChangedObject>();
  for (const c of list) m.set(`${c.class}:${c.id}`, c);
  return m;
}

/**
 * Merge two change sets so the union reflects the net effect, newer winning:
 * - added-then-removed cancels;
 * - removed-then-added becomes an add;
 * - updated-then-updated keeps the latest object/delta.
 */
export function mergeChangeSets(older: ChangeSet, newer: ChangeSet): ChangeSet {
  const added = indexById(older.added);
  const updated = indexById(older.updated);
  const removed = indexById(older.removed);

  for (const c of newer.added) {
    const key = `${c.class}:${c.id}`;
    if (removed.has(key)) removed.delete(key);
    else added.set(key, c);
  }
  for (const c of newer.updated) {
    const key = `${c.class}:${c.id}`;
    if (added.has(key)) {
      // An update on top of an add stays an add: drop the delta by omitting the
      // key entirely (under exactOptionalPropertyTypes, `delta: undefined` is a
      // type error — an optional field is either present-with-value or absent).
      const { delta: _delta, ...withoutDelta } = c;
      added.set(key, withoutDelta);
    } else {
      updated.set(key, c);
    }
  }
  for (const c of newer.removed) {
    const key = `${c.class}:${c.id}`;
    if (added.has(key)) added.delete(key);
    else {
      updated.delete(key);
      removed.set(key, c);
    }
  }

  return {
    added: [...added.values()],
    updated: [...updated.values()],
    removed: [...removed.values()],
  };
}

/** Bump generation and merge new changes into pending, only if non-empty. */
export function accumulatePending(cache: CacheFile, changes: ChangeSet): CacheFile {
  if (isEmpty(changes)) return cache;
  return {
    ...cache,
    generation: cache.generation + 1,
    pending: mergeChangeSets(cache.pending, changes),
  };
}

/** Clear pending and mark everything delivered (used by --fresh and --pending). */
export function clearPending(cache: CacheFile): CacheFile {
  return {
    ...cache,
    pending: emptyChangeSet(),
    deliveredGeneration: cache.generation,
  };
}

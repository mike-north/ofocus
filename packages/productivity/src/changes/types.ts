/** Object classes a watch can track. */
export type WatchedClass = "tasks" | "projects" | "tags" | "folders";

/** The fields whose changes produce deltas, per class (spec §7). */
export const WATCHED_FIELDS: Record<WatchedClass, readonly string[]> = {
  tasks: [
    "name",
    "note",
    "flagged",
    "completed",
    "dueDate",
    "deferDate",
    "completionDate",
    "projectId",
    "tags",
    "estimatedMinutes",
  ],
  projects: [
    "name",
    "note",
    "status",
    "folderId",
    "sequential",
    "remainingTaskCount",
  ],
  tags: ["name", "parentId"],
  folders: ["name", "parentId"],
} as const;

/** A single watched object reduced to its watched fields plus identity + modified. */
export interface WatchedObject {
  id: string;
  /** ISO 8601 modification timestamp. */
  modified: string;
  /** Watched field values (subset of the object, per WATCHED_FIELDS). */
  fields: Record<string, unknown>;
}

/** Per-class fingerprint component. */
export interface ClassFingerprint {
  count: number;
  /** ISO 8601 max `modified` across the class, or null when the class is empty. */
  maxModified: string | null;
}

/** Cheap global fingerprint used for the fast "nothing changed" check (spec §4.2). */
export interface Fingerprint {
  classes: Partial<Record<WatchedClass, ClassFingerprint>>;
  /** document.lastSyncDate folded in (spec §4.2). */
  lastSyncDate: string | null;
  /** Present only when the FDA accelerator is active (spec §4.4). */
  dbMtime?: string | null;
}

/** A snapshot maps object id → watched object, grouped by class. */
export type Snapshot = Partial<Record<WatchedClass, Record<string, WatchedObject>>>;

/** old→new for one field. */
export interface FieldDelta {
  from: unknown;
  to: unknown;
}

/** A changed object as surfaced to consumers (spec §6). */
export interface ChangedObject {
  id: string;
  class: WatchedClass;
  /** Full current (or last-known, for removed) watched representation. */
  object: Record<string, unknown>;
  /** Field-level deltas; present for updates. */
  delta?: Record<string, FieldDelta>;
}

/** The result of diffing two snapshots (spec §6). */
export interface ChangeSet {
  added: ChangedObject[];
  updated: ChangedObject[];
  removed: ChangedObject[];
}

/** An empty change set (helper for first-run / no-change cases). */
export function emptyChangeSet(): ChangeSet {
  return { added: [], updated: [], removed: [] };
}

import { runOmniJSWrapped } from "@ofocus/sdk";
import {
  type Fingerprint,
  type Snapshot,
  WATCHED_FIELDS,
  type WatchedClass,
} from "./types.js";

/** OmniJS global collection name per class. */
const COLLECTION: Record<WatchedClass, string> = {
  tasks: "flattenedTasks",
  projects: "flattenedProjects",
  tags: "flattenedTags",
  folders: "flattenedFolders",
};

const js = String.raw;

/**
 * Build the OmniJS body that reads watched objects. `project.modified` is
 * undefined on the root project, so projects read `o.task.modified`
 * (spec §2). Dates are emitted as ISO strings for lexical comparison.
 */
export function buildScanScript(classes: readonly WatchedClass[]): string {
  const blocks = classes.map((cls) => {
    const fields = WATCHED_FIELDS[cls];
    const modifiedExpr =
      cls === "projects" ? "(o.task ? o.task.modified : o.modified)" : "o.modified";
    const fieldExprs = fields.map((f) =>
      f === "status" && cls === "projects"
        ? `status: projectStatusStr(o)`
        : `${f}: readField(o, ${JSON.stringify(f)})`,
    );
    return js`
out.${cls} = ${COLLECTION[cls]}.map(function (o) {
  var m = ${modifiedExpr};
  return {
    id: o.id.primaryKey,
    modified: m ? m.toISOString() : null,
    ${fieldExprs.join(",\n    ")}
  };
});`;
  });

  return js`
function projectStatusStr(o) {
  try {
    if (o.status === Project.Status.OnHold) return "on-hold";
    if (o.status === Project.Status.Done) return "completed";
    if (o.status === Project.Status.Dropped) return "dropped";
    return "active";
  } catch (e) { return null; }
}
function readField(o, name) {
  try {
    var v = o[name];
    if (v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (v && v.id && v.id.primaryKey) return v.id.primaryKey;
    if (Array.isArray(v)) return v.map(function (e) { return e && e.name ? e.name : String(e); });
    return v;
  } catch (e) { return null; }
}
var out = {};
${blocks.join("\n")}
return JSON.stringify(out);`;
}

/** Build the cheap fingerprint-only OmniJS body (counts + max modified). */
export function buildFingerprintScript(classes: readonly WatchedClass[]): string {
  const blocks = classes.map((cls) => {
    const modifiedExpr =
      cls === "projects" ? "(o.task ? o.task.modified : o.modified)" : "o.modified";
    return js`
(function () {
  var coll = ${COLLECTION[cls]};
  var max = null;
  for (var i = 0; i < coll.length; i++) {
    var o = coll[i]; var m = ${modifiedExpr};
    if (m) { var iso = m.toISOString(); if (max === null || iso > max) max = iso; }
  }
  out.classes.${cls} = { count: coll.length, maxModified: max };
})();`;
  });
  return js`
var out = { classes: {}, lastSyncDate: null };
try { out.lastSyncDate = document.lastSyncDate ? document.lastSyncDate.toISOString() : null; } catch (e) {}
${blocks.join("\n")}
return JSON.stringify(out);`;
}

interface RawRow {
  id: string;
  modified: string | null;
  [field: string]: unknown;
}

/** Convert raw scan rows into a Snapshot. */
export function parseScanResult(
  raw: Record<string, RawRow[]>,
  classes: readonly WatchedClass[],
): Snapshot {
  const snap: Snapshot = {};
  for (const cls of classes) {
    const rows = raw[cls] ?? [];
    const objects: Record<
      string,
      { id: string; modified: string; fields: Record<string, unknown> }
    > = {};
    for (const row of rows) {
      const { id, modified, ...fields } = row;
      objects[id] = { id, modified: modified ?? "", fields };
    }
    snap[cls] = objects;
  }
  return snap;
}

/** Run the full scan against OmniFocus and return a Snapshot. */
export async function scanWatched(
  classes: readonly WatchedClass[],
): Promise<Snapshot> {
  const result = await runOmniJSWrapped<Record<string, RawRow[]>>(
    buildScanScript(classes),
  );
  if (!result.success || result.data === undefined) {
    throw new Error(result.error?.message ?? "OmniFocus scan failed");
  }
  return parseScanResult(result.data, classes);
}

/** Run the cheap fingerprint scan against OmniFocus. */
export async function scanFingerprint(
  classes: readonly WatchedClass[],
): Promise<Fingerprint> {
  const result = await runOmniJSWrapped<Fingerprint>(
    buildFingerprintScript(classes),
  );
  if (!result.success || result.data === undefined) {
    throw new Error(result.error?.message ?? "OmniFocus fingerprint scan failed");
  }
  return result.data;
}

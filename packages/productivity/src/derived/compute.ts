import type { BlockedReason, EffectiveStatus } from "./types.js";

/** @public */
export function effectiveStatus(f: {
  taskStatus: string;
  effectivelyCompleted: boolean;
  effectivelyDropped: boolean;
}): EffectiveStatus {
  if (f.effectivelyCompleted) return "completed";
  if (f.effectivelyDropped) return "dropped";
  if (f.taskStatus === "completed") return "completed";
  if (f.taskStatus === "dropped") return "dropped";
  return f.taskStatus === "blocked" ? "blocked" : "available";
}

/** Precedence: most-binding first (spec §5.3). */
const PRECEDENCE: readonly BlockedReason[] = [
  "project-dropped",
  "project-done",
  "project-on-hold",
  "project-deferred",
  "own-defer",
  "sequential-predecessor",
  "incomplete-children",
];

/** @public */
export function blockedReason(f: {
  projectStatus: "active" | "on-hold" | "completed" | "dropped" | null;
  projectDeferInFuture: boolean;
  ownDeferInFuture: boolean;
  hasIncompleteSequentialPredecessor: boolean;
  hasIncompleteChildren: boolean;
}): BlockedReason[] {
  const present = new Set<BlockedReason>();
  if (f.projectStatus === "dropped") present.add("project-dropped");
  if (f.projectStatus === "completed") present.add("project-done");
  if (f.projectStatus === "on-hold") present.add("project-on-hold");
  if (f.projectDeferInFuture) present.add("project-deferred");
  if (f.ownDeferInFuture) present.add("own-defer");
  if (f.hasIncompleteSequentialPredecessor)
    present.add("sequential-predecessor");
  if (f.hasIncompleteChildren) present.add("incomplete-children");
  return PRECEDENCE.filter((r) => present.has(r));
}

/** @public */
export function projectHealth(f: {
  status: string;
  remainingTaskCount: number;
  availableTaskCount: number;
}): { stalled: boolean; empty: boolean } {
  if (f.status !== "active") return { stalled: false, empty: false };
  if (f.remainingTaskCount === 0) return { stalled: false, empty: true };
  return { stalled: f.availableTaskCount === 0, empty: false };
}

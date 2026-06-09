import type { OFTask, OFProject } from "@ofocus/sdk";

/** @public */
export type EffectiveStatus = "available" | "blocked" | "completed" | "dropped";

/** @public */
export type BlockedReason =
  | "project-dropped"
  | "project-done"
  | "project-on-hold"
  | "project-deferred"
  | "own-defer"
  | "sequential-predecessor"
  | "incomplete-children";

/** @public */
export interface EnrichedTask extends OFTask {
  taskStatus: string;
  effectiveStatus: EffectiveStatus;
  /** Ordered by binding precedence; `[0]` is the binding constraint. Empty unless blocked. */
  blockedReason: readonly BlockedReason[];
  isNextAction: boolean;
}

/** @public */
export interface EnrichedProject extends OFProject {
  availableTaskCount: number;
  stalled: boolean;
  empty: boolean;
}

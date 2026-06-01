/** Entity kinds resolvable by `ofocus resolve`. */
export type ResolveKind = "project" | "task" | "tag" | "folder";

/** A ranked candidate. `context` is minimal disambiguating detail (folder/project/parent). */
export interface ResolveCandidate {
  id: string;
  name: string;
  kind: ResolveKind;
  context?: string;
  score: number;
}

/** A resolved temporal anchor carries the next occurrence (A2). */
export interface ResolvedAnchor extends ResolveCandidate {
  nextOccurrence: string | null;
  occurrences?: string[];
}

/** The disambiguation contract. `T` is the candidate shape. */
export type DisambiguationResult<T extends { score: number }> =
  | { status: "resolved"; resolved: T; confidence: "high" }
  | { status: "ambiguous"; candidates: T[] }
  | { status: "none"; suggestions: T[]; note?: string };

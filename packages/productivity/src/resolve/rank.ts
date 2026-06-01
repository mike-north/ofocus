import type { DisambiguationResult } from "./types.js";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokens(s: string): string[] {
  return s.length === 0 ? [] : s.split(" ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}

/** Fuzzy match score in [0,1], deterministic, case-insensitive (spec §3.1). */
export function score(query: string, name: string): number {
  const q = norm(query),
    n = norm(name);
  if (q.length === 0) return 0;
  if (q === n) return 1;
  const signals: number[] = [];
  if (n.startsWith(q)) signals.push(0.95);
  else if (n.includes(q)) signals.push(0.85);
  const qts = tokens(q),
    nts = tokens(n);
  if (qts.length > 0) {
    const used = new Array<boolean>(nts.length).fill(false);
    let matched = 0;
    for (const qt of qts) {
      const idx = nts.findIndex((nt, i) => !used[i] && nt.startsWith(qt));
      if (idx >= 0) {
        used[idx] = true;
        matched++;
      }
    }
    if (matched === qts.length) signals.push(0.8);
  }
  if (!q.includes(" ") && q.length >= 2 && nts.length >= q.length) {
    const initials = nts
      .slice(0, q.length)
      .map((t) => t[0] ?? "")
      .join("");
    if (initials === q) signals.push(0.7);
  }
  // Edit-distance typo tolerance: require EVERY query token to closely match some
  // name token (≥0.8 ⇒ at most a small typo), so coincidental single-token overlap
  // (e.g. "call mom" vs "Tall Mom Jeans") doesn't inflate the score.
  if (qts.length > 0 && nts.length > 0) {
    let total = 0;
    let allStrong = true;
    for (const qt of qts) {
      let best = 0;
      for (const nt of nts) {
        const d = levenshtein(qt, nt);
        const sim = 1 - d / Math.max(qt.length, nt.length);
        if (sim > best) best = sim;
      }
      if (best < 0.8) { allStrong = false; break; }
      total += best;
    }
    if (allStrong) signals.push((total / qts.length) * 0.85);
  }
  const best = signals.length > 0 ? Math.max(...signals) : 0;
  return Math.min(1, Math.max(0, best));
}

export interface RankThresholds {
  tHigh: number;
  margin: number;
  tLow: number;
  limit: number;
}

export const RANK_THRESHOLDS: RankThresholds = { tHigh: 0.85, margin: 0.15, tLow: 0.4, limit: 5 };

export interface RankOpts {
  limit?: number;
  floor?: number;
}

export function rankCandidates<T extends { name: string }>(
  query: string,
  items: readonly T[],
  opts: RankOpts = {},
): (T & { score: number })[] {
  const floor = opts.floor ?? 0.2;
  const limit = opts.limit ?? RANK_THRESHOLDS.limit;
  return items
    .map((it) => ({ ...it, score: Math.round(score(query, it.name) * 100) / 100 }))
    .filter((c) => c.score >= floor)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function classify<T extends { score: number }>(
  scored: readonly T[],
  t: RankThresholds = RANK_THRESHOLDS,
): DisambiguationResult<T> {
  const top = scored[0];
  if (top === undefined) return { status: "none", suggestions: [] };
  const second = scored[1];
  const clearWinner =
    second === undefined ||
    Math.round((top.score - second.score) * 100) >= Math.round(t.margin * 100);
  if (top.score >= t.tHigh && clearWinner) return { status: "resolved", resolved: top, confidence: "high" };
  const candidates = scored.filter((c) => c.score >= t.tLow);
  if (candidates.length > 0) return { status: "ambiguous", candidates };
  return { status: "none", suggestions: scored.slice(0, 3) };
}

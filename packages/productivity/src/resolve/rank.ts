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
  // Edit-distance similarity is computed per-token (best matching pair) so a
  // typo inside a single word of a multi-word name (e.g. "falcn" vs
  // "project falcon") still scores well; whole-string Levenshtein would dilute
  // the signal across the unmatched words. Reduces to whole-string similarity
  // when both query and name are single tokens.
  const qSims = qts.length > 0 ? qts : [q];
  const nSims = nts.length > 0 ? nts : [n];
  let bestSim = 0;
  for (const qt of qSims) {
    for (const nt of nSims) {
      const dist = levenshtein(qt, nt);
      const sim = 1 - dist / Math.max(qt.length, nt.length);
      if (sim > bestSim) bestSim = sim;
    }
  }
  if (bestSim > 0.6) signals.push(bestSim * 0.9);
  const best = signals.length > 0 ? Math.max(...signals) : 0;
  return Math.min(1, Math.max(0, best));
}

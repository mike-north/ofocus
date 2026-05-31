import { z } from "zod";
import { type CliOutput, defineCommand, success } from "@ofocus/sdk";
import { type CacheFile, readCache, resolveCachePath, writeCache } from "./cache.js";
import { encodeCursor } from "./cursor.js";
import { diffSnapshots } from "./diff.js";
import { fingerprintsEqual } from "./fingerprint.js";
import { accumulatePending, clearPending, mergeChangeSets } from "./generation.js";
import { scanFingerprint, scanWatched } from "./scan.js";
import { summarize as semanticSummarize } from "./semantic.js";
import {
  type ChangeSet,
  type Fingerprint,
  type Snapshot,
  type WatchedClass,
  emptyChangeSet,
} from "./types.js";

/** Shape returned by the `changes` command (spec §6). */
export interface ChangesOutput {
  watch: string;
  generation: number;
  cursor: string;
  notModified: boolean;
  baselined: boolean;
  stale: boolean;
  summary: { added: number; updated: number; removed: number };
  changes: ChangeSet;
  semanticSummary?: string;
  summaryNote?: string;
}

const DEFAULT_CLASSES: WatchedClass[] = ["tasks", "projects"];

/** Dependencies injected for testing; the descriptor passes real implementations. */
export interface ChangesDeps {
  scanWatched: (classes: readonly WatchedClass[]) => Promise<Snapshot>;
  scanFingerprint: (classes: readonly WatchedClass[]) => Promise<Fingerprint>;
  stateDir?: string;
  spawnBackgroundRefresh?: (watch: string, stateDir?: string) => void;
  now?: string;
  /** Injected summarizer; the descriptor binds OFOCUS_SUMMARY_CMD. Returns {summary?|note?}. */
  summarize?: (packet: unknown) => Promise<{ summary?: string; note?: string }>;
}

interface ChangesInput {
  // Fields are `| undefined` to match the `z.infer` of the descriptor schema
  // under `exactOptionalPropertyTypes` (optional zod fields infer as
  // `T | undefined`, which is not assignable to a bare `T?`).
  watch?: string | undefined;
  fresh?: boolean | undefined;
  pending?: boolean | undefined;
  generationSince?: number | undefined;
  reset?: boolean | undefined;
  refreshInline?: boolean | undefined;
  semantic?: boolean | undefined;
}

function freshCache(name: string, classes: WatchedClass[], now: string): CacheFile {
  return {
    version: 1,
    name,
    scope: {},
    classes,
    fingerprint: { classes: {}, lastSyncDate: null },
    snapshot: {},
    generation: 0,
    deliveredGeneration: 0,
    pending: emptyChangeSet(),
    semanticByGeneration: {},
    refreshLock: null,
    updatedAt: now,
  };
}

function summarize(cs: ChangeSet): { added: number; updated: number; removed: number } {
  return { added: cs.added.length, updated: cs.updated.length, removed: cs.removed.length };
}

function changeSetEmpty(cs: ChangeSet): boolean {
  return cs.added.length === 0 && cs.updated.length === 0 && cs.removed.length === 0;
}

function toOutput(
  cache: CacheFile,
  changes: ChangeSet,
  flags: { notModified: boolean; baselined: boolean; stale: boolean },
): ChangesOutput {
  return {
    watch: cache.name,
    generation: cache.generation,
    cursor: encodeCursor(cache.fingerprint),
    notModified: flags.notModified,
    baselined: flags.baselined,
    stale: flags.stale,
    summary: summarize(changes),
    changes,
  };
}

async function attachSummary(
  output: ChangesOutput,
  input: ChangesInput,
  deps: ChangesDeps,
): Promise<ChangesOutput> {
  if (input.semantic !== true || deps.summarize === undefined) return output;
  const res = await deps.summarize({ summary: output.summary, changes: output.changes });
  if (res.summary !== undefined) output.semanticSummary = res.summary;
  if (res.note !== undefined) output.summaryNote = res.note;
  return output;
}

/**
 * Core handler. `deps` is injected in tests; the descriptor passes real scanners.
 * Read modes (spec §3): --pending (hook drain), --reset/first-run (baseline),
 * --fresh (live scan, drains pending), --refresh-inline (background accumulate),
 * default (instant cached read, triggers background refresh).
 */
export async function runChanges(
  input: ChangesInput,
  deps: ChangesDeps,
): Promise<CliOutput<ChangesOutput>> {
  const name = input.watch ?? "default";
  const now = deps.now ?? "1970-01-01T00:00:00.000Z";
  const path = resolveCachePath(name, deps.stateDir);
  const cache = readCache(path) ?? freshCache(name, DEFAULT_CLASSES, now);
  const isFirstRun =
    cache.generation === 0 && Object.keys(cache.snapshot).length === 0;

  // --pending: notification-hook path. Return accumulated deltas if any, advance delivered.
  if (input.pending === true) {
    const sinceGen = input.generationSince ?? cache.deliveredGeneration;
    const hasNew = cache.generation > sinceGen;
    const out = toOutput(cache, hasNew ? cache.pending : emptyChangeSet(), {
      notModified: !hasNew,
      baselined: false,
      stale: false,
    });
    // Only drain/advance when we actually delivered new deltas. Clearing when
    // `--generation-since` is ahead of the current generation would silently
    // discard pending deltas the caller never saw.
    if (hasNew) writeCache(path, clearPending(cache));
    return success(await attachSummary(out, input, deps));
  }

  // --reset OR first run: baseline to current; no diff dump (spec §6).
  if (input.reset === true || isFirstRun) {
    const fingerprint = await deps.scanFingerprint(cache.classes);
    const snapshot = await deps.scanWatched(cache.classes);
    const based: CacheFile = {
      ...freshCache(name, cache.classes, now),
      snapshot,
      fingerprint,
    };
    writeCache(path, based);
    return success(
      toOutput(based, emptyChangeSet(), {
        notModified: false,
        baselined: true,
        stale: false,
      }),
    );
  }

  // --fresh OR background refresh-inline: live scan with fingerprint fast path.
  if (input.fresh === true || input.refreshInline === true) {
    const fingerprint = await deps.scanFingerprint(cache.classes);
    const fpEqual = fingerprintsEqual(fingerprint, cache.fingerprint);
    let snapshot: Snapshot = cache.snapshot;
    let diff: ChangeSet = emptyChangeSet();
    if (!fpEqual) {
      snapshot = await deps.scanWatched(cache.classes);
      diff = diffSnapshots(cache.snapshot, snapshot);
    }

    if (input.refreshInline === true) {
      // Background: advance snapshot, accumulate diff into pending (bumps generation if non-empty).
      const advanced: CacheFile = { ...cache, snapshot, fingerprint, updatedAt: now };
      const next = accumulatePending(advanced, diff);
      writeCache(path, next);
      return success(
        toOutput(next, emptyChangeSet(), {
          notModified: fpEqual,
          baselined: false,
          stale: false,
        }),
      );
    }

    // --fresh: drain pending ∪ this diff, advance snapshot, clear pending.
    const all = mergeChangeSets(cache.pending, diff);
    const generation = changeSetEmpty(diff) ? cache.generation : cache.generation + 1;
    const advanced: CacheFile = {
      ...cache,
      snapshot,
      fingerprint,
      generation,
      updatedAt: now,
    };
    const next = clearPending(advanced);
    writeCache(path, next);
    return success(
      await attachSummary(
        toOutput(next, all, {
          notModified: changeSetEmpty(all),
          baselined: false,
          stale: false,
        }),
        input,
        deps,
      ),
    );
  }

  // Default cached read: instant, eventually consistent; trigger background refresh.
  if (deps.spawnBackgroundRefresh !== undefined) {
    deps.spawnBackgroundRefresh(name, deps.stateDir);
  }
  return success(
    toOutput(cache, cache.pending, {
      notModified: false,
      baselined: false,
      stale: true,
    }),
  );
}

/** The descriptor — surfaced through CLI + MCP + docs via the registry union (later tasks). */
export const changesDescriptor = defineCommand({
  name: "changes",
  cliName: "changes",
  mcpName: "changes",
  description:
    "Detect what changed in OmniFocus since the last look. Cache-first and instant by default; --fresh forces a live scan; --pending returns accumulated deltas for a notification hook.",
  inputSchema: z.object({
    watch: z.string().optional().describe("Named watch (default: 'default')"),
    fresh: z.boolean().optional().describe("Force a synchronous live scan"),
    pending: z
      .boolean()
      .optional()
      .describe("Return accumulated pending deltas (notification-hook path)"),
    generationSince: z
      .number()
      .optional()
      .describe("With --pending: only deltas newer than this generation"),
    reset: z.boolean().optional().describe("Re-baseline the watch to current state"),
    refreshInline: z
      .boolean()
      .optional()
      .describe("Internal: run the background scan + pending accumulation inline"),
    semantic: z
      .boolean()
      .optional()
      .describe("Attach a fast-model natural-language summary (opt-in; uses OFOCUS_SUMMARY_CMD)"),
  }),
  handler: async (parsed): Promise<CliOutput<ChangesOutput>> =>
    runChanges(parsed, {
      scanWatched,
      scanFingerprint,
      summarize: (packet) => semanticSummarize(packet, process.env["OFOCUS_SUMMARY_CMD"]),
      now: new Date().toISOString(),
    }),
});

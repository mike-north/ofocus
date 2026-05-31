# `ofocus changes` Change-Detection Primitive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `ofocus changes` command — cache-first change detection with field-level diffs, a fingerprint fast path, three read modes (`cached` / `--fresh` / `--pending`), debounced background refresh, optional Full Disk Access accelerator, and an opt-in `--semantic` summary — establishing the new `@ofocus/productivity` package.

**Architecture:** A new L2 package `@ofocus/productivity` (depends on `@ofocus/sdk`) holds a pure, unit-testable diff/snapshot/fingerprint/cursor engine plus cache persistence and the `changes` command descriptor (defined with `defineCommand` from the SDK). Because `productivity` depends on `sdk`, the SDK's `allCommandDescriptors` cannot import it; instead the CLI, MCP server, and docs generator compose the **union** of the core and productivity descriptor arrays. OmniFocus access reuses the SDK's `runOmniJSWrapped`. Process glue (background-refresh spawn, `--semantic` command) uses Node built-ins only, so `@ofocus/sdk` stays dependency-light.

**Tech Stack:** TypeScript (NodeNext, strict), Zod schemas, Commander (CLI), `@modelcontextprotocol/sdk` (MCP), vitest (tests), pnpm workspaces + tsc project references, TOON output.

**Spec:** [`docs/superpowers/specs/2026-05-30-ofocus-changes-primitive-design.md`](../specs/2026-05-30-ofocus-changes-primitive-design.md)
**Principles:** [`docs/superpowers/specs/2026-05-30-ofocus-agent-principles.md`](../specs/2026-05-30-ofocus-agent-principles.md)

**Conventions for every commit in this plan:**
- Author: `--author="Mike North <michael.l.north@gmail.com>"` (this repo's remote is `github.com/mnorth/ofocus`, a personal repo). No AI attribution trailers.
- Run from the worktree root: `/Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16`.
- Tests use **vitest** (the repo standard), not jest.

---

## File Structure

**New package `packages/productivity/`:**
- `package.json` — `@ofocus/productivity`; deps `@ofocus/sdk`, `zod`.
- `tsconfig.json` — project ref extending `tsconfig.base.json`, references `../sdk`.
- `vitest.config.ts` — unit tests under `tests/unit`.
- `src/index.ts` — public exports + `productivityDescriptors` array.
- `src/changes/types.ts` — `WatchedClass`, `WatchedObject`, `Snapshot`, `Fingerprint`, `FieldDelta`, `ChangeSet`, `WATCHED_FIELDS`.
- `src/changes/fingerprint.ts` — `computeFingerprint`, `fingerprintsEqual`.
- `src/changes/diff.ts` — `diffSnapshots`.
- `src/changes/cursor.ts` — `encodeCursor`, `decodeCursor`.
- `src/changes/cache.ts` — `CacheFile` type, `resolveCachePath`, `readCache`, `writeCache`.
- `src/changes/generation.ts` — `accumulatePending`, `clearPending`, `mergeChangeSets`.
- `src/changes/scan.ts` — `buildScanScript`, `buildFingerprintScript`, `parseScanResult`, `scanWatched`, `scanFingerprint`.
- `src/changes/refresh.ts` — `runRefresh` (the scan→diff→cache core shared by `--fresh` and background), `spawnBackgroundRefresh`.
- `src/changes/fda.ts` — `resolveDbPackagePath`, `readDbMtime`.
- `src/changes/semantic.ts` — `summarize` (stdin-piped user command, fail-open).
- `src/changes/command.ts` — `changesDescriptor` (defineCommand) + `runChanges` handler.
- `tests/unit/*.test.ts` — one per engine module.
- `tests/uat/changes.uat.test.ts` — CLI subprocess UAT.

**Modified:**
- `pnpm-workspace.yaml` — already globs `packages/*`; no change needed (verify).
- `tsconfig.json` (root) — add `{ "path": "packages/productivity" }`.
- `packages/cli/package.json` — add `@ofocus/productivity` dep.
- `packages/cli/src/cli.ts` — register the `changes` command.
- `packages/cli/src/commands/list-commands.ts` — include productivity descriptors.
- `packages/mcp/package.json` — add `@ofocus/productivity` dep.
- `packages/mcp/src/tools/index.ts` — call `registerProductivityTools`.
- `packages/mcp/src/tools/productivity.ts` — **new**, `registerProductivityTools`.
- `scripts/generate-agent-docs.ts` — merge productivity descriptors into the doc surface.
- `packages/ofocus/src/index.ts` — re-export `@ofocus/productivity`.

---

## Phase 0 — Scaffold `@ofocus/productivity`

### Task 1: Create the package and wire it into the build

**Files:**
- Create: `packages/productivity/package.json`
- Create: `packages/productivity/tsconfig.json`
- Create: `packages/productivity/vitest.config.ts`
- Create: `packages/productivity/src/index.ts`
- Modify: `tsconfig.json` (root)
- Modify: `packages/ofocus/src/index.ts`

- [ ] **Step 1: Create `packages/productivity/package.json`**

```json
{
  "name": "@ofocus/productivity",
  "version": "0.0.0",
  "description": "OmniFocus productivity niceties (Layer 2) built on @ofocus/sdk",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:watch": "vitest"
  },
  "keywords": ["omnifocus", "productivity", "omnijs"],
  "author": "",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/mnorth/ofocus.git",
    "directory": "packages/productivity"
  },
  "publishConfig": { "access": "public" },
  "engines": { "node": ">=20" },
  "dependencies": {
    "@ofocus/sdk": "workspace:*",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Create `packages/productivity/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "references": [{ "path": "../sdk" }],
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `packages/productivity/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Create `packages/productivity/src/index.ts` (placeholder)**

```typescript
/**
 * @ofocus/productivity — Layer 2 productivity niceties built on @ofocus/sdk.
 *
 * @packageDocumentation
 */

import type { ResolvedCommandDescriptor } from "@ofocus/sdk";

/**
 * Every command descriptor contributed by the productivity package.
 * The CLI, MCP server, and docs generator compose this with the SDK's
 * `allCommandDescriptors` (the SDK cannot import these — productivity
 * depends on the SDK, not the other way around).
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- descriptors are heterogeneous; see SDK all-descriptors.ts
export const productivityDescriptors: ReadonlyArray<
  ResolvedCommandDescriptor<any, any, any>
> = [];
```

- [ ] **Step 5: Add the project reference to root `tsconfig.json`**

Modify `tsconfig.json` so `references` reads:

```json
{
  "files": [],
  "references": [
    { "path": "packages/sdk" },
    { "path": "packages/productivity" },
    { "path": "packages/cli" },
    { "path": "packages/ofocus" }
  ]
}
```

- [ ] **Step 6: Re-export from the umbrella `packages/ofocus/src/index.ts`**

Append (match the existing re-export style in that file):

```typescript
// Layer 2 productivity niceties
export * from "@ofocus/productivity";
```

Also add `"@ofocus/productivity": "workspace:*"` to `packages/ofocus/package.json` `dependencies`.

- [ ] **Step 7: Install and build**

Run: `pnpm install`
Then: `pnpm build:tsc 2>/dev/null || pnpm -w exec tsc --build`
Expected: build succeeds; `packages/productivity/dist/index.js` exists.

- [ ] **Step 8: Commit**

```bash
git add packages/productivity tsconfig.json packages/ofocus pnpm-lock.yaml
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): scaffold @ofocus/productivity package (L2)"
```

---

## Phase 1 — Pure engine (no OmniFocus, fully unit-testable)

### Task 2: Engine types and watched-field sets

**Files:**
- Create: `packages/productivity/src/changes/types.ts`
- Test: (covered by later tasks that import these types)

- [ ] **Step 1: Write `packages/productivity/src/changes/types.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @ofocus/productivity exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/productivity/src/changes/types.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): change-detection engine types"
```

### Task 3: Fingerprint computation

**Files:**
- Create: `packages/productivity/src/changes/fingerprint.ts`
- Test: `packages/productivity/tests/unit/fingerprint.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { computeFingerprint, fingerprintsEqual } from "../../src/changes/fingerprint.js";
import type { Snapshot } from "../../src/changes/types.js";

const snap = (): Snapshot => ({
  tasks: {
    a: { id: "a", modified: "2026-05-30T01:00:00.000Z", fields: { name: "A" } },
    b: { id: "b", modified: "2026-05-30T02:00:00.000Z", fields: { name: "B" } },
  },
  projects: {
    p: { id: "p", modified: "2026-05-29T00:00:00.000Z", fields: { name: "P" } },
  },
});

describe("computeFingerprint", () => {
  it("counts objects and picks max modified per class", () => {
    const fp = computeFingerprint(snap(), null);
    expect(fp.classes.tasks).toEqual({ count: 2, maxModified: "2026-05-30T02:00:00.000Z" });
    expect(fp.classes.projects).toEqual({ count: 1, maxModified: "2026-05-29T00:00:00.000Z" });
    expect(fp.lastSyncDate).toBeNull();
  });

  it("reports null maxModified for an empty class", () => {
    const fp = computeFingerprint({ tasks: {} }, null);
    expect(fp.classes.tasks).toEqual({ count: 0, maxModified: null });
  });
});

describe("fingerprintsEqual", () => {
  it("is true for identical fingerprints", () => {
    expect(fingerprintsEqual(computeFingerprint(snap(), "2026-01-01T00:00:00.000Z"),
                             computeFingerprint(snap(), "2026-01-01T00:00:00.000Z"))).toBe(true);
  });
  it("detects an added object (count change)", () => {
    const more = snap();
    more.tasks!["c"] = { id: "c", modified: "2026-05-30T03:00:00.000Z", fields: { name: "C" } };
    expect(fingerprintsEqual(computeFingerprint(snap(), null), computeFingerprint(more, null))).toBe(false);
  });
  it("detects an edit (maxModified change)", () => {
    const edited = snap();
    edited.tasks!["b"]!.modified = "2026-05-30T09:00:00.000Z";
    expect(fingerprintsEqual(computeFingerprint(snap(), null), computeFingerprint(edited, null))).toBe(false);
  });
  it("detects a sync (lastSyncDate change)", () => {
    expect(fingerprintsEqual(computeFingerprint(snap(), "2026-01-01T00:00:00.000Z"),
                             computeFingerprint(snap(), "2026-02-01T00:00:00.000Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/fingerprint.test.ts`
Expected: FAIL — cannot resolve `../../src/changes/fingerprint.js`.

- [ ] **Step 3: Write `packages/productivity/src/changes/fingerprint.ts`**

```typescript
import type {
  ClassFingerprint,
  Fingerprint,
  Snapshot,
  WatchedClass,
} from "./types.js";

/** Compute the cheap global fingerprint for a snapshot (spec §4.2). */
export function computeFingerprint(
  snapshot: Snapshot,
  lastSyncDate: string | null,
  dbMtime?: string | null
): Fingerprint {
  const classes: Partial<Record<WatchedClass, ClassFingerprint>> = {};
  for (const [cls, objects] of Object.entries(snapshot) as [
    WatchedClass,
    Record<string, { modified: string }>,
  ][]) {
    let count = 0;
    let maxModified: string | null = null;
    for (const obj of Object.values(objects)) {
      count += 1;
      if (maxModified === null || obj.modified > maxModified) {
        maxModified = obj.modified;
      }
    }
    classes[cls] = { count, maxModified };
  }
  const fp: Fingerprint = { classes, lastSyncDate };
  if (dbMtime !== undefined) fp.dbMtime = dbMtime;
  return fp;
}

/** Structural equality of two fingerprints. */
export function fingerprintsEqual(a: Fingerprint, b: Fingerprint): boolean {
  if (a.lastSyncDate !== b.lastSyncDate) return false;
  if ((a.dbMtime ?? null) !== (b.dbMtime ?? null)) return false;
  const classKeys = new Set<string>([
    ...Object.keys(a.classes),
    ...Object.keys(b.classes),
  ]);
  for (const key of classKeys) {
    const ca = a.classes[key as WatchedClass];
    const cb = b.classes[key as WatchedClass];
    if (!ca || !cb) return false;
    if (ca.count !== cb.count || ca.maxModified !== cb.maxModified) return false;
  }
  return true;
}
```

Note: ISO 8601 UTC strings (`...Z`) compare correctly with lexical `>`; the scan (Task 8) always emits `toISOString()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/fingerprint.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/changes/fingerprint.ts packages/productivity/tests/unit/fingerprint.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): fingerprint fast-path computation"
```

### Task 4: Snapshot diff engine

**Files:**
- Create: `packages/productivity/src/changes/diff.ts`
- Test: `packages/productivity/tests/unit/diff.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { diffSnapshots } from "../../src/changes/diff.js";
import type { Snapshot, WatchedObject } from "../../src/changes/types.js";

const obj = (id: string, fields: Record<string, unknown>, modified = "2026-05-30T01:00:00.000Z"): WatchedObject =>
  ({ id, modified, fields });

describe("diffSnapshots", () => {
  it("reports an added object with its full representation", () => {
    const prev: Snapshot = { tasks: {} };
    const next: Snapshot = { tasks: { a: obj("a", { name: "A", flagged: false }) } };
    const cs = diffSnapshots(prev, next);
    expect(cs.added).toHaveLength(1);
    expect(cs.added[0]).toMatchObject({ id: "a", class: "tasks", object: { name: "A", flagged: false } });
    expect(cs.added[0]!.delta).toBeUndefined();
    expect(cs.updated).toHaveLength(0);
    expect(cs.removed).toHaveLength(0);
  });

  it("reports a removed object with its last-known representation", () => {
    const prev: Snapshot = { tasks: { a: obj("a", { name: "A" }) } };
    const next: Snapshot = { tasks: {} };
    const cs = diffSnapshots(prev, next);
    expect(cs.removed).toHaveLength(1);
    expect(cs.removed[0]).toMatchObject({ id: "a", class: "tasks", object: { name: "A" } });
  });

  it("reports field-level deltas for an updated object", () => {
    const prev: Snapshot = { tasks: { a: obj("a", { name: "A", flagged: false, dueDate: "2026-06-02" }) } };
    const next: Snapshot = { tasks: { a: obj("a", { name: "A", flagged: true, dueDate: "2026-05-30" }, "2026-05-30T09:00:00.000Z") } };
    const cs = diffSnapshots(prev, next);
    expect(cs.updated).toHaveLength(1);
    expect(cs.updated[0]!.delta).toEqual({
      flagged: { from: false, to: true },
      dueDate: { from: "2026-06-02", to: "2026-05-30" },
    });
    expect(cs.updated[0]!.object).toEqual({ name: "A", flagged: true, dueDate: "2026-05-30" });
  });

  it("does NOT report an update when only modified changed but watched fields did not", () => {
    const prev: Snapshot = { tasks: { a: obj("a", { name: "A" }, "2026-05-30T01:00:00.000Z") } };
    const next: Snapshot = { tasks: { a: obj("a", { name: "A" }, "2026-05-30T09:00:00.000Z") } };
    expect(diffSnapshots(prev, next).updated).toHaveLength(0);
  });

  it("compares array fields by value (tags)", () => {
    const prev: Snapshot = { tasks: { a: obj("a", { tags: ["home"] }) } };
    const next: Snapshot = { tasks: { a: obj("a", { tags: ["home", "urgent"] }) } };
    const cs = diffSnapshots(prev, next);
    expect(cs.updated[0]!.delta).toEqual({ tags: { from: ["home"], to: ["home", "urgent"] } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/diff.test.ts`
Expected: FAIL — cannot resolve `diff.js`.

- [ ] **Step 3: Write `packages/productivity/src/changes/diff.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/diff.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/changes/diff.ts packages/productivity/tests/unit/diff.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): snapshot diff engine with field-level deltas"
```

### Task 5: Cursor encode/decode

**Files:**
- Create: `packages/productivity/src/changes/cursor.ts`
- Test: `packages/productivity/tests/unit/cursor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "../../src/changes/cursor.js";
import { computeFingerprint } from "../../src/changes/fingerprint.js";

const fp = () =>
  computeFingerprint(
    { tasks: { a: { id: "a", modified: "2026-05-30T01:00:00.000Z", fields: {} } } },
    "2026-01-01T00:00:00.000Z"
  );

describe("cursor", () => {
  it("round-trips a fingerprint", () => {
    const cursor = encodeCursor(fp());
    expect(decodeCursor(cursor)).toEqual(fp());
  });

  it("produces an opaque, URL-safe-ish string (no whitespace)", () => {
    expect(encodeCursor(fp())).not.toMatch(/\s/);
  });

  it("returns null for a malformed cursor instead of throwing", () => {
    expect(decodeCursor("not-base64-$$")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/cursor.test.ts`
Expected: FAIL — cannot resolve `cursor.js`.

- [ ] **Step 3: Write `packages/productivity/src/changes/cursor.ts`**

```typescript
import type { Fingerprint } from "./types.js";

/** Encode a fingerprint as an opaque base64 cursor (the "ETag"). */
export function encodeCursor(fingerprint: Fingerprint): string {
  return Buffer.from(JSON.stringify(fingerprint), "utf8").toString("base64url");
}

/** Decode a cursor back into a fingerprint, or null if malformed. */
export function decodeCursor(cursor: string): Fingerprint | null {
  if (cursor.length === 0) return null;
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "classes" in parsed &&
      "lastSyncDate" in parsed
    ) {
      return parsed as Fingerprint;
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/cursor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/changes/cursor.ts packages/productivity/tests/unit/cursor.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): opaque cursor encode/decode"
```

---

## Phase 2 — Cache persistence and generation accounting

### Task 6: Cache file model and persistence

**Files:**
- Create: `packages/productivity/src/changes/cache.ts`
- Test: `packages/productivity/tests/unit/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCachePath, readCache, writeCache, type CacheFile } from "../../src/changes/cache.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofocus-cache-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const sample = (): CacheFile => ({
  version: 1,
  name: "inbox",
  scope: {},
  classes: ["tasks", "projects"],
  fingerprint: { classes: {}, lastSyncDate: null },
  snapshot: {},
  generation: 0,
  deliveredGeneration: 0,
  pending: { added: [], updated: [], removed: [] },
  semanticByGeneration: {},
  refreshLock: null,
  updatedAt: "2026-05-30T00:00:00.000Z",
});

describe("cache persistence", () => {
  it("resolveCachePath honors stateDir and uses <name>.json", () => {
    expect(resolveCachePath("inbox", dir)).toBe(join(dir, "watch", "inbox.json"));
  });

  it("writes then reads back an identical cache", () => {
    const path = resolveCachePath("inbox", dir);
    writeCache(path, sample());
    expect(readCache(path)).toEqual(sample());
  });

  it("returns null when the cache file is absent (first run)", () => {
    expect(readCache(resolveCachePath("missing", dir))).toBeNull();
  });

  it("backs up and returns null for a corrupt cache file", () => {
    const path = resolveCachePath("inbox", dir);
    writeFileSync(path.replace(/inbox\.json$/, ""), ""); // ensure dir
    writeCache(path, sample());
    writeFileSync(path, "{ this is not json");
    expect(readCache(path)).toBeNull();
    const backups = readdirSync(join(dir, "watch")).filter((f) => f.includes("corrupt"));
    expect(backups.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/cache.test.ts`
Expected: FAIL — cannot resolve `cache.js`.

- [ ] **Step 3: Write `packages/productivity/src/changes/cache.ts`**

```typescript
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ChangeSet, Fingerprint, Snapshot, WatchedClass } from "./types.js";

/** On-disk watch cache (spec §5). */
export interface CacheFile {
  version: 1;
  name: string;
  scope: Record<string, unknown>;
  classes: WatchedClass[];
  fingerprint: Fingerprint;
  snapshot: Snapshot;
  generation: number;
  deliveredGeneration: number;
  pending: ChangeSet;
  semanticByGeneration: Record<string, string>;
  refreshLock: { pid: number; startedAt: string } | null;
  updatedAt: string;
}

/** Resolve the state directory: explicit arg > OFOCUS_STATE_DIR > ~/.ofocus. */
export function resolveStateDir(stateDir?: string): string {
  if (stateDir !== undefined && stateDir.length > 0) return stateDir;
  const env = process.env["OFOCUS_STATE_DIR"];
  if (env !== undefined && env.length > 0) return env;
  return join(homedir(), ".ofocus");
}

/** Resolve the cache file path for a named watch. */
export function resolveCachePath(name: string, stateDir?: string): string {
  return join(resolveStateDir(stateDir), "watch", `${name}.json`);
}

/** Atomically write a cache file (temp + rename), creating parent dirs. */
export function writeCache(path: string, cache: CacheFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${String(process.pid)}`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
  renameSync(tmp, path);
}

/**
 * Read a cache file. Returns null if absent. On a corrupt file, moves it aside
 * to `<name>.corrupt-<timestamp-from-mtime>.json` and returns null (spec §9).
 */
export function readCache(path: string): CacheFile | null {
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as CacheFile;
  } catch {
    // Derive a deterministic suffix from the file's own mtime (no Date.now()).
    const suffix = safeCorruptSuffix(path);
    try {
      renameSync(path, path.replace(/\.json$/, `.corrupt-${suffix}.json`));
    } catch {
      /* best-effort backup */
    }
    return null;
  }
}

function safeCorruptSuffix(path: string): string {
  try {
    // statSync mtime is deterministic w.r.t. the file, not wall clock.
    const { statSync } = require("node:fs") as typeof import("node:fs");
    return String(statSync(path).mtimeMs).replace(/\W/g, "");
  } catch {
    return "backup";
  }
}
```

Note: `safeCorruptSuffix` uses the file's own mtime, not `Date.now()`, keeping behavior deterministic for tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/cache.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/changes/cache.ts packages/productivity/tests/unit/cache.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): watch cache persistence with corrupt-file recovery"
```

### Task 7: Generation / pending accounting

**Files:**
- Create: `packages/productivity/src/changes/generation.ts`
- Test: `packages/productivity/tests/unit/generation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { mergeChangeSets, accumulatePending } from "../../src/changes/generation.js";
import type { CacheFile } from "../../src/changes/cache.js";
import type { ChangeSet } from "../../src/changes/types.js";

const cs = (over: Partial<ChangeSet>): ChangeSet => ({ added: [], updated: [], removed: [], ...over });

describe("mergeChangeSets", () => {
  it("concatenates two change sets, later updates overriding earlier per id", () => {
    const a = cs({ updated: [{ id: "x", class: "tasks", object: { f: 1 }, delta: { f: { from: 0, to: 1 } } }] });
    const b = cs({ updated: [{ id: "x", class: "tasks", object: { f: 2 }, delta: { f: { from: 1, to: 2 } } }] });
    const merged = mergeChangeSets(a, b);
    expect(merged.updated).toHaveLength(1);
    expect(merged.updated[0]!.object).toEqual({ f: 2 });
  });

  it("a removal after an add cancels both", () => {
    const a = cs({ added: [{ id: "y", class: "tasks", object: {} }] });
    const b = cs({ removed: [{ id: "y", class: "tasks", object: {} }] });
    const merged = mergeChangeSets(a, b);
    expect(merged.added).toHaveLength(0);
    expect(merged.removed).toHaveLength(0);
  });
});

describe("accumulatePending", () => {
  it("bumps generation and merges into pending when there are changes", () => {
    const cache = { generation: 3, pending: cs({}) } as CacheFile;
    const next = accumulatePending(cache, cs({ added: [{ id: "z", class: "tasks", object: {} }] }));
    expect(next.generation).toBe(4);
    expect(next.pending.added).toHaveLength(1);
  });

  it("does NOT bump generation when the change set is empty", () => {
    const cache = { generation: 3, pending: cs({}) } as CacheFile;
    const next = accumulatePending(cache, cs({}));
    expect(next.generation).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/generation.test.ts`
Expected: FAIL — cannot resolve `generation.js`.

- [ ] **Step 3: Write `packages/productivity/src/changes/generation.ts`**

```typescript
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
 * - removed-then-added becomes an update-ish add (treated as added);
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
    if (added.has(key)) added.set(key, { ...c, delta: undefined });
    else updated.set(key, c);
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
    pending: mergeChangeSets(cache.pending ?? emptyChangeSet(), changes),
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/generation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/changes/generation.ts packages/productivity/tests/unit/generation.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): generation and pending-delta accounting"
```

---

## Phase 3 — OmniJS scan

### Task 8: Scan script builder and result parser

**Files:**
- Create: `packages/productivity/src/changes/scan.ts`
- Test: `packages/productivity/tests/unit/scan.test.ts`

- [ ] **Step 1: Write the failing test** (unit-test the pure parts: script content + parsing)

```typescript
import { describe, it, expect } from "vitest";
import { buildScanScript, buildFingerprintScript, parseScanResult } from "../../src/changes/scan.js";

describe("buildScanScript", () => {
  it("includes flattenedTasks and flattenedProjects for the default classes", () => {
    const script = buildScanScript(["tasks", "projects"]);
    expect(script).toContain("flattenedTasks");
    expect(script).toContain("flattenedProjects");
    expect(script).toContain("toISOString");
  });
  it("omits classes that are not requested", () => {
    const script = buildScanScript(["tasks"]);
    expect(script).not.toContain("flattenedTags");
  });
});

describe("parseScanResult", () => {
  it("groups raw rows into a Snapshot keyed by id", () => {
    const raw = {
      tasks: [
        { id: "a", modified: "2026-05-30T01:00:00.000Z", name: "A", flagged: false },
      ],
      projects: [],
    };
    const snap = parseScanResult(raw, ["tasks", "projects"]);
    expect(snap.tasks!["a"]).toEqual({
      id: "a",
      modified: "2026-05-30T01:00:00.000Z",
      fields: expect.objectContaining({ name: "A", flagged: false }),
    });
    expect(snap.projects).toEqual({});
  });
});

describe("buildFingerprintScript", () => {
  it("returns counts and max-modified per class plus lastSyncDate", () => {
    const script = buildFingerprintScript(["tasks"]);
    expect(script).toContain("lastSyncDate");
    expect(script).toContain("flattenedTasks");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/scan.test.ts`
Expected: FAIL — cannot resolve `scan.js`.

- [ ] **Step 3: Write `packages/productivity/src/changes/scan.ts`**

```typescript
import { runOmniJSWrapped } from "@ofocus/sdk";
import { type Fingerprint, type Snapshot, WATCHED_FIELDS, type WatchedClass } from "./types.js";

/** OmniJS global collection name per class. */
const COLLECTION: Record<WatchedClass, string> = {
  tasks: "flattenedTasks",
  projects: "flattenedProjects",
  tags: "flattenedTags",
  folders: "flattenedFolders",
};

const sql = String.raw;

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
    return sql`
out.${cls} = ${COLLECTION[cls]}.map(function (o) {
  var m = ${modifiedExpr};
  return {
    id: o.id.primaryKey,
    modified: m ? m.toISOString() : null,
    ${fields.map((f) => `${f}: readField(o, ${JSON.stringify(f)})`).join(",\n    ")}
  };
});`;
  });

  return sql`
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
    return sql`
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
  return sql`
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
  classes: readonly WatchedClass[]
): Snapshot {
  const snap: Snapshot = {};
  for (const cls of classes) {
    const rows = raw[cls] ?? [];
    const objects: Record<string, { id: string; modified: string; fields: Record<string, unknown> }> = {};
    for (const row of rows) {
      const { id, modified, ...fields } = row;
      objects[id] = { id, modified: modified ?? "", fields };
    }
    snap[cls] = objects;
  }
  return snap;
}

/** Run the full scan against OmniFocus and return a Snapshot. */
export async function scanWatched(classes: readonly WatchedClass[]): Promise<Snapshot> {
  const result = await runOmniJSWrapped<Record<string, RawRow[]>>(buildScanScript(classes));
  if (!result.success || result.data === undefined) {
    throw new Error(result.error?.message ?? "OmniFocus scan failed");
  }
  return parseScanResult(result.data, classes);
}

/** Run the cheap fingerprint scan against OmniFocus. */
export async function scanFingerprint(classes: readonly WatchedClass[]): Promise<Fingerprint> {
  const result = await runOmniJSWrapped<Fingerprint>(buildFingerprintScript(classes));
  if (!result.success || result.data === undefined) {
    throw new Error(result.error?.message ?? "OmniFocus fingerprint scan failed");
  }
  return result.data;
}
```

Note: confirm `runOmniJSWrapped` is exported from `@ofocus/sdk` (it is used by `commands/sync.ts`); if it is not in the public `index.ts` export surface, add it there in this step (it already backs other commands).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/scan.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/changes/scan.ts packages/productivity/tests/unit/scan.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): OmniJS scan + fingerprint script builders and parser"
```

---

## Phase 4 — The `changes` command (modes, wiring)

### Task 9: The refresh core (scan → diff → cache) + the command handler

**Files:**
- Create: `packages/productivity/src/changes/refresh.ts`
- Create: `packages/productivity/src/changes/command.ts`
- Test: `packages/productivity/tests/unit/command.test.ts`

- [ ] **Step 1: Write the failing test** (inject the scan functions so no OmniFocus is needed)

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChanges } from "../../src/changes/command.js";
import type { Snapshot, Fingerprint } from "../../src/changes/types.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofocus-cmd-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const snapV1: Snapshot = { tasks: { a: { id: "a", modified: "2026-05-30T01:00:00.000Z", fields: { name: "A", flagged: false } } }, projects: {} };
const snapV2: Snapshot = { tasks: { a: { id: "a", modified: "2026-05-30T09:00:00.000Z", fields: { name: "A", flagged: true } } }, projects: {} };

function deps(snapshot: Snapshot) {
  const fp: Fingerprint = {
    classes: { tasks: { count: Object.keys(snapshot.tasks ?? {}).length, maxModified: "x" }, projects: { count: 0, maxModified: null } },
    lastSyncDate: null,
  };
  return {
    scanWatched: async () => snapshot,
    scanFingerprint: async () => fp,
    stateDir: dir,
    spawnBackgroundRefresh: () => {}, // no-op in tests
  };
}

describe("runChanges", () => {
  it("first run baselines without dumping every object as added", async () => {
    const out = await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    expect(out.success).toBe(true);
    expect(out.data!.baselined).toBe(true);
    expect(out.data!.summary).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("--fresh reports a field-level delta on the second run", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    const out = await runChanges({ watch: "w", fresh: true }, deps(snapV2));
    expect(out.data!.summary.updated).toBe(1);
    expect(out.data!.changes.updated[0]!.delta).toEqual({ flagged: { from: false, to: true } });
  });

  it("--fresh returns notModified when fingerprint is unchanged", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    const out = await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    expect(out.data!.notModified).toBe(true);
  });

  it("--pending returns accumulated deltas and advances deliveredGeneration", async () => {
    await runChanges({ watch: "w", fresh: true }, deps(snapV1));
    // Simulate a background refresh by running a non-fresh cached read that triggers refresh inline:
    await runChanges({ watch: "w", refreshInline: true }, deps(snapV2)); // test-only inline refresh flag
    const out = await runChanges({ watch: "w", pending: true }, deps(snapV2));
    expect(out.data!.summary.updated).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/command.test.ts`
Expected: FAIL — cannot resolve `command.js`.

- [ ] **Step 3: Write `packages/productivity/src/changes/refresh.ts`**

```typescript
import type { CacheFile } from "./cache.js";
import { computeFingerprint } from "./fingerprint.js";
import { diffSnapshots } from "./diff.js";
import { accumulatePending } from "./generation.js";
import type { ChangeSet, Fingerprint, Snapshot, WatchedClass } from "./types.js";

/** Functions the refresh core depends on (injected for testability). */
export interface RefreshDeps {
  scanWatched: (classes: readonly WatchedClass[]) => Promise<Snapshot>;
  scanFingerprint?: (classes: readonly WatchedClass[]) => Promise<Fingerprint>;
}

export interface RefreshResult {
  cache: CacheFile;
  changes: ChangeSet;
  notModified: boolean;
}

/**
 * The scan→diff→cache core shared by `--fresh` (returns changes, caller clears
 * pending) and the background refresher (caller accumulates pending).
 * `accumulate` controls which accounting the cache receives.
 */
export async function runRefresh(
  cache: CacheFile,
  deps: RefreshDeps,
  opts: { accumulate: boolean; updatedAt: string }
): Promise<RefreshResult> {
  const nextSnapshot = await deps.scanWatched(cache.classes);
  const nextFingerprint = computeFingerprint(
    nextSnapshot,
    cache.fingerprint.lastSyncDate ?? null
  );
  const changes = diffSnapshots(cache.snapshot, nextSnapshot);
  const noChanges =
    changes.added.length === 0 &&
    changes.updated.length === 0 &&
    changes.removed.length === 0;

  let updated: CacheFile = {
    ...cache,
    snapshot: nextSnapshot,
    fingerprint: nextFingerprint,
    updatedAt: opts.updatedAt,
  };
  if (opts.accumulate) updated = accumulatePending(updated, changes);

  return { cache: updated, changes, notModified: noChanges };
}
```

- [ ] **Step 4: Write `packages/productivity/src/changes/command.ts`**

```typescript
import { z } from "zod";
import { type CliOutput, defineCommand } from "@ofocus/sdk";
import { success } from "@ofocus/sdk";
import {
  type CacheFile,
  readCache,
  resolveCachePath,
  writeCache,
} from "./cache.js";
import { encodeCursor } from "./cursor.js";
import { fingerprintsEqual } from "./fingerprint.js";
import { clearPending } from "./generation.js";
import { runRefresh, type RefreshDeps } from "./refresh.js";
import { scanFingerprint, scanWatched } from "./scan.js";
import {
  type ChangeSet,
  type Fingerprint,
  type WatchedClass,
  emptyChangeSet,
} from "./types.js";

/** Shape returned by the `changes` command. */
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

/** Dependencies injected for testing; defaults hit the real tool. */
export interface ChangesDeps extends RefreshDeps {
  stateDir?: string;
  spawnBackgroundRefresh?: (watch: string, stateDir?: string) => void;
  /** test-only: when true, a non-fresh call performs the refresh inline. */
  refreshInline?: boolean;
  /** deterministic timestamp injection (avoids Date.now() in code paths). */
  now?: string;
}

function freshCache(name: string, classes: WatchedClass[], now: string): CacheFile {
  const empty: Fingerprint = { classes: {}, lastSyncDate: null };
  return {
    version: 1,
    name,
    scope: {},
    classes,
    fingerprint: empty,
    snapshot: {},
    generation: 0,
    deliveredGeneration: 0,
    pending: emptyChangeSet(),
    semanticByGeneration: {},
    refreshLock: null,
    updatedAt: now,
  };
}

function toOutput(cache: CacheFile, changes: ChangeSet, flags: {
  notModified: boolean;
  baselined: boolean;
  stale: boolean;
}): ChangesOutput {
  return {
    watch: cache.name,
    generation: cache.generation,
    cursor: encodeCursor(cache.fingerprint),
    notModified: flags.notModified,
    baselined: flags.baselined,
    stale: flags.stale,
    summary: {
      added: changes.added.length,
      updated: changes.updated.length,
      removed: changes.removed.length,
    },
    changes,
  };
}

/** Core handler. `deps` is injected in tests; production passes real scanners. */
export async function runChanges(
  input: {
    watch?: string;
    since?: string;
    fresh?: boolean;
    pending?: boolean;
    generationSince?: number;
    reset?: boolean;
    refreshInline?: boolean; // test-only
  },
  deps: ChangesDeps
): Promise<CliOutput<ChangesOutput>> {
  const name = input.watch ?? "default";
  const now = deps.now ?? "1970-01-01T00:00:00.000Z";
  const path = resolveCachePath(name, deps.stateDir);
  let cache = readCache(path) ?? freshCache(name, DEFAULT_CLASSES, now);
  const isFirstRun = cache.generation === 0 && Object.keys(cache.snapshot).length === 0;

  // --reset: re-baseline to current and return no diff.
  if (input.reset === true) {
    const snapshot = await deps.scanWatched(cache.classes);
    cache = { ...freshCache(name, cache.classes, now), snapshot,
      fingerprint: { classes: {}, lastSyncDate: null } };
    // recompute fingerprint via refresh core for consistency:
    const r = await runRefresh({ ...cache, snapshot: {} }, deps, { accumulate: false, updatedAt: now });
    writeCache(path, r.cache);
    return success(toOutput(r.cache, emptyChangeSet(), { notModified: false, baselined: true, stale: false }));
  }

  // --pending: machine path for the hook — return accumulated pending, advance delivered.
  if (input.pending === true) {
    const sinceGen = input.generationSince ?? cache.deliveredGeneration;
    const out = toOutput(cache, cache.pending, {
      notModified: cache.generation <= sinceGen,
      baselined: false,
      stale: false,
    });
    const cleared = clearPending(cache);
    writeCache(path, cleared);
    return success(out);
  }

  // --fresh (or test-only inline refresh, or first run): synchronous scan.
  if (input.fresh === true || input.refreshInline === true || isFirstRun) {
    // Fast path: cheap fingerprint compare (skip when first run).
    if (!isFirstRun && deps.scanFingerprint) {
      const fp = await deps.scanFingerprint(cache.classes);
      const merged = { ...fp, lastSyncDate: fp.lastSyncDate };
      if (fingerprintsEqual(merged, { ...cache.fingerprint, dbMtime: undefined })) {
        return success(toOutput(cache, emptyChangeSet(), { notModified: true, baselined: false, stale: false }));
      }
      cache = { ...cache, fingerprint: { ...cache.fingerprint, lastSyncDate: fp.lastSyncDate } };
    }
    const accumulate = input.refreshInline === true; // background-style accounting
    const r = await runRefresh(cache, deps, { accumulate, updatedAt: now });
    const finalCache = accumulate ? r.cache : clearPending(r.cache);
    writeCache(path, finalCache);
    return success(
      toOutput(finalCache, accumulate ? emptyChangeSet() : r.changes, {
        notModified: r.notModified,
        baselined: isFirstRun,
        stale: false,
      })
    );
  }

  // Default cached read: instant, eventually consistent; trigger background refresh.
  if (deps.spawnBackgroundRefresh) deps.spawnBackgroundRefresh(name, deps.stateDir);
  return success(
    toOutput(cache, cache.pending, { notModified: false, baselined: false, stale: true })
  );
}

/** The descriptor — surfaced through CLI + MCP + docs via the registry union. */
export const changesDescriptor = defineCommand({
  name: "changes",
  cliName: "changes",
  mcpName: "changes",
  description:
    "Detect what changed in OmniFocus since the last look. Cache-first and instant by default; " +
    "--fresh forces a live scan; --pending returns accumulated deltas for a notification hook.",
  inputSchema: z.object({
    watch: z.string().optional().describe("Named watch (default: 'default')"),
    since: z.string().optional().describe("Optimistic cursor for a stateless notModified check"),
    fresh: z.boolean().optional().describe("Force a synchronous live scan"),
    pending: z.boolean().optional().describe("Return accumulated pending deltas (hook path)"),
    generationSince: z.number().optional().describe("Only deltas newer than this generation"),
    reset: z.boolean().optional().describe("Re-baseline the watch to current state"),
    semantic: z.boolean().optional().describe("Attach a fast-model NL summary (opt-in)"),
  }),
  handler: async (parsed): Promise<CliOutput<ChangesOutput>> =>
    runChanges(parsed, {
      scanWatched,
      scanFingerprint,
      spawnBackgroundRefresh: () => {
        /* wired in Task 12 */
      },
    }),
});
```

Note on the test-only `refreshInline` flag: it lets the unit test exercise background-style accumulation deterministically without spawning a process. Production triggers the same accumulation via the detached refresh (Task 12), which invokes `runChanges({ refreshInline: true })` in the child. Keep the flag documented as test/internal.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/command.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Export from `packages/productivity/src/index.ts`**

Replace the placeholder `productivityDescriptors` with the real export and re-export the public API:

```typescript
import { changesDescriptor } from "./changes/command.js";
import type { ResolvedCommandDescriptor } from "@ofocus/sdk";

export { changesDescriptor } from "./changes/command.js";
export type { ChangesOutput } from "./changes/command.js";
export * from "./changes/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous descriptors
export const productivityDescriptors: ReadonlyArray<
  ResolvedCommandDescriptor<any, any, any>
> = [changesDescriptor];
```

- [ ] **Step 7: Build and commit**

```bash
pnpm -w exec tsc --build
git add packages/productivity/src/changes/refresh.ts packages/productivity/src/changes/command.ts \
        packages/productivity/src/index.ts packages/productivity/tests/unit/command.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): changes command handler with read modes"
```

### Task 10: Background-refresh spawn (debounced, single-flight)

**Files:**
- Modify: `packages/productivity/src/changes/refresh.ts` (add spawn helper)
- Test: `packages/productivity/tests/unit/spawn.test.ts`

- [ ] **Step 1: Write the failing test** (lock logic only; do not actually spawn)

```typescript
import { describe, it, expect } from "vitest";
import { shouldSpawnRefresh } from "../../src/changes/refresh.js";
import type { CacheFile } from "../../src/changes/cache.js";

const base = (over: Partial<CacheFile>): CacheFile => ({
  version: 1, name: "w", scope: {}, classes: ["tasks"],
  fingerprint: { classes: {}, lastSyncDate: null }, snapshot: {},
  generation: 0, deliveredGeneration: 0,
  pending: { added: [], updated: [], removed: [] },
  semanticByGeneration: {}, refreshLock: null, updatedAt: "2026-05-30T00:00:00.000Z",
  ...over,
});

describe("shouldSpawnRefresh", () => {
  it("spawns when there is no lock and the cache is older than the debounce", () => {
    expect(shouldSpawnRefresh(base({ updatedAt: "2026-05-30T00:00:00.000Z" }), "2026-05-30T00:01:00.000Z", 5000, [])).toBe(true);
  });
  it("does not spawn when a fresh lock is held by a live pid", () => {
    expect(shouldSpawnRefresh(base({ refreshLock: { pid: 4242, startedAt: "2026-05-30T00:00:59.000Z" } }), "2026-05-30T00:01:00.000Z", 5000, [4242])).toBe(false);
  });
  it("reclaims a stale lock whose pid is dead", () => {
    expect(shouldSpawnRefresh(base({ refreshLock: { pid: 4242, startedAt: "2026-05-30T00:00:59.000Z" } }), "2026-05-30T00:01:00.000Z", 5000, [])).toBe(true);
  });
  it("debounces when the last refresh is younger than the interval", () => {
    expect(shouldSpawnRefresh(base({ updatedAt: "2026-05-30T00:00:59.000Z" }), "2026-05-30T00:01:00.000Z", 5000, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/spawn.test.ts`
Expected: FAIL — `shouldSpawnRefresh` not exported.

- [ ] **Step 3: Append to `packages/productivity/src/changes/refresh.ts`**

```typescript
import { spawn } from "node:child_process";
import type { CacheFile } from "./cache.js";

/**
 * Decide whether to spawn a background refresh.
 * @param cache    current cache
 * @param nowIso   injected current time (ISO)
 * @param debounceMs minimum interval since the last completed refresh
 * @param livePids list of pids known alive (injected for testability)
 */
export function shouldSpawnRefresh(
  cache: CacheFile,
  nowIso: string,
  debounceMs: number,
  livePids: number[]
): boolean {
  const now = Date.parse(nowIso);
  if (cache.refreshLock) {
    const lockLive = livePids.includes(cache.refreshLock.pid);
    if (lockLive) return false; // single-flight
    // stale lock → reclaimable, fall through
  }
  const last = Date.parse(cache.updatedAt);
  if (Number.isFinite(last) && now - last < debounceMs) return false; // debounce
  return true;
}

/** Return true if a pid is alive (signal 0). */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn a detached `ofocus changes --watch <name> --refresh-inline` child that
 * performs the scan→diff→pending accumulation out of band, then exits.
 * The child re-enters the CLI; `ofocusBin` is the resolved CLI entry path.
 */
export function spawnBackgroundRefresh(
  ofocusBin: string,
  watch: string,
  stateDir?: string
): void {
  const args = ["changes", "--watch", watch, "--refresh-inline"];
  const env = { ...process.env };
  if (stateDir !== undefined) env["OFOCUS_STATE_DIR"] = stateDir;
  const child = spawn(process.execPath, [ofocusBin, ...args], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/spawn.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/productivity/src/changes/refresh.ts packages/productivity/tests/unit/spawn.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): debounced single-flight background refresh"
```

### Task 11: FDA accelerator (mtime), with fallback

**Files:**
- Create: `packages/productivity/src/changes/fda.ts`
- Test: `packages/productivity/tests/unit/fda.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDbMtime } from "../../src/changes/fda.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofocus-fda-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("readDbMtime", () => {
  it("returns an ISO mtime when the package dir is readable", () => {
    const pkg = join(dir, "OmniFocus.ofocus");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "txn1.zip"), "x");
    const t = new Date("2026-05-30T03:00:00.000Z");
    utimesSync(pkg, t, t);
    const mtime = readDbMtime(pkg);
    expect(mtime).toBe("2026-05-30T03:00:00.000Z");
  });

  it("returns null when the path is unreadable / absent (graceful fallback)", () => {
    expect(readDbMtime(join(dir, "does-not-exist.ofocus"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/fda.test.ts`
Expected: FAIL — cannot resolve `fda.js`.

- [ ] **Step 3: Write `packages/productivity/src/changes/fda.ts`**

```typescript
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the OmniFocus 4 `.ofocus` database package path, or null if it
 * cannot be located/read (TCC without Full Disk Access). Spec §4.4.
 */
export function resolveDbPackagePath(): string | null {
  const base = join(
    homedir(),
    "Library/Containers/com.omnigroup.OmniFocus4/Data/Library/Application Support/OmniFocus"
  );
  try {
    if (!existsSync(base)) return null;
    const pkg = readdirSync(base).find((f) => f.endsWith(".ofocus"));
    return pkg ? join(base, pkg) : null;
  } catch {
    return null; // unreadable → no FDA
  }
}

/** Read the package directory mtime as an ISO string, or null if unreadable. */
export function readDbMtime(packagePath: string): string | null {
  try {
    return statSync(packagePath).mtime.toISOString();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/fda.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the accelerator into the fingerprint fast path**

In `packages/productivity/src/changes/command.ts`, before calling `deps.scanFingerprint`, attempt the mtime check: if `resolveDbPackagePath()` returns a path and its mtime equals `cache.fingerprint.dbMtime`, short-circuit to `notModified` without any OmniJS call. Add `dbMtime` to the stored fingerprint after a scan. (Inject `readDbMtime`/`resolveDbPackagePath` through `deps` with defaults so it stays testable.) Add a unit test `command-fda.test.ts` asserting: when injected `readDbMtime` returns the same value as `cache.fingerprint.dbMtime`, `scanFingerprint` is NOT called and `notModified` is true.

- [ ] **Step 6: Run, then commit**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/`
Expected: PASS.

```bash
git add packages/productivity/src/changes/fda.ts packages/productivity/src/changes/command.ts \
        packages/productivity/tests/unit/fda.test.ts packages/productivity/tests/unit/command-fda.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): optional Full Disk Access mtime accelerator with fallback"
```

### Task 12: `--semantic` summary via loose command

**Files:**
- Create: `packages/productivity/src/changes/semantic.ts`
- Test: `packages/productivity/tests/unit/semantic.test.ts`

- [ ] **Step 1: Write the failing test** (use a real stub command: `cat`)

```typescript
import { describe, it, expect } from "vitest";
import { summarize } from "../../src/changes/semantic.js";

describe("summarize", () => {
  it("pipes the packet to the configured command on stdin and returns stdout", async () => {
    const res = await summarize({ hello: "world" }, "cat");
    expect(res.summary).toContain("hello");
    expect(res.note).toBeUndefined();
  });

  it("fails open with a note when no command is configured", async () => {
    const res = await summarize({ x: 1 }, undefined);
    expect(res.summary).toBeUndefined();
    expect(res.note).toMatch(/not configured/i);
  });

  it("fails open with a note when the command exits non-zero", async () => {
    const res = await summarize({ x: 1 }, "false");
    expect(res.summary).toBeUndefined();
    expect(res.note).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/semantic.test.ts`
Expected: FAIL — cannot resolve `semantic.js`.

- [ ] **Step 3: Write `packages/productivity/src/changes/semantic.ts`**

```typescript
import { spawn } from "node:child_process";

export interface SummaryResult {
  summary?: string;
  note?: string;
}

/**
 * Summarize a diff packet by piping it (JSON, on stdin) to a user-configured
 * command and capturing stdout. Fail-open: any problem yields a note, never a
 * throw (spec §8). `command` is run via the shell so users can configure flags.
 */
export async function summarize(
  packet: unknown,
  command: string | undefined,
  timeoutMs = 20_000
): Promise<SummaryResult> {
  if (command === undefined || command.trim().length === 0) {
    return { note: "Semantic summary not configured (set OFOCUS_SUMMARY_CMD)." };
  }
  return new Promise<SummaryResult>((resolve) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ note: "Semantic summary timed out." });
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ note: `Semantic summary command failed: ${e.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim().length > 0) resolve({ summary: out.trim() });
      else resolve({ note: `Semantic summary command exited ${String(code)}: ${err.trim()}`.trim() });
    });
    child.stdin.end(JSON.stringify(packet));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ofocus/productivity exec vitest run tests/unit/semantic.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `--semantic` into the handler**

In `command.ts`, after computing `changes` on a `--fresh`/`--pending` path with `semantic === true`: if a cached summary for `cache.generation` exists in `semanticByGeneration`, reuse it; else call `summarize(packet, process.env["OFOCUS_SUMMARY_CMD"])`, store it under `semanticByGeneration[String(generation)]`, and attach `semanticSummary`/`summaryNote` to the output. Inject `summarize` through `deps` (default to the real one) and add `command-semantic.test.ts` asserting reuse-by-generation and fail-open passthrough.

- [ ] **Step 6: Run, then commit**

```bash
git add packages/productivity/src/changes/semantic.ts packages/productivity/src/changes/command.ts \
        packages/productivity/tests/unit/semantic.test.ts packages/productivity/tests/unit/command-semantic.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(productivity): opt-in --semantic summary via loose stdin command"
```

---

## Phase 5 — Surface through CLI, MCP, docs

### Task 13: Register `changes` in the CLI

**Files:**
- Modify: `packages/cli/package.json` (add dep)
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/commands/list-commands.ts`
- Modify: `packages/cli/tsconfig.json` (add `../productivity` reference)
- Test: covered by Task 16 UAT

- [ ] **Step 1: Add the dependency**

In `packages/cli/package.json` `dependencies`, add `"@ofocus/productivity": "workspace:*"`. In `packages/cli/tsconfig.json` `references`, add `{ "path": "../productivity" }`. Run `pnpm install`.

- [ ] **Step 2: Register the command in `packages/cli/src/cli.ts`**

Add an import near the other descriptor imports:

```typescript
import { changesDescriptor } from "@ofocus/productivity";
import { spawnBackgroundRefresh } from "@ofocus/productivity";
```

Then, alongside the other `registerCliCommand(...)` calls in `createCli`, add:

```typescript
registerCliCommand(program, changesDescriptor, (result, cmd) => {
  handleResult(result, cmd); // use the same output handler the file already defines
});
```

(Use whatever shared output handler the surrounding `registerCliCommand` calls use — match the existing pattern exactly.) Also add a hidden `--refresh-inline` boolean to the `changes` schema handling path: the simplest approach is to include `refreshInline` in the descriptor's `inputSchema` as an optional boolean with `.describe("internal: used by the background refresher")` so Commander exposes `--refresh-inline`, and the handler already routes it.

- [ ] **Step 3: Include productivity descriptors in `list-commands`**

In `packages/cli/src/commands/list-commands.ts`, import `productivityDescriptors` from `@ofocus/productivity` and concatenate it with the SDK descriptors the file already lists, so `ofocus list-commands` and the catalog include `changes`.

- [ ] **Step 4: Build and smoke-test**

Run: `pnpm -w exec tsc --build && node packages/cli/dist/index.js changes --help`
Expected: help text for `changes` with `--watch`, `--fresh`, `--pending`, `--reset`, `--semantic`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(cli): surface the changes command from @ofocus/productivity"
```

### Task 14: Register `changes` as an MCP tool

**Files:**
- Modify: `packages/mcp/package.json` (add dep)
- Modify: `packages/mcp/tsconfig.json` (add `../productivity` reference)
- Create: `packages/mcp/src/tools/productivity.ts`
- Modify: `packages/mcp/src/tools/index.ts`

- [ ] **Step 1: Add the dependency**

In `packages/mcp/package.json` `dependencies`, add `"@ofocus/productivity": "workspace:*"`. In `packages/mcp/tsconfig.json` `references`, add `{ "path": "../productivity" }`. Run `pnpm install`.

- [ ] **Step 2: Create `packages/mcp/src/tools/productivity.ts`**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { productivityDescriptors } from "@ofocus/productivity";
import { registerMcpTool } from "../registry-adapter.js";

/** Register every Layer-2 productivity command as an MCP tool. */
export function registerProductivityTools(server: McpServer): void {
  for (const descriptor of productivityDescriptors) {
    registerMcpTool(server, descriptor);
  }
}
```

- [ ] **Step 3: Call it from `registerAllTools`**

In `packages/mcp/src/tools/index.ts`, import and invoke:

```typescript
import { registerProductivityTools } from "./productivity.js";
// ...inside registerAllTools(server):
registerProductivityTools(server);
```

- [ ] **Step 4: Build and verify the tool is listed**

Run: `pnpm -w exec tsc --build`
Then start the server briefly and confirm the `changes` tool appears (or assert via a small script that `createServer()` registers it). Minimum: build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp pnpm-lock.yaml
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "feat(mcp): expose the changes tool from @ofocus/productivity"
```

### Task 15: Include productivity commands in generated agent docs

**Files:**
- Modify: `scripts/generate-agent-docs.ts`

- [ ] **Step 1: Merge productivity descriptors into the generator**

In `scripts/generate-agent-docs.ts`, where it imports `allCommandDescriptors` from the built `@ofocus/sdk` dist, also import `productivityDescriptors` from the built `@ofocus/productivity` dist and concatenate them into the descriptor list the generator iterates. Group productivity commands under a "Productivity" heading (add a category mapping entry if the generator categorizes by source).

- [ ] **Step 2: Regenerate and inspect**

Run: `pnpm build`
Expected: `AGENT_INSTRUCTIONS.md`, `AGENT_CLI_INSTRUCTIONS.md`, and `skills/ofocus/SKILL.md` now contain a `changes` entry. Inspect the diff to confirm it reads sensibly.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-agent-docs.ts AGENT_INSTRUCTIONS.md AGENT_CLI_INSTRUCTIONS.md skills/ofocus/SKILL.md
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "docs: include productivity commands in generated agent docs"
```

---

## Phase 6 — UAT and finalization

### Task 16: UAT — drive the real CLI against a temp state dir

**Files:**
- Create: `packages/productivity/tests/uat/changes.uat.test.ts`

- [ ] **Step 1: Write the UAT**

```typescript
/**
 * UAT: drive the real `ofocus changes` CLI as a user/script would.
 * Uses a temp OFOCUS_STATE_DIR so no real ~/.ofocus is touched. These tests
 * require a built CLI; they assert output shape and exit codes, not OmniFocus
 * data (the scan is exercised against the live app only when present — see skip).
 *
 * @see ../../docs/superpowers/specs/2026-05-30-ofocus-changes-primitive-design.md
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(__dirname, "../../../cli/dist/index.js");
let stateDir: string;

beforeAll(() => {
  if (!existsSync(CLI)) throw new Error(`CLI not built at ${CLI}; run 'pnpm -w exec tsc --build'`);
});
beforeEach(() => { stateDir = mkdtempSync(join(tmpdir(), "ofocus-uat-")); });
afterEach(() => { rmSync(stateDir, { recursive: true, force: true }); });

function run(args: string[]): { stdout: string; code: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args, "--format", "json"], {
      env: { ...process.env, OFOCUS_STATE_DIR: stateDir },
      encoding: "utf8",
    });
    return { stdout, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", code: err.status ?? 1 };
  }
}

describe("ofocus changes (UAT)", () => {
  it("--help documents the read modes", () => {
    const stdout = execFileSync("node", [CLI, "changes", "--help"], { encoding: "utf8" });
    expect(stdout).toMatch(/--watch/);
    expect(stdout).toMatch(/--fresh/);
    expect(stdout).toMatch(/--pending/);
  });

  // Live scan against the running app; skip in CI where OmniFocus is absent.
  const omniFocusPresent = existsSync("/Applications/OmniFocus.app");
  (omniFocusPresent ? it : it.skip)("--fresh baselines on first run then reports notModified", () => {
    const first = run(["changes", "--watch", "uat", "--fresh"]);
    expect(first.code).toBe(0);
    const parsed = JSON.parse(first.stdout) as { data: { baselined: boolean } };
    expect(parsed.data.baselined).toBe(true);

    const second = run(["changes", "--watch", "uat", "--fresh"]);
    const parsed2 = JSON.parse(second.stdout) as { data: { notModified: boolean } };
    expect(parsed2.data.notModified).toBe(true);
  });
});
```

- [ ] **Step 2: Build and run the UAT**

Run: `pnpm -w exec tsc --build && pnpm --filter @ofocus/productivity exec vitest run tests/uat/changes.uat.test.ts`
Expected: `--help` test PASS; live test PASS locally (OmniFocus present), SKIP in CI.

- [ ] **Step 3: Commit**

```bash
git add packages/productivity/tests/uat/changes.uat.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "test(productivity): UAT for the changes CLI"
```

### Task 17: Changeset, READMEs, and full clean build/lint/test

**Files:**
- Create: `.changeset/<name>.md`
- Modify: `README.md` (Packages table + CLI commands table: add `changes`)
- Modify: `packages/productivity/README.md` (new, brief)

- [ ] **Step 1: Add a changeset**

Run: `pnpm changeset` and select a minor bump for `@ofocus/productivity` (new), `@ofocus/cli`, `@ofocus/mcp`, and the `ofocus` umbrella (it re-exports productivity). Summary: "Add `ofocus changes` change-detection primitive and the `@ofocus/productivity` package."

- [ ] **Step 2: Update root `README.md`**

Add `@ofocus/productivity` to the Packages table and `changes` to the CLI commands table (with a one-line description matching the descriptor).

- [ ] **Step 3: Add `packages/productivity/README.md`**

A short README: what the package is (L2 niceties), that it depends on `@ofocus/sdk`, and the `changes` command with the three read modes and `OFOCUS_SUMMARY_CMD` / `OFOCUS_STATE_DIR` env vars.

- [ ] **Step 4: Run the full clean build/lint/test gate**

Invoke `/clean_blt`. If anything fails, fix and re-run until green. Specifically ensure: `pnpm build` (incl. doc regen) succeeds, `pnpm lint` passes (productivity `src` is covered by `eslint packages/*/src`), `pnpm test` passes (all package suites + the root integration suite).

- [ ] **Step 5: Commit**

```bash
git add .changeset README.md packages/productivity/README.md
git commit --author="Mike North <michael.l.north@gmail.com>" \
  -m "docs(productivity): changeset and READMEs for the changes primitive"
```

---

## Self-Review

**Spec coverage** (spec §→task):
- §3 read modes (cached / `--fresh` / `--pending` / `--reset` / `--since`) → Task 9.
- §4.2 fingerprint fast path → Tasks 3, 9.
- §4.4 FDA accelerator + fallback → Task 11.
- §4.5 debounced detached refresh, single-flight lock → Task 10.
- §5 cache file format → Task 6 (`CacheFile`).
- §6 output contract (full object + delta, first-run baseline) → Tasks 4, 9.
- §7 watch scope + watched fields → Task 2 (`WATCHED_FIELDS`); scope-filter redefinition is noted as carried by the descriptor schema (extend `inputSchema` with task filters in a follow-up if needed — default classes covered).
- §8 `--semantic` loose command, cache-by-generation, fail-open → Task 12.
- §9 error handling (corrupt cache, missing cache, not running) → Tasks 6, 8, 9.
- §10 test strategy (unit/integration/UAT, spec-first, no golden files) → Tasks 3–12 (unit), 9 (integration-style handler loop with injected deps), 16 (UAT).
- Package architecture (productivity package, union merge) → Tasks 1, 13, 14, 15.

**Known gap to flag during execution:** §7 scope *filters* (`--project`, `--tag`, …) that narrow a watch are not fully wired in these tasks (only default classes). If you need scoped watches in this PR, extend `changesDescriptor.inputSchema` with the relevant filter fields and pass them into `scanWatched` (filter in the OmniJS script). Otherwise defer to a follow-up and note it in the changeset. This is the single deliberate scope cut; everything else in the spec is covered.

**Placeholder scan:** No "TBD"/"implement later" steps; every code step contains runnable code. Two steps (Task 11 §5, Task 12 §5) describe wiring into the already-shown `command.ts` rather than reprinting the whole file — they specify the exact insertion point, the injected dependency, and the exact new test to add.

**Type consistency:** `ChangeSet`, `ChangedObject`, `FieldDelta`, `Snapshot`, `Fingerprint`, `CacheFile`, `ChangesOutput`, `RefreshDeps`/`ChangesDeps` are defined once and reused with consistent names across tasks. `runChanges`, `runRefresh`, `computeFingerprint`, `fingerprintsEqual`, `diffSnapshots`, `encodeCursor`/`decodeCursor`, `accumulatePending`/`clearPending`/`mergeChangeSets`, `scanWatched`/`scanFingerprint`, `shouldSpawnRefresh`/`spawnBackgroundRefresh`, `readDbMtime`/`resolveDbPackagePath`, `summarize` — signatures match between definition and call sites.

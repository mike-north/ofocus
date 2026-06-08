# Typed OmniAutomation Foundation (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authors write OmniFocus automation as type-checked TypeScript functions that compile to OmniJS, runnable via `osascript` now and installable as a headless plugin — replacing untyped string concatenation.

**Architecture:** A new zero-runtime `@ofocus/omnijs-types` package provides ambient declarations for the OmniJS global environment. In `@ofocus/sdk`, `defineOmniScript`/`defineOmniAction` capture a typed function's source via `Function.prototype.toString()` and hand it to one of two backends: the `osascript` backend (wraps + `runOmniJSWrapped`) and the `plugin-install` backend (emits a single-file `.omnijs` and writes it into the resolved Plug-Ins folder). A custom ESLint rule enforces the self-contained-function constraint at author time.

**Tech Stack:** TypeScript (ES2022, strict, NodeNext), pnpm workspace + TS project references, Vitest, ESLint 9 flat config + typescript-eslint, API Extractor, Changesets. Node built-ins only (`child_process`, `fs`, `os`, `path`).

**Spec:** [`docs/specs/2026-06-08-ofocus-typed-omniautomation-design.md`](../specs/2026-06-08-ofocus-typed-omniautomation-design.md)

---

## Why mechanism A is safe here (read before starting)

The SDK compiles at **`target: ES2022`** (`tsconfig.base.json`). At ES2022, `async`/`await`, generators, and class fields are native — TypeScript emits **no** `__awaiter`/regenerator/`__decorate` helper functions for ordinary function bodies. So `fn.toString()` on an arrow/function authored for a script body yields near-verbatim JS that OmniFocus's engine accepts. The remaining footgun is purely the **self-contained** constraint (no closures/imports), which Task 8's ESLint rule guards.

## File structure (what each new file owns)

**New package `packages/omnijs-types/`** (types only, zero runtime):
- `src/types.ts` — exported named type shapes (the API-Extractor surface).
- `src/index.ts` — API-Extractor entry (`export type *`).
- `src/globals.ts` — ambient `declare global` binding the OmniJS runtime globals to the exported types.
- `package.json`, `tsconfig.json`, `api-extractor.json`, `README.md`, type-test under `tests/`.

**`packages/sdk/src/authoring/`** (the typed-authoring core + backends):
- `types.ts` — `OmniScript`, `OmniAction`, `OmniActionMetadata`, result/handle types.
- `define.ts` — `defineOmniScript`, `defineOmniAction` (capture source via `toString()`).
- `serialize.ts` — `composeScriptBody` (args injection, shared shape with `evaluate.ts`).
- `backend-osascript.ts` — `runOmniScript`.
- `plugin-emit.ts` — `compileActionToPlugin` (metadata header + `PlugIn.Action` wrapper).
- `plugins-dir.ts` — `resolvePluginsDir` (container path detection).
- `backend-plugin-install.ts` — `installOmniAction`.

**Repo tooling:**
- `tools/eslint-rules/no-omniscript-closure.mjs` — the self-contained guardrail rule + its `RuleTester` test.

---

## Task 1: Scaffold `@ofocus/omnijs-types` (exported types + ambient globals, API-Extractor-governed)

This package does double duty: it **exports named types** (so API Extractor produces a report — per the maintainer's note) **and** declares the OmniJS **ambient globals** so authors can write `flattenedTasks`/`Task` unqualified inside script bodies. `src/types.ts` is the single source of the shapes; `src/globals.ts` binds them to the runtime globals; `src/index.ts` is the API-Extractor entry.

**Files:**
- Create: `packages/omnijs-types/package.json`
- Create: `packages/omnijs-types/tsconfig.json`
- Create: `packages/omnijs-types/api-extractor.json`
- Create: `packages/omnijs-types/src/types.ts` (named type exports — the API surface)
- Create: `packages/omnijs-types/src/index.ts` (API-Extractor entry: `export type *`)
- Create: `packages/omnijs-types/src/globals.ts` (ambient `declare global`)
- Create: `packages/omnijs-types/tests/sample.test-d.ts`
- Create: `packages/omnijs-types/tsconfig.test-d.json`
- Create: `packages/omnijs-types/README.md`
- Modify: `tsconfig.json` (root references)

- [ ] **Step 1: Write the failing type-test**

Create `packages/omnijs-types/tests/sample.test-d.ts` (ambient globals come from `src/globals.ts`, included by `tsconfig.test-d.json`):

```ts
// Positive: a representative script body type-checks against the ambient globals.
const t: Task | null = flattenedTasks.byId("abc");
const status: TaskStatus | undefined = t?.taskStatus;
const proj: Project | null = t?.containingProject ?? null;
void status;
void proj;

// Positive: the named type is also importable (the API-Extractor surface).
import type { Task as TaskType } from "@ofocus/omnijs-types";
const t2: TaskType | null = t;
void t2;

// Negative: unknown members are rejected.
// @ts-expect-error - `nope` is not a member of the task collection
flattenedTasks.nope();
// @ts-expect-error - Task has no `frobnicate` method
t?.frobnicate();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/omnijs-types && pnpm exec tsc -p tsconfig.test-d.json --noEmit`
Expected: FAIL — `Cannot find name 'flattenedTasks'` / `Cannot find module '@ofocus/omnijs-types'` (nothing exists yet).

- [ ] **Step 3: Write the exported types (the API surface)**

Create `packages/omnijs-types/src/types.ts`:

```ts
/**
 * Exported type shapes for the OmniFocus OmniJS environment. These are the
 * API-Extractor-governed surface; `globals.ts` binds the runtime globals to
 * them. Hand-authored from https://omni-automation.com (no machine-readable
 * schema exists); verified against OmniFocus build 185.15.
 *
 * @packageDocumentation
 */

/** @public */
export type TaskStatus =
  | "Available" | "Blocked" | "Next" | "DueSoon" | "Overdue"
  | "Completed" | "Dropped";

/** @public */
export type ProjectStatus = "Active" | "OnHold" | "Done" | "Dropped";

/** @public */
export interface DatabaseObjectId {
  readonly primaryKey: string;
}

/** @public */
export interface Task {
  name: string;
  note: string;
  flagged: boolean;
  readonly id: DatabaseObjectId;
  readonly completed: boolean;
  readonly dropped: boolean;
  readonly blocked: boolean;
  readonly taskStatus: TaskStatus;
  dueDate: Date | null;
  deferDate: Date | null;
  readonly effectiveDueDate: Date | null;
  readonly effectiveDeferDate: Date | null;
  estimatedMinutes: number | null;
  readonly containingProject: Project | null;
  readonly children: readonly Task[];
  readonly tags: readonly Tag[];
  addTag(tag: Tag): void;
  markComplete(): void;
}

/** @public */
export interface Project {
  name: string;
  readonly id: DatabaseObjectId;
  readonly task: Task;
  sequential: boolean;
  readonly status: ProjectStatus;
}

/** @public */
export interface Tag {
  name: string;
  readonly id: DatabaseObjectId;
  readonly availableTasks: readonly Task[];
}

/** @public */
export interface Selection {
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
}

/** @public */
export interface TaskCollection extends ReadonlyArray<Task> {
  byId(id: string): Task | null;
}

/** @public */
export interface ProjectCollection extends ReadonlyArray<Project> {
  byId(id: string): Project | null;
}

/** @public */
export interface PlugInAction {
  validate: ((selection: Selection, sender: unknown) => boolean) | null;
}

/** @public */
export interface PlugInActionConstructor {
  new (perform: (selection: Selection, sender: unknown) => void): PlugInAction;
}

/** @public */
export interface PlugInInstance {
  readonly identifier: string;
  library(identifier: string): Record<string, unknown> | null;
}

/** @public */
export interface PlugInStatic {
  find(identifier: string, minimumVersion?: unknown): PlugInInstance | null;
  readonly all: readonly PlugInInstance[];
  readonly Action: PlugInActionConstructor;
}

/** @public */
export interface AlertInstance {
  show(): Promise<number>;
}

/** @public */
export interface AlertConstructor {
  new (title: string, message: string): AlertInstance;
}
```

- [ ] **Step 4: Write the ambient globals**

Create `packages/omnijs-types/src/globals.ts` (a module — `export {}` — whose `declare global` block binds the runtime globals to the exported types):

```ts
import type {
  Task as TaskType,
  Project as ProjectType,
  Tag as TagType,
  Selection as SelectionType,
  TaskStatus as TaskStatusType,
  TaskCollection,
  ProjectCollection,
  PlugInStatic,
  AlertConstructor,
} from "./types.js";

declare global {
  // Unqualified aliases so authors can annotate naturally inside bodies.
  type Task = TaskType;
  type Project = ProjectType;
  type Tag = TagType;
  type Selection = SelectionType;
  type TaskStatus = TaskStatusType;

  // Database globals available at the top level of an OmniJS script.
  const flattenedTasks: TaskCollection;
  const flattenedProjects: ProjectCollection;
  function moveTasks(tasks: readonly TaskType[], target: unknown): void;
  function deleteObject(object: { readonly id: { readonly primaryKey: string } }): void;

  // Constructors.
  const Alert: AlertConstructor;
  const PlugIn: PlugInStatic;
}

export {};
```

- [ ] **Step 5: Write the API-Extractor entry**

Create `packages/omnijs-types/src/index.ts`:

```ts
/**
 * Public entry for `@ofocus/omnijs-types`. Re-exports the named OmniJS type
 * shapes so API Extractor can produce an API report. Ambient globals are
 * provided separately via the `@ofocus/omnijs-types/globals` subpath.
 *
 * @packageDocumentation
 */
export type * from "./types.js";
```

- [ ] **Step 6: Add manifests and configs**

Create `packages/omnijs-types/package.json`:

```json
{
  "name": "@ofocus/omnijs-types",
  "version": "0.1.0",
  "description": "Exported types and ambient globals for the OmniFocus OmniJS environment.",
  "type": "module",
  "types": "./dist/ofocus-omnijs-types.d.ts",
  "exports": {
    ".": { "types": "./dist/ofocus-omnijs-types.d.ts" },
    "./globals": { "types": "./dist/globals.d.ts" }
  },
  "files": ["dist", "api-report"],
  "scripts": {
    "build": "tsc --build && api-extractor run --local --verbose",
    "build:tsc": "tsc --build",
    "test": "tsc -p tsconfig.test-d.json --noEmit",
    "test:unit": "tsc -p tsconfig.test-d.json --noEmit",
    "api-extractor": "api-extractor run --verbose"
  },
  "keywords": ["omnifocus", "omnijs", "omni-automation", "types"],
  "license": "MIT",
  "publishConfig": { "access": "public" },
  "engines": { "node": ">=20" }
}
```

Create `packages/omnijs-types/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Create `packages/omnijs-types/api-extractor.json` (mirrors `packages/sdk/api-extractor.json`):

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/index.d.ts",
  "bundledPackages": [],
  "compiler": { "tsconfigFilePath": "<projectFolder>/tsconfig.json" },
  "apiReport": {
    "enabled": true,
    "reportFileName": "ofocus-omnijs-types.api.md",
    "reportFolder": "<projectFolder>/api-report/",
    "reportTempFolder": "<projectFolder>/temp/"
  },
  "docModel": {
    "enabled": true,
    "apiJsonFilePath": "<projectFolder>/temp/ofocus-omnijs-types.api.json"
  },
  "dtsRollup": {
    "enabled": true,
    "untrimmedFilePath": "<projectFolder>/dist/ofocus-omnijs-types.d.ts"
  },
  "tsdocMetadata": { "enabled": false },
  "messages": {
    "compilerMessageReporting": { "default": { "logLevel": "warning" } },
    "extractorMessageReporting": {
      "default": { "logLevel": "warning" },
      "ae-missing-release-tag": { "logLevel": "none" }
    },
    "tsdocMessageReporting": { "default": { "logLevel": "warning" } }
  }
}
```

Create `packages/omnijs-types/tsconfig.test-d.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "composite": false },
  "include": ["src/**/*", "tests/**/*"]
}
```

Create `packages/omnijs-types/README.md` with a one-paragraph description and the note: *"`src/types.ts` holds the exported shapes (API-Extractor-governed); `src/globals.ts` binds the OmniJS runtime globals to them. Hand-authored from omni-automation.com; no machine-readable schema exists. Versioned against build 185.15. Extend the slice as consumers need more of the API."*

- [ ] **Step 7: Build and generate the API report**

Run: `cd packages/omnijs-types && pnpm install && pnpm build`
Expected: `tsc --build` emits `dist/` (including `dist/globals.d.ts`); `api-extractor run --local` creates `api-report/ofocus-omnijs-types.api.md` listing the exported types (`Task`, `Project`, `Tag`, `TaskStatus`, `PlugInStatic`, …).

- [ ] **Step 8: Run the type-test to verify it passes**

Run: `cd packages/omnijs-types && pnpm exec tsc -p tsconfig.test-d.json --noEmit`
Expected: PASS (exit 0). The positive lines type-check; the two `@ts-expect-error` lines are satisfied.

- [ ] **Step 9: Register the package in the root build graph**

Modify `tsconfig.json` — add to `references` (after `packages/sdk`):

```json
    { "path": "packages/omnijs-types" },
```

- [ ] **Step 10: Commit**

```bash
git add packages/omnijs-types tsconfig.json pnpm-lock.yaml
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(omnijs-types): add exported OmniJS types + ambient globals (v1 slice)"
```

---

## Task 2: `OmniScript` types + `defineOmniScript`

**Files:**
- Create: `packages/sdk/src/authoring/types.ts`
- Create: `packages/sdk/src/authoring/define.ts`
- Test: `packages/sdk/tests/unit/authoring/define.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/tests/unit/authoring/define.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defineOmniScript } from "../../../src/authoring/define.js";

describe("defineOmniScript", () => {
  it("captures the function source for later serialization", () => {
    const script = defineOmniScript((args: { taskId: string }) => {
      return args.taskId.length;
    });
    expect(script.kind).toBe("script");
    expect(script.source).toContain("args.taskId.length");
  });

  it("rejects a non-function argument", () => {
    // @ts-expect-error - exercising the runtime guard
    expect(() => defineOmniScript("not a function")).toThrow(
      /defineOmniScript expects a function/,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/define.test.ts`
Expected: FAIL — cannot find module `../../../src/authoring/define.js`.

- [ ] **Step 3: Write the types**

Create `packages/sdk/src/authoring/types.ts`:

```ts
/**
 * A typed OmniFocus script authored as a TypeScript function. The function's
 * source is serialized to OmniJS at emit time; it must be self-contained
 * (referencing only its parameter, locally-declared bindings, and OmniFocus
 * globals — never closures or imports).
 *
 * @public
 */
export interface OmniScript<Args, T> {
  readonly kind: "script";
  /** The serialized function source (from `Function.prototype.toString()`). */
  readonly source: string;
  /** Phantom carriers for the args/return types (never present at runtime). */
  readonly __args?: Args;
  readonly __result?: T;
}

/**
 * A typed OmniFocus plugin action (the `perform` body of a `PlugIn.Action`).
 *
 * @public
 */
export interface OmniAction {
  readonly kind: "action";
  readonly performSource: string;
  readonly validateSource: string | null;
}
```

- [ ] **Step 4: Write `defineOmniScript`**

Create `packages/sdk/src/authoring/define.ts`:

```ts
import type { OmniScript } from "./types.js";

/**
 * Capture a typed function as an {@link OmniScript}. The body must be
 * self-contained (no closures/imports); the ESLint rule
 * `no-omniscript-closure` enforces this at author time.
 *
 * @public
 */
export function defineOmniScript<Args, T>(
  fn: (args: Args) => T,
): OmniScript<Args, T> {
  if (typeof fn !== "function") {
    throw new TypeError("defineOmniScript expects a function");
  }
  return { kind: "script", source: fn.toString() };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/define.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/authoring tests/unit/authoring 2>/dev/null; git add packages/sdk
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(sdk): add defineOmniScript and authoring types"
```

---

## Task 3: `defineOmniAction` (plugin action shape)

**Files:**
- Modify: `packages/sdk/src/authoring/define.ts`
- Test: `packages/sdk/tests/unit/authoring/define-action.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/tests/unit/authoring/define-action.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defineOmniAction } from "../../../src/authoring/define.js";

describe("defineOmniAction", () => {
  it("captures perform and validate sources", () => {
    const action = defineOmniAction(
      (selection) => {
        void selection;
      },
      { validate: (selection) => selection.tasks.length > 0 },
    );
    expect(action.kind).toBe("action");
    expect(action.performSource).toContain("selection");
    expect(action.validateSource).toContain("tasks.length");
  });

  it("defaults validateSource to null when no validate is given", () => {
    const action = defineOmniAction(() => {});
    expect(action.validateSource).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/define-action.test.ts`
Expected: FAIL — `defineOmniAction` is not exported.

- [ ] **Step 3: Add `defineOmniAction`**

Append to `packages/sdk/src/authoring/define.ts`:

```ts
import type { OmniAction } from "./types.js";

/** Minimal structural type for the OmniJS `Selection` global. */
interface OmniSelectionLike {
  readonly tasks: readonly unknown[];
  readonly projects: readonly unknown[];
}

/**
 * Capture a typed plugin-action body as an {@link OmniAction}.
 *
 * @public
 */
export function defineOmniAction(
  perform: (selection: OmniSelectionLike, sender: unknown) => void,
  options?: {
    validate?: (selection: OmniSelectionLike, sender: unknown) => boolean;
  },
): OmniAction {
  if (typeof perform !== "function") {
    throw new TypeError("defineOmniAction expects a function");
  }
  return {
    kind: "action",
    performSource: perform.toString(),
    validateSource: options?.validate ? options.validate.toString() : null,
  };
}
```

(Note: the `Selection`/`Task` ambient globals from `@ofocus/omnijs-types` are what an author references inside the body; the SDK's own signature uses the minimal structural `OmniSelectionLike` so the SDK does not depend on the ambient package at the type level.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/define-action.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(sdk): add defineOmniAction for plugin action bodies"
```

---

## Task 4: Args serialization (`composeScriptBody`)

**Files:**
- Create: `packages/sdk/src/authoring/serialize.ts`
- Test: `packages/sdk/tests/unit/authoring/serialize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/tests/unit/authoring/serialize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeScriptBody } from "../../../src/authoring/serialize.js";

describe("composeScriptBody", () => {
  it("injects JSON args and returns a JSON-stringified call of the source", () => {
    const body = composeScriptBody("(a) => a.n + 1", { n: 41 });
    // The body parses args from a double-stringified literal (no interpolation).
    expect(body).toContain("JSON.parse");
    // The body calls the source with the parsed args and stringifies the result.
    expect(body).toContain("return JSON.stringify(((a) => a.n + 1)(");
  });

  it("double-stringifies args so quotes cannot break out of the literal", () => {
    const body = composeScriptBody("(a) => a", { evil: '"});alert(1);//' });
    // The raw payload must not appear unescaped as code.
    expect(body).not.toContain('"});alert(1);//"');
    expect(body).toContain("JSON.parse(");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/serialize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `composeScriptBody`**

Create `packages/sdk/src/authoring/serialize.ts` (mirrors the double-stringify pattern in `commands/evaluate.ts`):

```ts
/**
 * Compose the OmniJS body for an osascript-run script: inject the JSON args as
 * a parsed constant and return the JSON-stringified result of calling the
 * serialized function with them. Args are double-stringified so no value can
 * break out of the literal into executable code.
 *
 * @public
 */
export function composeScriptBody(
  source: string,
  args: Record<string, unknown> | undefined,
): string {
  const argsJson = JSON.stringify(args ?? {});
  const argsLiteral = JSON.stringify(argsJson);
  return `var __args = JSON.parse(${argsLiteral});\nreturn JSON.stringify((${source})(__args));`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/serialize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(sdk): add composeScriptBody args serialization"
```

---

## Task 5: osascript backend (`runOmniScript`)

**Files:**
- Create: `packages/sdk/src/authoring/backend-osascript.ts`
- Test: `packages/sdk/tests/unit/authoring/backend-osascript.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/tests/unit/authoring/backend-osascript.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OmniJSResult } from "../../../src/omnijs.js";

vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
}));

import { runOmniScript } from "../../../src/authoring/backend-osascript.js";
import { defineOmniScript } from "../../../src/authoring/define.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRun = vi.mocked(runOmniJSWrapped);

describe("runOmniScript", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits a composed body and returns the decoded result on success", async () => {
    mockRun.mockResolvedValue({ success: true, data: 42 } as OmniJSResult<number>);
    const script = defineOmniScript((args: { n: number }) => args.n + 1);

    const result = await runOmniScript(script, { n: 41 });

    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
    const body = mockRun.mock.calls[0]![0] as string;
    expect(body).toContain("JSON.parse");
    expect(body).toContain("return JSON.stringify(");
  });

  it("propagates a structured failure", async () => {
    mockRun.mockResolvedValue({
      success: false,
      error: { code: "SCRIPT_ERROR", message: "boom" },
    } as unknown as OmniJSResult<number>);
    const script = defineOmniScript(() => 1);

    const result = await runOmniScript(script, {});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("SCRIPT_ERROR");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/backend-osascript.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `runOmniScript`**

Create `packages/sdk/src/authoring/backend-osascript.ts`:

```ts
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runOmniJSWrapped } from "../omnijs.js";
import { composeScriptBody } from "./serialize.js";
import type { OmniScript } from "./types.js";

/**
 * Run an {@link OmniScript} via osascript (macOS, headless). The script's
 * declared return type flows through to `data`.
 *
 * @public
 */
export async function runOmniScript<Args extends Record<string, unknown>, T>(
  script: OmniScript<Args, T>,
  args: Args,
): Promise<CliOutput<T>> {
  const body = composeScriptBody(script.source, args);
  const result = await runOmniJSWrapped<T>(body);
  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.SCRIPT_ERROR, "OmniScript execution failed"),
    );
  }
  return success(result.data as T);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/backend-osascript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(sdk): add osascript backend (runOmniScript)"
```

---

## Task 6: Plugin emit (`compileActionToPlugin`)

**Files:**
- Create: `packages/sdk/src/authoring/plugin-emit.ts`
- Test: `packages/sdk/tests/unit/authoring/plugin-emit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/tests/unit/authoring/plugin-emit.test.ts` (assertions trace to spec §4.2):

```ts
import { describe, it, expect } from "vitest";
import { defineOmniAction } from "../../../src/authoring/define.js";
import { compileActionToPlugin } from "../../../src/authoring/plugin-emit.js";

describe("compileActionToPlugin", () => {
  const action = defineOmniAction(() => {}, { validate: () => true });
  const meta = {
    identifier: "com.ofocus.test.sample",
    version: "1.0",
    label: "Sample",
  };

  it("emits a metadata comment header with required keys (spec §4.2)", () => {
    const file = compileActionToPlugin(action, meta);
    expect(file.startsWith("/*{")).toBe(true);
    const header = JSON.parse(file.slice(2, file.indexOf("}*/") + 1)) as Record<string, unknown>;
    expect(header.type).toBe("action");
    expect(header.targets).toEqual(["omnifocus"]);
    expect(header.identifier).toBe("com.ofocus.test.sample");
    expect(header.version).toBe("1.0");
  });

  it("wraps the action in the PlugIn.Action self-invoking template", () => {
    const file = compileActionToPlugin(action, meta);
    expect(file).toContain("new PlugIn.Action(");
    expect(file).toContain("action.validate =");
    expect(file).toContain("return action;");
  });

  it("defaults validate to `() => true` when the action has none", () => {
    const noValidate = defineOmniAction(() => {});
    const file = compileActionToPlugin(noValidate, meta);
    expect(file).toContain("action.validate = (() => true);");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/plugin-emit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `compileActionToPlugin`**

Create `packages/sdk/src/authoring/plugin-emit.ts`:

```ts
import type { OmniAction } from "./types.js";

/**
 * Metadata for a single-file OmniFocus plugin. `type`/`targets` are fixed for
 * v1 (an OmniFocus action); the rest is author-supplied. See spec §4.2.
 *
 * @public
 */
export interface OmniActionMetadata {
  identifier: string;
  version: string;
  label: string;
  shortLabel?: string;
  paletteLabel?: string;
  description?: string;
  author?: string;
  /** SF Symbol name. */
  image?: string;
}

/**
 * Compile an {@link OmniAction} into single-file `.omnijs` source: a metadata
 * comment header followed by the self-invoking `PlugIn.Action` template.
 *
 * @public
 */
export function compileActionToPlugin(
  action: OmniAction,
  meta: OmniActionMetadata,
): string {
  const header = {
    type: "action",
    targets: ["omnifocus"],
    identifier: meta.identifier,
    version: meta.version,
    label: meta.label,
    ...(meta.shortLabel !== undefined ? { shortLabel: meta.shortLabel } : {}),
    ...(meta.paletteLabel !== undefined ? { paletteLabel: meta.paletteLabel } : {}),
    ...(meta.description !== undefined ? { description: meta.description } : {}),
    ...(meta.author !== undefined ? { author: meta.author } : {}),
    ...(meta.image !== undefined ? { image: meta.image } : {}),
  };
  const validate = action.validateSource ?? "(() => true)";
  return (
    `/*${JSON.stringify(header)}*/\n` +
    `(() => {\n` +
    `  const action = new PlugIn.Action(${action.performSource});\n` +
    `  action.validate = ${validate};\n` +
    `  return action;\n` +
    `})();\n`
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/plugin-emit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(sdk): emit single-file .omnijs plugins from OmniActions"
```

---

## Task 7: Plug-Ins folder resolution + install backend

**Files:**
- Create: `packages/sdk/src/authoring/plugins-dir.ts`
- Create: `packages/sdk/src/authoring/backend-plugin-install.ts`
- Test: `packages/sdk/tests/unit/authoring/plugin-install.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/tests/unit/authoring/plugin-install.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolvePluginsDir } from "../../../src/authoring/plugins-dir.js";
import { installOmniAction } from "../../../src/authoring/backend-plugin-install.js";
import { defineOmniAction } from "../../../src/authoring/define.js";

describe("plugin-install backend", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ofocus-home-"));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it("resolves the OmniFocus 4 container Plug-Ins path under a given home", () => {
    const dir = resolvePluginsDir({ home });
    expect(dir).toBe(
      join(
        home,
        "Library/Containers/com.omnigroup.OmniFocus4/Data/Library/Application Support/Plug-Ins",
      ),
    );
  });

  it("writes the compiled .omnijs into the Plug-Ins folder", async () => {
    const action = defineOmniAction(() => {});
    const result = await installOmniAction(
      action,
      { identifier: "com.ofocus.test.sample", version: "1.0", label: "Sample" },
      { home, fileName: "sample.omnijs" },
    );
    expect(result.success).toBe(true);
    const path = join(resolvePluginsDir({ home }), "sample.omnijs");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("new PlugIn.Action(");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/plugin-install.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `resolvePluginsDir`**

Create `packages/sdk/src/authoring/plugins-dir.ts`:

```ts
import { homedir } from "node:os";
import { join } from "node:path";

/** Container-relative path to the OmniFocus 4 Plug-Ins folder. */
const OF4_PLUGINS_REL =
  "Library/Containers/com.omnigroup.OmniFocus4/Data/Library/Application Support/Plug-Ins";

/**
 * Resolve the OmniFocus 4 Plug-Ins directory. v1 targets the standard
 * `com.omnigroup.OmniFocus4` container (verified 2026-06-08, build 185.15).
 *
 * @public
 */
export function resolvePluginsDir(opts: { home?: string } = {}): string {
  return join(opts.home ?? homedir(), OF4_PLUGINS_REL);
}
```

- [ ] **Step 4: Write `installOmniAction`**

Create `packages/sdk/src/authoring/backend-plugin-install.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { compileActionToPlugin, type OmniActionMetadata } from "./plugin-emit.js";
import { resolvePluginsDir } from "./plugins-dir.js";
import type { OmniAction } from "./types.js";

export interface InstallResult {
  /** Absolute path the plugin was written to. */
  path: string;
}

/**
 * Compile an {@link OmniAction} and install it by writing a single-file
 * `.omnijs` into the OmniFocus Plug-Ins folder. OmniFocus live-loads it; no
 * approval sheet (verified 2026-06-08). Note: uninstall requires an OmniFocus
 * relaunch — deleting the file does not live-unload it.
 *
 * @public
 */
export async function installOmniAction(
  action: OmniAction,
  meta: OmniActionMetadata,
  opts: { home?: string; fileName?: string } = {},
): Promise<CliOutput<InstallResult>> {
  const dir = resolvePluginsDir({ ...(opts.home !== undefined ? { home: opts.home } : {}) });
  const fileName = opts.fileName ?? `${meta.identifier}.omnijs`;
  const path = join(dir, fileName);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path, compileActionToPlugin(action, meta), "utf8");
    return success({ path });
  } catch (err) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        err instanceof Error ? err.message : "Failed to install plugin",
      ),
    );
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit/authoring/plugin-install.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(sdk): add plugin-install backend (resolve Plug-Ins dir + write .omnijs)"
```

---

## Task 8: Self-contained guardrail (ESLint rule)

**Files:**
- Create: `tools/eslint-rules/no-omniscript-closure.mjs`
- Create: `tools/eslint-rules/no-omniscript-closure.test.mjs`
- Modify: the repo's ESLint flat config (`eslint.config.*`) to register the rule

- [ ] **Step 1: Write the failing RuleTester test**

Create `tools/eslint-rules/no-omniscript-closure.test.mjs`:

```js
import { RuleTester } from "eslint";
import rule from "./no-omniscript-closure.mjs";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-omniscript-closure", rule, {
  valid: [
    // References only its own param + a known OmniFocus global.
    `defineOmniScript((args) => { return flattenedTasks.byId(args.id); });`,
    // A locally-declared binding is fine.
    `defineOmniScript((args) => { const n = args.id.length; return n; });`,
  ],
  invalid: [
    {
      // `outer` is a closed-over module-scope binding — not allowed.
      code: `const outer = 1; defineOmniScript((args) => { return outer + args.n; });`,
      errors: [{ messageId: "closure" }],
    },
  ],
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/eslint-rules/no-omniscript-closure.test.mjs`
Expected: FAIL — cannot find module `./no-omniscript-closure.mjs`.

- [ ] **Step 3: Write the rule**

Create `tools/eslint-rules/no-omniscript-closure.mjs`:

```js
// Flags references inside a defineOmniScript/defineOmniAction callback that
// resolve to an outer (module/function) scope binding — the "self-contained
// function" footgun. OmniFocus globals are unresolved identifiers (no binding),
// so they are allowed; closed-over bindings resolve to a non-global scope.
const WRAPPERS = new Set(["defineOmniScript", "defineOmniAction"]);

export default {
  meta: {
    type: "problem",
    docs: { description: "OmniJS script/action bodies must be self-contained." },
    messages: {
      closure:
        "'{{name}}' is closed over from an outer scope; OmniJS bodies run in a separate global and cannot reference closures or imports.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    function checkCallback(node) {
      const scope = sourceCode.getScope(node);
      for (const ref of scope.through) {
        // `through` references resolve outside the callback. A reference with a
        // resolved variable points at an outer binding (closure); an unresolved
        // one is a global (allowed — OmniFocus provides it at runtime).
        if (ref.resolved && ref.identifier) {
          context.report({
            node: ref.identifier,
            messageId: "closure",
            data: { name: ref.identifier.name },
          });
        }
      }
    }
    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          WRAPPERS.has(node.callee.name) &&
          node.arguments[0] &&
          (node.arguments[0].type === "ArrowFunctionExpression" ||
            node.arguments[0].type === "FunctionExpression")
        ) {
          checkCallback(node.arguments[0]);
        }
      },
    };
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/eslint-rules/no-omniscript-closure.test.mjs`
Expected: PASS (1 valid set + invalid case report `closure`).

- [ ] **Step 5: Register the rule in the repo's ESLint flat config**

In the repo's `eslint.config.*` (ESLint 9 flat config), import the rule and expose it as a local plugin, then enable it for `packages/**/*.ts`:

```js
import omniscriptClosure from "./tools/eslint-rules/no-omniscript-closure.mjs";

// inside the exported config array, add a config object:
{
  files: ["packages/**/*.ts"],
  plugins: { ofocus: { rules: { "no-omniscript-closure": omniscriptClosure } } },
  rules: { "ofocus/no-omniscript-closure": "error" },
}
```

Run: `pnpm lint` — expect no new violations in the current tree.

- [ ] **Step 6: Commit**

```bash
git add tools/eslint-rules eslint.config.*
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(lint): add no-omniscript-closure self-contained guardrail rule"
```

---

## Task 9: Wire exports + governance

**Files:**
- Create: `packages/sdk/src/authoring/index.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/api-report/ofocus-sdk.api.md` (regenerated)
- Create: `.changeset/typed-omniautomation-foundation.md`

- [ ] **Step 1: Create the authoring barrel**

Create `packages/sdk/src/authoring/index.ts`:

```ts
export { defineOmniScript, defineOmniAction } from "./define.js";
export type { OmniScript, OmniAction } from "./types.js";
export { composeScriptBody } from "./serialize.js";
export { runOmniScript } from "./backend-osascript.js";
export { compileActionToPlugin } from "./plugin-emit.js";
export type { OmniActionMetadata } from "./plugin-emit.js";
export { resolvePluginsDir } from "./plugins-dir.js";
export { installOmniAction } from "./backend-plugin-install.js";
export type { InstallResult } from "./backend-plugin-install.js";
```

- [ ] **Step 2: Re-export from the SDK entrypoint**

Append to `packages/sdk/src/index.ts`:

```ts
// Typed OmniAutomation authoring (defineOmniScript/defineOmniAction + backends)
export {
  defineOmniScript,
  defineOmniAction,
  composeScriptBody,
  runOmniScript,
  compileActionToPlugin,
  resolvePluginsDir,
  installOmniAction,
} from "./authoring/index.js";
export type {
  OmniScript,
  OmniAction,
  OmniActionMetadata,
  InstallResult,
} from "./authoring/index.js";
```

- [ ] **Step 3: Build + regenerate the API report**

Run: `cd packages/sdk && pnpm build`
Expected: `tsc --build` succeeds; `api-extractor run --local` updates `api-report/ofocus-sdk.api.md` with the new exports. Review the diff — it should add `defineOmniScript`, `defineOmniAction`, `runOmniScript`, etc.

- [ ] **Step 4: Add a changeset**

Create `.changeset/typed-omniautomation-foundation.md`:

```md
---
"@ofocus/sdk": minor
"@ofocus/omnijs-types": minor
---

Add typed OmniAutomation authoring: `defineOmniScript`/`defineOmniAction`
compile type-checked TypeScript to OmniJS, runnable via `osascript`
(`runOmniScript`) or installable as a headless single-file plugin
(`installOmniAction`). Adds the `@ofocus/omnijs-types` ambient-types package.
```

> **Governance note:** Per spec §7/§9, `@ofocus/omnijs-types` is API-Extractor-governed via its dedicated exported-types entry (`src/index.ts` → `api-report/ofocus-omnijs-types.api.md`, set up in Task 1). The SDK's new runtime surface is governed by the SDK's existing API Extractor (this task). Both reports are committed.

- [ ] **Step 5: Verify the whole workspace builds and tests pass**

Run: `pnpm build && pnpm test`
Expected: PASS across packages.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk .changeset
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(sdk): export typed authoring surface; add changeset"
```

---

## Task 10: UAT — encode today's probes as gated end-to-end tests

**Files:**
- Create: `packages/sdk/tests/uat/authoring-roundtrip.uat.test.ts`
- Modify: `packages/sdk/vitest.config.ts` (include `tests/uat`)

**Note:** These run only when OmniFocus is installed and are skipped in CI. They encode the two round-trips verified by hand on 2026-06-08 (spec §8).

- [ ] **Step 1: Write the gated UAT**

Create `packages/sdk/tests/uat/authoring-roundtrip.uat.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { defineOmniScript } from "../../src/authoring/define.js";
import { defineOmniAction } from "../../src/authoring/define.js";
import { runOmniScript } from "../../src/authoring/backend-osascript.js";
import { installOmniAction } from "../../src/authoring/backend-plugin-install.js";
import { resolvePluginsDir } from "../../src/authoring/plugins-dir.js";
import { runOmniJSWrapped } from "../../src/omnijs.js";

const hasOmniFocus = existsSync("/Applications/OmniFocus.app");
const d = hasOmniFocus ? describe : describe.skip;

d("typed authoring round-trips (live OmniFocus)", () => {
  it("defineOmniScript -> osascript returns the computed value", async () => {
    const script = defineOmniScript((args: { a: number; b: number }) => args.a + args.b);
    const result = await runOmniScript(script, { a: 2, b: 40 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(42); // computed inside OmniFocus, not in Node
  });

  it("defineOmniAction -> install makes PlugIn.all include the identifier", async () => {
    const id = "com.ofocus.test.uat-roundtrip";
    const action = defineOmniAction(() => {});
    const installed = await installOmniAction(action, {
      identifier: id,
      version: "1.0",
      label: "UAT Roundtrip",
    });
    expect(installed.success).toBe(true);
    try {
      const ids = await runOmniJSWrapped<string[]>(
        "return JSON.stringify(PlugIn.all.map(function(p){return p.identifier}));",
      );
      expect(ids.success).toBe(true);
      expect(ids.data).toContain(id);
    } finally {
      // Disk cleanup (note: OmniFocus keeps it in PlugIn.all until relaunch — spec §8).
      if (installed.success && installed.data) {
        rmSync(join(resolvePluginsDir(), `${id}.omnijs`), { force: true });
      }
    }
  });
});
```

- [ ] **Step 2: Include the UAT directory in the Vitest config**

Modify `packages/sdk/vitest.config.ts` — change `include`:

```ts
    include: ["tests/unit/**/*.test.ts", "tests/uat/**/*.uat.test.ts"],
```

- [ ] **Step 3: Run the UAT locally (with OmniFocus running)**

Run: `cd packages/sdk && pnpm exec vitest run tests/uat/authoring-roundtrip.uat.test.ts`
Expected (OmniFocus present): both tests PASS. Expected (no OmniFocus): both SKIP.

- [ ] **Step 4: Confirm CI safety**

Run: `cd packages/sdk && pnpm exec vitest run tests/unit` (the default unit run is unaffected by the new UAT glob since UAT files end in `.uat.test.ts`).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk
git commit --author="Mike North <michael.l.north@gmail.com>" -m "test(sdk): add gated UAT for typed authoring round-trips"
```

---

## Final verification

- [ ] Run `/clean_blt` (clean build + lint + test across the workspace). Fix any failure and re-run until green.
- [ ] Confirm `packages/sdk/api-report/ofocus-sdk.api.md` reflects the new exports and is committed.
- [ ] Confirm the changeset is present.

---

## Self-review (completed during planning)

- **Spec coverage:** §2 primitives → Tasks 2–3; §2.3 mechanism (toString) → Tasks 2–4, guardrail → Task 8; §3 ambient types → Task 1; §4.1 osascript backend → Tasks 4–5; §4.2 plugin emit + install + path resolution + uninstall caveat → Tasks 6–7; §7 governance → Task 1 (omnijs-types report) + Task 9 (SDK report); §9 testing (unit + gated UAT encoding §8 findings) → Tasks 2–10. **Not in this plan (correctly):** roadmap-doc reconciliation (§11) and the A3 capability are separate change sets per their own specs.
- **Placeholder scan:** no TBD/TODO; every code step contains complete code.
- **Type consistency:** `OmniScript`/`OmniAction` (Task 2/3) are consumed unchanged by Tasks 4–7 and exported in Task 9; `OmniActionMetadata` (Task 6) is reused by Task 7; `resolvePluginsDir({ home })` signature is identical in Tasks 7 and 10.

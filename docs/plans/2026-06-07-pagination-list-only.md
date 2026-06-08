# Pagination-Only-For-List-Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/specs/2026-06-06-pagination-list-only-design.md`](../specs/2026-06-06-pagination-list-only-design.md)

**Goal:** Reject `--limit`/`--offset` when combined with any non-list shape modifier (`--ids-only`, `--count`, `--first`, `--last`, `--group-by`), turning today's silent-ignore into a clear `VALIDATION_ERROR`.

**Architecture:** Add a single check in `compileAggregate` (the one place that resolves result shape and already collects `validationErrors`); all eight list-command handlers call it and surface its first error, so no per-handler boilerplate. Separately, consolidate the duplicated `limit`/`offset`/`all` descriptor fields into a shared `listPaginationSchema` fragment so the new doc note lives in one place.

**Tech Stack:** TypeScript (strict), Zod descriptors, Vitest, Changesets, API Extractor. Package manager: `pnpm`. Repo is a monorepo; the change is entirely in `@ofocus/sdk`.

---

## File Structure

- **Modify** `packages/sdk/src/query/aggregate.ts` — add the pagination-vs-shape rejection inside `compileAggregate`.
- **Modify** `packages/sdk/tests/unit/query/aggregate.test.ts` — unit coverage for the new rule.
- **Modify** `packages/sdk/tests/unit/commands/tasks.test.ts` — command-level regression coverage.
- **Modify** `packages/sdk/src/query/list-schema.ts` — add `listPaginationSchema` fragment with the doc note.
- **Modify** the 8 list commands under `packages/sdk/src/commands/` (`tasks`, `projects`, `tags`, `folders`, `search`, `deferred`, `forecast`, `subtasks`) — replace inline `limit`/`offset`/`all` with `...listPaginationSchema`.
- **Add** `.changeset/<name>.md` — `patch` for `@ofocus/sdk`.
- **Regenerate** `AGENT_CLI_INSTRUCTIONS.md`, `skills/ofocus/SKILL.md`, and `packages/sdk/api-report/ofocus-sdk.api.md` via build; commit.

---

## Task 1: Reject pagination with non-list shapes in `compileAggregate`

**Files:**
- Modify: `packages/sdk/src/query/aggregate.ts` (insert after the existing mutual-exclusivity block, ~line 69, before `const withStats`)
- Test: `packages/sdk/tests/unit/query/aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block inside the top-level `describe("compileAggregate", …)` in `aggregate.test.ts` (imports `compileAggregate` and `ErrorCode` already exist at the top of the file):

```ts
describe("pagination applies only to list output", () => {
  const cases = [
    { opt: { idsOnly: true }, flag: "--ids-only" },
    { opt: { count: true }, flag: "--count" },
    { opt: { first: true }, flag: "--first" },
    { opt: { last: true }, flag: "--last" },
    { opt: { groupBy: "project" }, flag: "--group-by" },
  ] as const;

  for (const { opt, flag } of cases) {
    it(`rejects ${flag} combined with limit`, () => {
      const r = compileAggregate({ ...opt, limit: 5 });
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(r.validationErrors[0]?.message).toBe(
        `Cannot combine --limit/--offset with ${flag}`
      );
    });

    it(`rejects ${flag} combined with offset`, () => {
      const r = compileAggregate({ ...opt, offset: 10 });
      expect(r.validationErrors[0]?.message).toBe(
        `Cannot combine --limit/--offset with ${flag}`
      );
    });

    it(`allows ${flag} with neither limit nor offset`, () => {
      const r = compileAggregate(opt);
      expect(
        r.validationErrors.some((e) =>
          e.message.startsWith("Cannot combine --limit/--offset")
        )
      ).toBe(false);
    });
  }

  it("allows limit/offset on the default list shape", () => {
    const r = compileAggregate({ limit: 5, offset: 10 });
    expect(r.shape).toBe("list");
    expect(r.validationErrors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @ofocus/sdk exec vitest run tests/unit/query/aggregate.test.ts`
Expected: FAIL — the `rejects …` cases fail (no validation error is produced today).

- [ ] **Step 3: Implement the rejection**

In `packages/sdk/src/query/aggregate.ts`, immediately after the existing `if (setFlags.length > 1) { … }` block and before `const withStats = options.stats === true;`, insert:

```ts
  // Pagination (--limit/--offset) is meaningful only for the default `list`
  // shape. Every non-list shape maps over the full result set, so combining it
  // with limit/offset would silently ignore them — reject instead. (`--all` is
  // already rejected with these modifiers by validateAllFlag.) Keys off the
  // user-provided values; the default limit applied later in the handler is
  // unaffected.
  const firstShapeFlag = setFlags[0];
  if (
    firstShapeFlag !== undefined &&
    (options.limit !== undefined || options.offset !== undefined)
  ) {
    const modifier =
      "--" + firstShapeFlag.name.replace(/([A-Z])/g, "-$1").toLowerCase();
    validationErrors.push(
      createError(
        ErrorCode.VALIDATION_ERROR,
        `Cannot combine --limit/--offset with ${modifier}`,
        "Pagination applies only to list output; remove --limit/--offset or drop the shape modifier."
      )
    );
  }
```

Note: `firstShapeFlag.name` is one of `count`/`first`/`last`/`idsOnly`/`groupBy`; the kebab-case derivation yields `--count`/`--first`/`--last`/`--ids-only`/`--group-by`. `createError` and `ErrorCode` are already imported at the top of the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @ofocus/sdk exec vitest run tests/unit/query/aggregate.test.ts`
Expected: PASS (all existing + new cases).

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/query/aggregate.ts packages/sdk/tests/unit/query/aggregate.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" -m "fix(sdk): reject --limit/--offset with non-list shape modifiers"
```

---

## Task 2: Command-level regression coverage in `tasks.test.ts`

These exercise the full `queryTasks` path (validation → no OmniJS call) and guard the #71 behavior. They pass once Task 1 is in; they are layer-2 (handler) guards, not red-first.

**Files:**
- Test: `packages/sdk/tests/unit/commands/tasks.test.ts`

- [ ] **Step 1: Add the tests**

Append a new `describe` block inside the top-level `describe("queryTasks", …)` (the file already mocks `runOmniJSWrapped` as `mockRunOmniJS`, imports `ErrorCode`, `OFTask`, `OmniJSResult`, `QueryResult`, and clears mocks between tests):

```ts
describe("pagination + shape modifiers (pagination applies only to list output)", () => {
  it("rejects --ids-only combined with --limit and makes no OmniJS call", async () => {
    const result = await queryTasks({ idsOnly: true, limit: 5 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toBe(
      "Cannot combine --limit/--offset with --ids-only"
    );
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("rejects --count combined with --offset and makes no OmniJS call", async () => {
    const result = await queryTasks({ count: true, offset: 10 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toBe(
      "Cannot combine --limit/--offset with --count"
    );
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("still allows bare --ids-only (returns all ids)", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { kind: "ids", ids: ["a", "b"] },
    } as OmniJSResult<QueryResult<OFTask>>);
    const result = await queryTasks({ idsOnly: true });
    expect(result.success).toBe(true);
    expect(result.data?.kind).toBe("ids");
    expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
  });

  it("still allows --ids-only --all (issue #71 preserved)", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { kind: "ids", ids: ["a", "b"] },
    } as OmniJSResult<QueryResult<OFTask>>);
    const result = await queryTasks({ idsOnly: true, all: true });
    expect(result.success).toBe(true);
    expect(result.data?.kind).toBe("ids");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @ofocus/sdk exec vitest run tests/unit/commands/tasks.test.ts`
Expected: PASS (all existing + new cases). If a new test reaches OmniJS unexpectedly, confirm the file has a `beforeEach`/`afterEach` that calls `vi.clearAllMocks()`; the existing `--all` rejection tests depend on it.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/tests/unit/commands/tasks.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" -m "test(sdk): regression coverage for pagination + shape modifier rejection"
```

---

## Task 3: Shared `listPaginationSchema` fragment + doc note + command refactor

**Files:**
- Modify: `packages/sdk/src/query/list-schema.ts` (add the fragment next to `listProjectionSchema`/`listSortSchema`)
- Modify: the 8 commands — `packages/sdk/src/commands/{tasks,projects,tags,folders,search,deferred,forecast,subtasks}.ts`
- Possibly modify: `packages/sdk/tests/unit/commands/tasks-descriptors.test.ts`, `packages/cli/tests/unit/commands-registry.test.ts`, `packages/mcp/tests/tools.test.ts` (only if they assert the old describe text)

- [ ] **Step 1: Add the shared fragment**

In `packages/sdk/src/query/list-schema.ts` (which already `import { z } from "zod";`), add:

```ts
/**
 * Shared Zod schema fragment for pagination on the standard list commands.
 *
 * `limit`/`offset` slice the default `list` output; combining them with a shape
 * modifier (`--ids-only`, `--count`, `--first`, `--last`, `--group-by`) is
 * rejected because those shapes return the full match set. `all` materialises
 * everything and is mutually exclusive with `limit`/`offset`.
 *
 * @public
 */
export const listPaginationSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Maximum number of results to return (default: 100). Applies only to list output — cannot be combined with shape modifiers such as --ids-only or --count."
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Number of results to skip for pagination. Applies only to list output — cannot be combined with shape modifiers such as --ids-only or --count."
    ),
  all: z
    .boolean()
    .optional()
    .describe(
      "When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset."
    ),
} as const;
```

- [ ] **Step 2: Refactor the 8 commands to use it**

In each of `packages/sdk/src/commands/{tasks,projects,tags,folders,search,deferred,forecast,subtasks}.ts`:
1. Ensure the file imports the fragment. If it already imports from `../query/list-schema.js` (e.g. `listProjectionSchema`), add `listPaginationSchema` to that import; otherwise add `import { listPaginationSchema } from "../query/list-schema.js";`.
2. Locate the inline pagination block in the command's Zod `inputSchema` — it looks like (wording varies slightly per file):

   ```ts
       limit: z.number().int().min(1).optional().describe("Maximum number of results to return…"),
       offset: z.number().int().min(0).optional().describe("Number of results to skip for pagination"),
       all: z.boolean().optional().describe("When true, return every matching … ignoring --limit/--offset. Mutually exclusive with --limit and --offset."),
   ```

   Replace those three field definitions with a single spread:

   ```ts
       ...listPaginationSchema,
   ```

   Keep the surrounding `// ── Pagination ──` comment if present. Do **not** touch the shape-modifier fields (`count`/`idsOnly`/`first`/`last`/`groupBy`) — those exist inline only in `tasks.ts` and stay as-is. Do **not** touch `perspectives.ts` (it has a bespoke `limit`-only schema).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @ofocus/sdk run build:tsc`
Expected: clean (exit 0). Fix any missing-import errors.

- [ ] **Step 4: Run the SDK + dependent descriptor tests**

Run:
```bash
pnpm --filter @ofocus/sdk exec vitest run
pnpm --filter @ofocus/cli exec vitest run tests/unit/commands-registry.test.ts
pnpm --filter @ofocus/mcp exec vitest run tests/tools.test.ts
```
Expected: PASS. If a test asserts the **old** `limit`/`offset`/`all` description text verbatim, update that assertion to the new shared wording (the flag keys and types are unchanged — only the `.describe()` strings changed). Do not weaken structural assertions.

- [ ] **Step 5: Regenerate generated artifacts**

Run: `pnpm --filter @ofocus/sdk build` (updates the API report for the new `listPaginationSchema` export) and `pnpm build` (regenerates agent docs).
Then check what changed:
```bash
git status --short
```
Expected changes: `packages/sdk/api-report/ofocus-sdk.api.md` (adds `listPaginationSchema`), `AGENT_CLI_INSTRUCTIONS.md`, `skills/ofocus/SKILL.md`, `AGENT_INSTRUCTIONS.md` (updated pagination flag descriptions).

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/query/list-schema.ts packages/sdk/src/commands/ \
  packages/sdk/api-report/ofocus-sdk.api.md AGENT_CLI_INSTRUCTIONS.md AGENT_INSTRUCTIONS.md skills/ofocus/SKILL.md
# include any descriptor-test edits from Step 4
git commit --author="Mike North <michael.l.north@gmail.com>" -m "refactor(sdk): share listPaginationSchema; document pagination is list-only"
```

---

## Task 4: Changeset + full verification + manual check

**Files:**
- Create: `.changeset/pagination-list-only.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/pagination-list-only.md`:

```markdown
---
"@ofocus/sdk": patch
---

Reject `--limit`/`--offset` when combined with a non-list shape modifier (`--ids-only`, `--count`, `--first`, `--last`, `--group-by`). Previously these flags were silently ignored on non-list output; they now return a clear `VALIDATION_ERROR`. Pagination applies only to the default list shape. Also factor the shared `limit`/`offset`/`all` descriptor fields into `listPaginationSchema`.
```

- [ ] **Step 2: Commit the changeset**

```bash
git add .changeset/pagination-list-only.md
git commit --author="Mike North <michael.l.north@gmail.com>" -m "chore: changeset for pagination-list-only"
```

- [ ] **Step 3: Clean build/lint/test from scratch**

Invoke `/clean_blt`. Expected: clean build, lint, and full test suite pass. Note: the live-OmniFocus UAT `temporal.uat.test.ts > today` is a known flaky 5s-timeout against real OmniFocus and is unrelated — re-run that single file if it times out.

- [ ] **Step 4: Manual UAT against real OmniFocus**

Build is already produced by `/clean_blt`. Run the CLI directly and confirm:
```bash
node packages/cli/dist/index.js tasks --ids-only --limit 5    # expect success:false, VALIDATION_ERROR "Cannot combine --limit/--offset with --ids-only"
node packages/cli/dist/index.js tasks --ids-only              # expect success:true, kind: ids, full id list (unchanged)
node packages/cli/dist/index.js tasks --ids-only --all        # expect success:true, kind: ids (unchanged, #71)
node packages/cli/dist/index.js tasks --limit 5               # expect success:true, kind: list, 5 items (unchanged)
```

- [ ] **Step 5: (No commit — verification only.)** If `/clean_blt` regenerated any committed artifact, stage and commit it with an appropriate message.

---

## Self-Review Notes (author)

- **Spec coverage:** the rule (Task 1), error messages (Task 1, exact strings), descriptor doc note + shared fragment with shape modifiers excluded and `perspectives` untouched (Task 3), test plan at both aggregate and command layers (Tasks 1–2), `patch` changeset + agent-doc regeneration (Tasks 3–4), manual UAT matrix (Task 4) — all present.
- **Type/name consistency:** `listPaginationSchema` is defined once (Task 3 Step 1) and referenced by the same name in Step 2; the error message string is identical across Task 1 (unit) and Task 2 (command) assertions.
- **Non-regression:** Task 2 explicitly re-checks bare `--ids-only` and `--ids-only --all` (#71) still succeed.

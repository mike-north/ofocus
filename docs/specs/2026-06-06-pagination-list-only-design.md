# Pagination flags apply only to list output

**Date:** 2026-06-06
**Status:** Approved — ready for implementation plan
**Scope:** `@ofocus/sdk` list-query validation and the list-command descriptor schema. A
follow-up to the #71 fix (which allowed `--ids-only` together with `--all`).

---

## Problem

List queries support two orthogonal axes:

- **Pagination** — `--limit`, `--offset` (slice the result set), and `--all` (materialise
  everything).
- **Shape modifiers** — `--ids-only`, `--count`, `--first`, `--last`, `--group-by` (change the
  *shape* of the response to an id list, a scalar count, a single item, or grouped buckets).

Only the default `list` shape is paginated. Every non-list shape is rendered by mapping over the
full, unsliced `rows` set (`packages/sdk/src/query/index.ts` — the `count`/`ids`/`single-*`/`groups`
cases never call `slice`). As a result `--limit` and `--offset` are **silently ignored** whenever a
shape modifier is set. For example `ofocus tasks --ids-only --limit 5` returns *every* matching id,
not five — with no error and no indication the flags did nothing.

This is a footgun and an inconsistency: `--all` is already *rejected* when combined with these shape
modifiers (`validateAllFlag` in `packages/sdk/src/validation.ts`), but `--limit`/`--offset` are
silently accepted-and-ignored. The two pagination mechanisms should behave the same way.

## The rule

> `--limit` and `--offset` are meaningful only for `list` output. Combining either with any non-list
> shape modifier (`--ids-only`, `--count`, `--first`, `--last`, `--group-by`) is a
> `VALIDATION_ERROR`.

This makes pagination's relationship to shape explicit and uniform with the existing `--all` rule:

| Combination | Before | After |
| --- | --- | --- |
| `--ids-only` (alone) | all ids | all ids (unchanged) |
| `--ids-only --all` | all ids (allowed since #71) | all ids (unchanged) |
| `--ids-only --limit N` | silently all ids | **VALIDATION_ERROR** |
| `--count --offset N` | silently full count | **VALIDATION_ERROR** |
| `--all --count` | VALIDATION_ERROR | VALIDATION_ERROR (unchanged) |
| `list --limit N` | paged | paged (unchanged) |

## Design

### 1. Validation — in `compileAggregate` (one place, universal)

`compileAggregate` (`packages/sdk/src/query/aggregate.ts`) is the single source of truth for shape
resolution: it already computes the set of requested shape modifiers, already returns a
`validationErrors: CliError[]`, and already receives the full `options` (with `limit`/`offset` via
`BaseListQueryOptions extends PaginationOptions`). All eight list handlers call it and surface its
first error.

Add a check immediately after the existing `setFlags` computation: if at least one non-list modifier
is requested **and** `options.limit !== undefined || options.offset !== undefined`, push a
`VALIDATION_ERROR`. Key off the **user-provided** values — the default `limit ?? 100` is applied
later in each handler, so a bare `--ids-only` (no user limit) stays valid and still returns all ids.

This requires **no new per-handler call site** and applies uniformly even to commands that accept the
shape modifiers only programmatically (via the SDK, not the CLI surface).

### 2. Error messages

Mirror the existing `validateAllFlag` style, naming the active modifier:

```
Cannot combine --limit/--offset with --ids-only
Cannot combine --limit/--offset with --count
Cannot combine --limit/--offset with --first
Cannot combine --limit/--offset with --last
Cannot combine --limit/--offset with --group-by
```

The name comes from the first requested non-list modifier (the same ordering `compileAggregate`
already uses to resolve shape). If a user somehow sets two modifiers, the existing
"Mutually exclusive shape modifiers" error and this one may both be present; the handler reports the
first, which is acceptable.

### 3. Descriptor doc note — shared `listPaginationSchema` fragment

`limit`/`offset`/`all` are currently duplicated inline across the eight standard list commands
(`tasks`, `projects`, `tags`, `folders`, `search`, `deferred`, `forecast`, `subtasks`), with slightly
divergent wording. Introduce a shared fragment in `packages/sdk/src/query/list-schema.ts`, matching
the existing `listProjectionSchema` / `listSortSchema` pattern:

```ts
export const listPaginationSchema = {
  limit: z.number().int().min(1).optional().describe(
    "Maximum number of results to return (default: 100). Applies only to list " +
    "output — cannot be combined with shape modifiers such as --ids-only or --count."
  ),
  offset: z.number().int().min(0).optional().describe(
    "Number of results to skip for pagination. Applies only to list output — " +
    "cannot be combined with shape modifiers such as --ids-only or --count."
  ),
  all: z.boolean().optional().describe(
    "When true, return every matching item ignoring --limit/--offset. " +
    "Mutually exclusive with --limit and --offset."
  ),
} as const;
```

Replace the inline `limit`/`offset`/`all` definitions in the eight commands with
`...listPaginationSchema`. This single-sources the doc note and unifies wording to the generic
"item".

**Deliberately excluded:** A `listShapeSchema` fragment for the shape modifiers. Those are exposed on
the descriptor **only by `tasks`** (the other commands accept them programmatically but do not expose
them on their CLI/MCP surface). Spreading a shared shape fragment into all commands would *expand*
their CLI surface — out of scope for this change. Shape modifiers stay defined inline in `tasks.ts`.

**Out of scope:** `perspectives.ts` exposes only `limit` (no `offset`/`all`) and is a specialised,
non-list command; it keeps its own inline `limit` and is not part of the shared fragment.

## Testing

- **`packages/sdk/tests/unit/query/aggregate.test.ts`** — for each non-list modifier
  (`idsOnly`/`count`/`first`/`last`/`groupBy`): `+ limit` → `validationErrors` contains the conflict
  with the spec-defined message; `+ offset` → same; modifier alone → no conflict. Plus `list` (no
  modifier) `+ limit`/`+ offset` → no conflict, and a modifier with neither → no conflict.
- **`packages/sdk/tests/unit/commands/tasks.test.ts`** — command-level regression tests:
  `queryTasks({ idsOnly: true, limit: 5 })` and `queryTasks({ count: true, offset: 10 })` →
  `success: false`, `VALIDATION_ERROR`, and `runOmniJSWrapped` **not** called. Non-regression:
  `queryTasks({ idsOnly: true, all: true })` and bare `queryTasks({ idsOnly: true })` still succeed
  (the latter still reaches OmniJS and returns the `ids` shape).
- **Descriptor tests** — update any descriptor-shape assertions affected by the `...listPaginationSchema`
  spread (e.g. `tasks-descriptors.test.ts`, `commands-registry.test.ts`, `packages/mcp/tests/tools.test.ts`).
- Assertions are derived from this spec (the rule and messages above), not from current program output.

## Versioning & docs

- **Changeset:** `patch` for `@ofocus/sdk` — the previous silent-ignore was a footgun, not an intended
  feature; this turns it into a clear error. No type/`.d.ts` change (the validation lives in
  `compileAggregate` internals; the descriptor fragment is additive), so the api-extractor report is
  unchanged.
- Run `pnpm build` to regenerate the agent docs (`AGENT_CLI_INSTRUCTIONS.md`, `skills/ofocus/SKILL.md`)
  from the updated descriptors and commit the regenerated files.

## Verification

1. `pnpm build` — types compile; commit regenerated agent docs.
2. Targeted tests (aggregate + tasks command suites), then `/clean_blt`.
3. End-to-end against real OmniFocus:
   ```sh
   ofocus tasks --ids-only --limit 5      # expect VALIDATION_ERROR
   ofocus tasks --ids-only                # expect full id list (unchanged)
   ofocus tasks --ids-only --all          # expect full id list (unchanged, #71)
   ofocus tasks --limit 5                 # expect 5 items (unchanged)
   ```

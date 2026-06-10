# Pagination flags apply to list and id-list output

**Date:** 2026-06-06
**Status:** Approved — implemented; amended 2026-06-10
**Scope:** `@ofocus/sdk` list-query validation and the list-command descriptor schema. A
follow-up to the #71 fix (which allowed `--ids-only` together with `--all`).

---

## Amendment — 2026-06-10 (bulk-triage for agents)

The original rule below rejected `--limit`/`--offset` whenever **any** shape modifier was set —
including `--ids-only`. Agents triaging large inboxes need to page through an id list (request a page
of ids, step forward with `--offset`), so this amendment **narrows the rejection to the scalar /
single-item shapes only**:

> Pagination (`--limit`/`--offset`) applies to the `list` shape **and** the `ids` (`--ids-only`)
> shape — both return an ordered collection that can be sliced into pages. Combining pagination with
> a shape that collapses the result set (`--count`, `--first`, `--last`, `--group-by`) remains a
> `VALIDATION_ERROR`.

Semantics for the now-paginatable `ids` shape mirror `list` exactly: by default the matched rows are
sliced by `offset`/`limit` before their primary keys are extracted; `--all` ignores `offset`/`limit`
and returns every matching id (the #71 carve-out). This is a deliberate contract change to support
high-volume agent batch operations (e.g. "delete everything in the inbox except these few"); see
issue #83. The body of this spec below is updated to match; the original "all non-list shapes" wording
is preserved only where it describes the pre-amendment behaviour.

---

## Problem

List queries support two orthogonal axes:

- **Pagination** — `--limit`, `--offset` (slice the result set), and `--all` (materialise
  everything).
- **Shape modifiers** — `--ids-only`, `--count`, `--first`, `--last`, `--group-by` (change the
  _shape_ of the response to an id list, a scalar count, a single item, or grouped buckets).

Originally only the default `list` shape was paginated. Every other shape was rendered by mapping over
the full, unsliced `rows` set (`packages/sdk/src/query/index.ts` — the `count`/`ids`/`single-*`/`groups`
cases never called `slice`). As a result `--limit` and `--offset` were **silently ignored** whenever a
shape modifier was set. For example `ofocus tasks --ids-only --limit 5` returned _every_ matching id,
not five — with no error and no indication the flags did nothing.

This was a footgun and an inconsistency: `--all` was already _rejected_ when combined with these shape
modifiers (`validateAllFlag` in `packages/sdk/src/validation.ts`), but `--limit`/`--offset` were
silently accepted-and-ignored.

The original fix rejected pagination for **all** non-list shapes. The 2026-06-10 amendment refines
this: the `ids` shape is an ordered collection (like `list`), so it is made **paginatable** rather
than rejected — it slices by `offset`/`limit` before extracting primary keys. Only the shapes that
collapse the result set to a scalar or single item stay rejected.

## The rule

> `--limit` and `--offset` apply to the `list` shape **and** the `ids` (`--ids-only`) shape — both
> return an ordered collection that can be paged. Combining either with a shape that collapses the
> result set (`--count`, `--first`, `--last`, `--group-by`) is a `VALIDATION_ERROR`.

This makes pagination's relationship to shape explicit: collection shapes page, scalar/single shapes
do not. (The `ids` shape additionally honours `--all` per #71 — `--all` returns every id, ignoring
`--limit`/`--offset`.)

| Combination                           | Pre-amendment (2026-06-06)  | Current (2026-06-10)                      |
| ------------------------------------- | --------------------------- | ----------------------------------------- |
| `--ids-only` (alone)                  | all ids                     | all ids (unchanged)                       |
| `--ids-only --all`                    | all ids (allowed since #71) | all ids (unchanged)                       |
| `--ids-only --limit N`                | VALIDATION_ERROR            | **paged id list** (slice by offset/limit) |
| `--ids-only --offset N`               | VALIDATION_ERROR            | **paged id list** (slice by offset/limit) |
| `--count --offset N`                  | VALIDATION_ERROR            | VALIDATION_ERROR (unchanged)              |
| `--first/--last/--group-by --limit N` | VALIDATION_ERROR            | VALIDATION_ERROR (unchanged)              |
| `--all --count`                       | VALIDATION_ERROR            | VALIDATION_ERROR (unchanged)              |
| `list --limit N`                      | paged                       | paged (unchanged)                         |

## Design

### 1. Validation — in `compileAggregate` (one place, universal)

`compileAggregate` (`packages/sdk/src/query/aggregate.ts`) is the single source of truth for shape
resolution: it already computes the set of requested shape modifiers, already returns a
`validationErrors: CliError[]`, and already receives the full `options` (with `limit`/`offset` via
`BaseListQueryOptions extends PaginationOptions`). All eight list handlers call it and surface its
first error.

Add a check immediately after the existing `setFlags` computation: if a requested modifier is a
**collapsing** shape (`--count`/`--first`/`--last`/`--group-by` — i.e. any set modifier other than
`--ids-only`) **and** `options.limit !== undefined || options.offset !== undefined`, push a
`VALIDATION_ERROR`. `--ids-only` is excluded from the rejection set: the `ids` shape is paginatable,
so it slices like `list`. Key off the **user-provided** values — the default `limit ?? 100` is applied
later in each handler, so a bare `--ids-only` (no user limit) stays valid and still returns all ids.

The `ids` renderer in `packages/sdk/src/query/index.ts` slices `rows` by `offset`/`limit` before
mapping to primary keys (mirroring the `list` renderer), and returns the full set when `--all` is set.

This requires **no new per-handler call site** and applies uniformly even to commands that accept the
shape modifiers only programmatically (via the SDK, not the CLI surface).

### 2. Error messages

Mirror the existing `validateAllFlag` style, naming the active (collapsing) modifier:

```
Cannot combine --limit/--offset with --count
Cannot combine --limit/--offset with --first
Cannot combine --limit/--offset with --last
Cannot combine --limit/--offset with --group-by
```

(`--ids-only` no longer produces this error — it paginates.)

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
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Maximum number of results to return (default: 100). Applies to list and " +
        "--ids-only output; the scalar shape modifiers (--count/--first/--last/" +
        "--group-by) cannot be combined with --limit/--offset."
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Number of results to skip for pagination. Applies to list and --ids-only " +
        "output; the scalar shape modifiers (--count/--first/--last/--group-by) " +
        "cannot be combined with --limit/--offset."
    ),
  all: z
    .boolean()
    .optional()
    .describe(
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
them on their CLI/MCP surface). Spreading a shared shape fragment into all commands would _expand_
their CLI surface — out of scope for this change. Shape modifiers stay defined inline in `tasks.ts`.

**Out of scope:** `perspectives.ts` exposes only `limit` (no `offset`/`all`) and is a specialised,
non-list command; it keeps its own inline `limit` and is not part of the shared fragment.

## Testing

- **`packages/sdk/tests/unit/query/aggregate.test.ts`** — for each **collapsing** modifier
  (`count`/`first`/`last`/`groupBy`): `+ limit` → `validationErrors` contains the conflict with the
  spec-defined message; `+ offset` → same; modifier alone → no conflict. For `idsOnly`: `+ limit`,
  `+ offset`, and `+ limit + offset` → **no conflict** (the `ids` shape paginates). Plus `list` (no
  modifier) `+ limit`/`+ offset` → no conflict.
- **`packages/sdk/tests/unit/query/index.test.ts`** — the `ids` renderer slices by `offset`/`limit`
  by default and returns the full set under `--all`.
- **`packages/sdk/tests/unit/commands/tasks.test.ts`** — command-level regression tests:
  `queryTasks({ count: true, offset: 10 })` → `success: false`, `VALIDATION_ERROR`, and
  `runOmniJSWrapped` **not** called. `queryTasks({ idsOnly: true, limit: 5, offset: 10 })` →
  `success: true`, reaches OmniJS, and emits a sliced `ids` body. Non-regression:
  `queryTasks({ idsOnly: true, all: true })` and bare `queryTasks({ idsOnly: true })` still succeed.
- **Descriptor tests** — update any descriptor-shape assertions affected by the `...listPaginationSchema`
  spread (e.g. `tasks-descriptors.test.ts`, `commands-registry.test.ts`, `packages/mcp/tests/tools.test.ts`).
- Assertions are derived from this spec (the rule and messages above), not from current program output.

## Versioning & docs

- **Changeset:** the original `list`-only fix was a `patch` for `@ofocus/sdk` (turning a silent
  footgun into a clear error). The 2026-06-10 amendment is a `minor` feature: `--ids-only` becomes
  paginatable and a new `excludeIds` field is added to `TaskQueryOptions`, so the api-extractor report
  **does** change and is regenerated. See issue #83.
- Run `pnpm build` to regenerate the agent docs (`AGENT_CLI_INSTRUCTIONS.md`, `skills/ofocus/SKILL.md`)
  from the updated descriptors and commit the regenerated files.

## Verification

1. `pnpm build` — types compile; commit regenerated agent docs.
2. Targeted tests (aggregate + tasks command suites), then `/clean_blt`.
3. End-to-end against real OmniFocus:
   ```sh
   ofocus tasks --ids-only --limit 5      # expect 5 ids (paged; amended 2026-06-10)
   ofocus tasks --ids-only --offset 5 --limit 5  # expect ids 6–10 (paged)
   ofocus tasks --count --offset 10       # expect VALIDATION_ERROR (scalar shape)
   ofocus tasks --ids-only                # expect full id list (unchanged)
   ofocus tasks --ids-only --all          # expect full id list (unchanged, #71)
   ofocus tasks --limit 5                 # expect 5 items (unchanged)
   ```

---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"ofocus": minor
---

Add bulk-triage flags for agent batch operations on `tasks`.

- **`--exclude-ids <ids>`** — filter OUT the given task IDs from results
  (comma- or space-separated). It composes with every other filter, so an agent
  can express "everything EXCEPT these" in a single query instead of fetching
  all results and set-subtracting client-side. IDs not present are ignored; an
  empty list excludes nothing.
- **`--ids-only` now paginates** — the rule that forbade combining `--ids-only`
  with `--limit`/`--offset` is removed. The id list is an ordered collection
  that can be stepped through page-by-page, exactly like the default list shape.
  The scalar/single-item shapes (`--count`, `--first`, `--last`, `--group-by`)
  still cannot be paginated.
- **`--format ids`** — a new machine-only output mode that emits one task ID per
  line with no JSON/TOON envelope, so the output pipes directly into `xargs`
  (e.g. `ofocus tasks --in-inbox --exclude-ids a,b,c --ids-only --format ids |
xargs ofocus delete-batch`). It applies only to an `--ids-only` result; any
  other payload (or a failed query) is reported as a structured error rather
  than silently producing a misleading id list. `--human` still takes
  precedence over `--format`, and the `json`/`toon`/`human` envelope behaviour
  for normal queries is unchanged.

These flags are surfaced on both the CLI (`ofocus tasks`) and the MCP
`tasks_list` tool from the single command descriptor.

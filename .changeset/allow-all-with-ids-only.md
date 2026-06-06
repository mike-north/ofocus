---
"@ofocus/sdk": patch
---

Allow `--ids-only` to be combined with `--all` on list queries (`tasks`, `projects`, `tags`, `folders`, `search`, `deferred`, `forecast`, `subtasks`).

Previously this combination was rejected with `Cannot combine --all with --ids-only`. The `ids` shape already returns every matching id, so `--all` is naturally satisfied rather than contradictory — the two now compose, returning all matching IDs without requiring the caller to guess a high `--limit`. The remaining scalar/single/grouped shapes (`--count`, `--first`, `--last`, `--group-by`) stay mutually exclusive with `--all`.

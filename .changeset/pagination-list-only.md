---
"@ofocus/sdk": patch
---

Reject `--limit`/`--offset` when combined with a non-list shape modifier (`--ids-only`, `--count`, `--first`, `--last`, `--group-by`). Previously these flags were silently ignored on non-list output; they now return a clear `VALIDATION_ERROR`. Pagination applies only to the default list shape. Also factor the shared `limit`/`offset`/`all` descriptor fields into `listPaginationSchema`.

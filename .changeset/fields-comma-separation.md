---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": patch
"ofocus": minor
---

fix(sdk): accept comma-separated --fields and --sort matching documented usage

`--fields`, `--exclude-fields`, and `--sort` on all list commands now accept
both **comma-separated** (`--fields id,name,dueDate`) and **space-separated**
(`--fields id name dueDate`) forms. Previously only the space-separated form
worked; the comma form produced `VALIDATION_ERROR: Unknown field: id,name,dueDate`
because the whole comma string was treated as one field name.

Commands updated: `tasks`, `projects`, `folders`, `tags`, `forecast`, `deferred`,
`search`, `subtasks`. All now expose `--fields`, `--exclude-fields`, `--sort`,
and `--reverse`.

Membership filters (`--tag`, `--project`, `--folder`) are deliberately NOT
normalized — tag/project/folder names can legitimately contain commas, so
splitting would corrupt them.

New SDK exports: `splitCommaSeparated`, `commaSeparatedStringArray`,
`listProjectionSchema`, `listSortSchema`.

The `tasks` command has been migrated to the centralized registry so it now
shares the same `fields`/`sort` vocabulary as all other list commands. The
`tasks` registry MCP tool is now exported as `tasks_query`.

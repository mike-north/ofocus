---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

feat(registry): migrate advanced commands (perspectives, review, focus, sync, archive, attachments, taskpaper, templates, url, open) to the centralized registry

This is W3 batch 6 — the final large migration step. Every command that was previously hand-wired in the CLI and directly registered as an MCP tool now flows through a `defineCommand` descriptor that drives CLI, MCP, and SDK surfaces from a single source of truth.

## New descriptor exports from `@ofocus/sdk`

### Perspectives

- `listPerspectivesDescriptor` — CLI: `perspectives`, MCP: `perspectives_list`
- `queryPerspectiveDescriptor` — CLI: `perspective <name>`, MCP: `perspective_query`

### Review

- `reviewProjectDescriptor` — CLI: `review <project-id>`, MCP: `project_review`
- `queryProjectsForReviewDescriptor` — CLI: `projects-for-review`, MCP: `projects_for_review`
- `getReviewIntervalDescriptor` — CLI: `review-interval-get <project-id>`, MCP: `project_review_interval_get`
- `setReviewIntervalDescriptor` — CLI: `review-interval-set <project-id>`, MCP: `project_review_interval_set`

### Focus

- `focusOnDescriptor` — CLI: `focus <target>`, MCP: `focus_set`
- `unfocusDescriptor` — CLI: `unfocus`, MCP: `focus_clear`
- `getFocusedDescriptor` — CLI: `focused`, MCP: `focus_get`

### Sync

- `getSyncStatusDescriptor` — CLI: `sync-status`, MCP: `sync_status`
- `triggerSyncDescriptor` — CLI: `sync`, MCP: `sync_trigger`

### Archive

- `archiveTasksDescriptor` — CLI: `archive`, MCP: `archive`
- `compactDatabaseDescriptor` — CLI: `compact`, MCP: `compact_database`

### Attachments

- `addAttachmentDescriptor` — CLI: `attach <task-id> <file-path>`, MCP: `attachment_add`
- `listAttachmentsDescriptor` — CLI: `attachments <task-id>`, MCP: `attachments_list`
- `removeAttachmentDescriptor` — CLI: `detach <task-id> <attachment-name>`, MCP: `attachment_remove`

### TaskPaper

- `exportTaskPaperDescriptor` — CLI: `export`, MCP: `export_taskpaper`
- `importTaskPaperDescriptor` — CLI: `import-taskpaper` (MCP-native), MCP: `import_taskpaper`

### Templates

- `saveTemplateDescriptor` — CLI: `template-save <name> <source-project>`, MCP: `template_save`
- `listTemplatesDescriptor` — CLI: `template-list`, MCP: `templates_list`
- `getTemplateDescriptor` — CLI: `template-get <template-name>`, MCP: `template_get`
- `createFromTemplateDescriptor` — CLI: `template-create <template-name>`, MCP: `template_create_project`
- `deleteTemplateDescriptor` — CLI: `template-delete <template-name>`, MCP: `template_delete`

### URL / Open

- `generateUrlDescriptor` — CLI: `url <id>`, MCP: `generate_url`
- `openItemDescriptor` — CLI: `open <id>`, MCP: `open`

## MCP tool names (public API — all preserved exactly)

All existing MCP tool names are unchanged. Every migrated descriptor specifies an explicit `mcpName:` that matches the previously registered tool name byte-for-byte.

## CLI flag renames and removed short aliases

Short aliases are dropped project-wide (0.x; no external users). Every removal is documented below.

| Command           | Before                      | After                                            | Change                                                           |
| ----------------- | --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `template-save`   | `-d, --description <text>`  | `--description <value>`                          | `-d` short alias removed                                         |
| `template-create` | `-p, --project-name <name>` | `--project-name <value>`                         | `-p` short alias removed                                         |
| `template-create` | `-f, --folder <name>`       | `--folder <value>`                               | `-f` short alias removed                                         |
| `export`          | `-p, --project <name>`      | `--project <value>`                              | `-p` short alias removed                                         |
| `export`          | `--include-completed`       | `--include-completed` / `--no-include-completed` | Negation form added                                              |
| `export`          | `--include-dropped`         | `--include-dropped` / `--no-include-dropped`     | Negation form added                                              |
| `archive`         | `--dry-run`                 | `--dry-run` / `--no-dry-run`                     | Negation form added                                              |
| `focus`           | `<name>`                    | `<target>`                                       | Positional renamed from `name` to `target`                       |
| `focus`           | `--by-id`                   | `--by-id` / `--no-by-id`                         | Negation form added                                              |
| `attach`          | `<task-id> <file>`          | `<task-id> <file-path>`                          | Second positional renamed from `file` to `file-path`             |
| `detach`          | `<task-id> <attachment>`    | `<task-id> <attachment-name>`                    | Second positional renamed from `attachment` to `attachment-name` |
| `template-get`    | `<name>`                    | `<template-name>`                                | Positional renamed from `name` to `template-name`                |
| `template-delete` | `<name>`                    | `<template-name>`                                | Positional renamed from `name` to `template-name`                |
| `perspective`     | `--limit <n>`               | `--limit <value>`                                | Display text changed; behavior unchanged                         |

## CLI commands that remain hand-wired

- **`import`** — The CLI `import` command takes a file path argument and reads the content; the MCP/SDK surface (`importTaskPaperDescriptor`) accepts raw TaskPaper content as a string. The CLI wraps the file-reading step and delegates to `importTaskPaper` directly. It is not registered via `registerCliCommand`.
- **`review-interval`** — Combines two distinct MCP operations (`get` + `set`) into one CLI command controlled by a `--set` flag. The descriptors `getReviewIntervalDescriptor` and `setReviewIntervalDescriptor` cover the MCP surfaces; the CLI delegates to their handlers directly.

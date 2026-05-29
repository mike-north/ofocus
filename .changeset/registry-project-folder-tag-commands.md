---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Migrate project, folder, and tag commands to the centralized command registry

## New descriptor exports (`@ofocus/sdk`)

The following `defineCommand` descriptors are now exported from `@ofocus/sdk`. Each descriptor drives the CLI subcommand, MCP tool, and SDK function from a single Zod-backed declaration:

- `listProjectsDescriptor` — `projects` CLI / `projects_list` MCP
- `createProjectDescriptor` — `create-project` CLI / `project_create` MCP
- `updateProjectDescriptor` — `update-project` CLI / `project_update` MCP
- `deleteProjectDescriptor` — `delete-project` CLI / `project_delete` MCP
- `listFoldersDescriptor` — `folders` CLI / `folders_list` MCP
- `createFolderDescriptor` — `create-folder` CLI / `folder_create` MCP
- `updateFolderDescriptor` — `update-folder` CLI / `folder_update` MCP
- `deleteFolderDescriptor` — `delete-folder` CLI / `folder_delete` MCP
- `listTagsDescriptor` — `tags` CLI / `tags_list` MCP
- `createTagDescriptor` — `create-tag` CLI / `tag_create` MCP
- `updateTagDescriptor` — `update-tag` CLI / `tag_update` MCP
- `deleteTagDescriptor` — `delete-tag` CLI / `tag_delete` MCP

## MCP tool names — unchanged

All existing MCP tool names are preserved: `projects_list`, `project_create`, `project_update`, `project_delete`, `folders_list`, `folder_create`, `folder_update`, `folder_delete`, `tags_list`, `tag_create`, `tag_update`, `tag_delete`.

## CLI flag renames and removed short aliases

Short aliases and old flag names have been dropped in favor of canonical kebab-case long forms. Update your invocations as follows:

### `create-project`

| Before            | After                   |
| ----------------- | ----------------------- |
| `-n <text>`       | `--note <value>`        |
| `--folder <name>` | `--folder-name <value>` |
| `-d <date>`       | `--due-date <value>`    |
| `--due <date>`    | `--due-date <value>`    |
| `--defer <date>`  | `--defer-date <value>`  |

```diff
- ofocus create-project "My Project" -n "A note" --folder Work -d 2026-06-01 --defer 2026-05-01
+ ofocus create-project "My Project" --note "A note" --folder-name Work --due-date 2026-06-01 --defer-date 2026-05-01
```

### `create-folder`

| Before             | After                          |
| ------------------ | ------------------------------ |
| `--parent <name>`  | `--parent-folder-name <value>` |
| `--parent-id <id>` | `--parent-folder-id <value>`   |

```diff
- ofocus create-folder Sub --parent Root --parent-id abc123
+ ofocus create-folder Sub --parent-folder-name Root --parent-folder-id abc123
```

### `create-tag`

| Before             | After                       |
| ------------------ | --------------------------- |
| `--parent <name>`  | `--parent-tag-name <value>` |
| `--parent-id <id>` | `--parent-tag-id <value>`   |

```diff
- ofocus create-tag Work --parent Root --parent-id abc123
+ ofocus create-tag Work --parent-tag-name Root --parent-tag-id abc123
```

### `update-tag`

| Before             | After                       |
| ------------------ | --------------------------- |
| `--parent <name>`  | `--parent-tag-name <value>` |
| `--parent-id <id>` | `--parent-tag-id <value>`   |

```diff
- ofocus update-tag <id> --parent Root --parent-id abc123
+ ofocus update-tag <id> --parent-tag-name Root --parent-tag-id abc123
```

### `update-project`

| Before            | After                   |
| ----------------- | ----------------------- |
| `-n <text>`       | `--note <value>`        |
| `--folder <name>` | `--folder-name <value>` |
| `-d <date>`       | `--due-date <value>`    |
| `--due <date>`    | `--due-date <value>`    |
| `--defer <date>`  | `--defer-date <value>`  |

```diff
- ofocus update-project <id> -n "New note" --folder Work -d 2026-06-01
+ ofocus update-project <id> --note "New note" --folder-name Work --due-date 2026-06-01
```

### `update-folder`

| Before             | After                          |
| ------------------ | ------------------------------ |
| `--parent <name>`  | `--parent-folder-name <value>` |
| `--parent-id <id>` | `--parent-folder-id <value>`   |

```diff
- ofocus update-folder <id> --parent Root --parent-id abc123
+ ofocus update-folder <id> --parent-folder-name Root --parent-folder-id abc123
```

### List commands (`projects`, `folders`, `tags`)

The listers now expose explicit `--limit` and `--offset` pagination flags (previously absent from the CLI surface but supported by the underlying query engine).

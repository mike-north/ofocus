# OFocus

A SDK and CLI for integrating with OmniFocus on macOS

[![CI](https://github.com/mike-north/ofocus/actions/workflows/ci.yml/badge.svg)](https://github.com/mike-north/ofocus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A monorepo containing the OmniFocus CLI and SDK for AI agents.

> **Note**: Requires macOS with OmniFocus installed. The SDK communicates with OmniFocus via AppleScript.

## Quick Start

```bash
# Install globally
npm install -g ofocus

# Add a task to inbox
ofocus inbox "Buy groceries"

# Query tasks
ofocus tasks --flagged

# Complete a task
ofocus complete <task-id>
```

## Packages

| Package                         | Description                                     |
| ------------------------------- | ----------------------------------------------- |
| [`@ofocus/sdk`](./packages/sdk) | Core SDK with zero runtime dependencies         |
| [`@ofocus/cli`](./packages/cli) | CLI using Commander.js                          |
| [`@ofocus/mcp`](./packages/mcp) | MCP server for AI agents                        |
| [`ofocus`](./packages/ofocus)   | Umbrella package re-exporting SDK, CLI, and MCP |

## API Reference

### CLI Commands

| Command                   | Description                          |
| ------------------------- | ------------------------------------ |
| `inbox <title>`           | Add a task to the OmniFocus inbox    |
| `tasks`                   | Query and filter tasks               |
| `projects`                | List and query projects              |
| `folders`                 | List and query folders               |
| `tags`                    | List and query tags                  |
| `complete <task-id>`      | Mark a task as complete              |
| `update <task-id>`        | Update task properties               |
| `drop <task-id>`          | Drop a task (preserves history)      |
| `delete <task-id>`        | Permanently delete a task            |
| `create-project <name>`   | Create a new project                 |
| `update-project <id>`     | Update project properties            |
| `delete-project <id>`     | Permanently delete a project         |
| `drop-project <id>`       | Drop a project (preserves history)   |
| `create-folder <name>`    | Create a new folder                  |
| `update-folder <id>`      | Update folder properties             |
| `delete-folder <id>`      | Permanently delete a folder          |
| `create-tag <name>`       | Create a new tag                     |
| `update-tag <id>`         | Update tag properties                |
| `delete-tag <id>`         | Permanently delete a tag             |
| `subtask <title>`         | Create a subtask under a parent task |
| `subtasks <parent-id>`    | Query subtasks of a task             |
| `move-to-parent <id>`     | Move a task to become a subtask      |
| `complete-batch <ids...>` | Complete multiple tasks              |
| `update-batch <ids...>`   | Update multiple tasks                |
| `delete-batch <ids...>`   | Delete multiple tasks                |
| `search <query>`          | Full-text search across tasks        |
| `perspectives`            | List all perspectives                |
| `perspective <name>`      | Query tasks from a perspective       |
| `review <project-id>`     | Mark a project as reviewed           |
| `projects-for-review`     | List projects due for review         |
| `review-interval <id>`    | Get/set project review interval      |
| `forecast`                | Query tasks by date range            |
| `focus <name>`            | Focus on a project or folder         |
| `unfocus`                 | Clear focus                          |
| `focused`                 | Show current focus state             |
| `deferred`                | List tasks with defer dates          |
| `url <id>`                | Generate OmniFocus URL deep link     |
| `defer <task-id>`         | Defer a task                         |
| `defer-batch <ids...>`    | Defer multiple tasks                 |
| `duplicate <task-id>`     | Clone a task with all properties     |
| `open <id>`               | Open an item in OmniFocus UI         |
| `quick "<input>"`         | Quick capture with natural language  |
| `export`                  | Export to TaskPaper format           |
| `import <file>`           | Import from TaskPaper format         |
| `stats`                   | Display productivity statistics      |
| `template-save`           | Save a project as a template         |
| `template-list`           | List available templates             |
| `template-get <name>`     | Get template details                 |
| `template-create <name>`  | Create project from template         |
| `template-delete <name>`  | Delete a template                    |
| `attach <task-id> <file>` | Add file attachment to task          |
| `attachments <task-id>`   | List task attachments                |
| `detach <task-id> <id>`   | Remove attachment from task          |
| `archive`                 | Archive completed/dropped tasks      |
| `compact`                 | Trigger database compaction          |
| `sync-status`             | Get sync status                      |
| `sync`                    | Trigger synchronization              |

### MCP Tools

| Tool                          | Description                  |
| ----------------------------- | ---------------------------- |
| `inbox_add`                   | Add a task to inbox          |
| `tasks_list`                  | List and filter tasks        |
| `task_complete`               | Mark a task as complete      |
| `task_update`                 | Update task properties       |
| `task_drop`                   | Drop a task                  |
| `task_delete`                 | Delete a task                |
| `task_defer`                  | Defer a task                 |
| `task_duplicate`              | Clone a task                 |
| `tasks_complete_batch`        | Complete multiple tasks      |
| `tasks_update_batch`          | Update multiple tasks        |
| `tasks_delete_batch`          | Delete multiple tasks        |
| `tasks_defer_batch`           | Defer multiple tasks         |
| `search`                      | Search tasks by text         |
| `projects_list`               | List and filter projects     |
| `project_create`              | Create a new project         |
| `project_update`              | Update project properties    |
| `project_delete`              | Delete a project             |
| `project_drop`                | Drop a project               |
| `project_review`              | Mark project as reviewed     |
| `projects_for_review`         | Get projects due for review  |
| `project_review_interval_get` | Get review interval          |
| `project_review_interval_set` | Set review interval          |
| `folders_list`                | List folders                 |
| `folder_create`               | Create a folder              |
| `folder_update`               | Update folder properties     |
| `folder_delete`               | Delete a folder              |
| `tags_list`                   | List tags                    |
| `tag_create`                  | Create a tag                 |
| `tag_update`                  | Update tag properties        |
| `tag_delete`                  | Delete a tag                 |
| `subtask_create`              | Create a subtask             |
| `subtasks_list`               | List subtasks                |
| `open`                        | Open an item in OmniFocus UI |
| `perspectives_list`           | List perspectives            |
| `perspective_query`           | Query a perspective          |
| `forecast`                    | Query forecast               |
| `focus`                       | Focus on project/folder      |
| `unfocus`                     | Clear focus                  |
| `focused`                     | Get focus state              |
| `deferred`                    | List deferred tasks          |
| `url`                         | Generate URL deep link       |
| `quick_capture`               | Quick capture with NLP       |
| `export_taskpaper`            | Export to TaskPaper          |
| `import_taskpaper`            | Import from TaskPaper        |
| `stats`                       | Get productivity stats       |
| `template_save`               | Save template                |
| `template_list`               | List templates               |
| `template_get`                | Get template                 |
| `template_create`             | Create from template         |
| `template_delete`             | Delete template              |
| `attachment_add`              | Add attachment               |
| `attachments_list`            | List attachments             |
| `attachment_remove`           | Remove attachment            |
| `archive`                     | Archive tasks                |
| `compact`                     | Compact database             |
| `sync_status`                 | Get sync status              |
| `sync_trigger`                | Trigger sync                 |

### SDK Functions

```typescript
import {
  // Tasks
  addToInbox,
  queryTasks,
  completeTask,
  completeTasks,
  updateTask,
  updateTasks,
  dropTask,
  deleteTask,
  deleteTasks,
  deferTask,
  deferTasks,
  duplicateTask,
  searchTasks,

  // Projects
  createProject,
  queryProjects,
  updateProject,
  deleteProject,
  dropProject,
  reviewProject,
  queryProjectsForReview,
  getReviewInterval,
  setReviewInterval,

  // Folders
  createFolder,
  queryFolders,
  updateFolder,
  deleteFolder,

  // Tags
  createTag,
  queryTags,
  updateTag,
  deleteTag,

  // Subtasks
  createSubtask,
  querySubtasks,
  moveTaskToParent,

  // Perspectives
  listPerspectives,
  queryPerspective,

  // Forecast & Focus
  queryForecast,
  focus,
  unfocus,
  getFocused,
  queryDeferred,

  // Utilities
  generateUrl,
  openItem,
  quickCapture,

  // Import/Export
  exportTaskPaper,
  importTaskPaper,

  // Statistics
  getStats,

  // Templates
  saveTemplate,
  listTemplates,
  getTemplate,
  createFromTemplate,
  deleteTemplate,

  // Attachments
  addAttachment,
  listAttachments,
  removeAttachment,

  // Maintenance
  archiveTasks,
  compactDatabase,
  getSyncStatus,
  triggerSync,
} from "@ofocus/sdk";
```

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 10.24.0
- macOS with OmniFocus installed (for integration tests)

### Setup

```bash
pnpm install
```

### Build

```bash
# Build all packages
pnpm build

# Build with clean
pnpm build:clean
```

### Test

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit
```

### Lint

```bash
# Check for lint errors
pnpm lint

# Fix lint errors
pnpm lint:fix
```

### Type Check

```bash
pnpm typecheck
```

### Quality Tools

```bash
# Check for unused exports/dependencies
pnpm knip

# Check dependency version consistency
pnpm syncpack:check

# Fix dependency version mismatches
pnpm syncpack:fix
```

### API Documentation

The SDK uses API Extractor to generate documentation:

```bash
# Generate API report (CI mode - fails on changes)
pnpm --filter @ofocus/sdk run api-extractor

# Update API report (local development)
pnpm --filter @ofocus/sdk run api-extractor:local

# Generate markdown documentation
pnpm --filter @ofocus/sdk run docs
```

## Architecture

```
ofocus/
├── packages/
│   ├── sdk/           # @ofocus/sdk - Core SDK
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── errors.ts
│   │   │   ├── result.ts
│   │   │   ├── applescript.ts
│   │   │   ├── escape.ts
│   │   │   ├── validation.ts
│   │   │   └── commands/
│   │   ├── api-report/
│   │   └── docs/
│   │
│   ├── cli/           # @ofocus/cli - CLI
│   │   └── src/
│   │       ├── index.ts
│   │       ├── cli.ts
│   │       ├── output.ts
│   │       └── commands/
│   │
│   └── ofocus/        # ofocus - Umbrella
│       └── src/
│           └── index.ts
```

## Contributing

### Adding Changes

This project uses [changesets](https://github.com/changesets/changesets) for versioning. When making changes:

1. Make your code changes
2. Run `pnpm changeset` to create a changeset describing your changes
3. Commit the changeset file along with your code changes

### Release Process

When changesets are merged to main, the release workflow will:

1. Create a "Version Packages" PR that bumps versions
2. When that PR is merged, publish packages to npm

## License

MIT - see [LICENSE](LICENSE) for details.

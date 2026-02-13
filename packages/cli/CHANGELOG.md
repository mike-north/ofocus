# @ofocus/cli

## 0.5.0

### Minor Changes

- cb84bb1: Add pagination support to query functions

  **Breaking Change**: Query functions now return `PaginatedResult<T>` instead of raw arrays.

  Before:

  ```typescript
  const result = await queryTasks({ flagged: true });
  // result.data was OFTask[]
  ```

  After:

  ```typescript
  const result = await queryTasks({ flagged: true });
  // result.data is now PaginatedResult<OFTask>
  // Access items via result.data.items
  ```

  **New Features**:
  - The following query functions support `limit` and `offset` parameters: `queryTasks`, `queryProjects`, `queryTags`, `queryFolders`
  - Note: `queryPerspective` and `listPerspectives` support only `limit` (no offset) due to OmniFocus AppleScript limitations
  - Default limit is 100 items
  - Results include `totalCount`, `returnedCount`, `hasMore`, `offset`, and `limit` metadata
  - CLI commands support `--limit` and `--offset` flags
  - New `validatePaginationParams()` function and `MAX_PAGINATION_LIMIT` constant exported from SDK

  **Improved Error Handling**:
  - Delete functions (`deleteTask`, `deleteProject`, `deleteTag`, `deleteFolder`) now return proper `NOT_FOUND` errors instead of crashing when items don't exist
  - Pagination parameters are validated (limit: 1-10000, offset: >= 0)

### Patch Changes

- cb84bb1: Add AppleScript composition utilities, rename `focus` to `focusOn`, and fix CLI pagination output

  **Breaking Change**: The `focus()` function has been renamed to `focusOn()` to avoid naming collision with the DOM global `focus()` function. This fixes API Extractor's `focus_2` artifact in the generated declaration file.

  Before:

  ```typescript
  import { focus } from "@ofocus/sdk";
  await focus("My Project");
  ```

  After:

  ```typescript
  import { focusOn } from "@ofocus/sdk";
  await focusOn("My Project");
  ```

  **New AppleScript Utilities**:

  Refactors AppleScript code organization by extracting inline AppleScript strings into dedicated `.applescript` files for better maintainability and editor syntax highlighting. This refactoring also exposes new public utilities for advanced script composition:
  - `composeScript()`: Compose AppleScript handlers and body into a single script
  - `runComposedScript()`: Execute composed scripts with proper error handling
  - `loadScriptContent()`: Load external AppleScript files from the bundled scripts directory
  - `loadScriptContentCached()`: Load with caching for performance
  - `getScriptPath()`: Get absolute paths to bundled AppleScript files
  - `clearScriptCache()`: Clear the script cache (useful for testing)

  These utilities enable advanced users to compose custom AppleScript operations while reusing the library's built-in helpers and serializers.

  **Bug Fix (CLI)**: Fixed missing `PaginatedResult` handling in CLI output. Paginated query results (from `queryTasks`, `queryProjects`, etc.) now display formatted items with pagination metadata showing "Showing X-Y of Z items" and instructions for fetching the next page. Previously, paginated results would fall through to raw JSON output.

- Updated dependencies [cb84bb1]
- Updated dependencies [cb84bb1]
- Updated dependencies [b822dea]
  - @ofocus/sdk@0.4.0

## 0.4.1

### Patch Changes

- 8b6de75: Upgrade is-agentic-tui to 0.2.0 for built-in caching, fixing CLI hang when running outside agentic contexts

## 0.4.0

### Minor Changes

- 39da3ee: Add CRUD operations for projects and folders, plus utility commands

  **SDK Functions:**
  - `updateProject` - Update project name, note, status, folder, sequential, due/defer dates
  - `deleteProject` - Permanently delete a project
  - `dropProject` - Mark project as dropped (preserves history)
  - `updateFolder` - Rename folder or move to new parent
  - `deleteFolder` - Permanently delete a folder
  - `duplicateTask` - Clone a task with all properties
  - `openItem` - Open any item in OmniFocus UI (auto-detects type)
  - `getReviewInterval` / `setReviewInterval` - Get/set project review interval in days

  **CLI Commands:**
  - `update-project <id>` with options for all project properties
  - `delete-project <id>` - Permanently delete
  - `drop-project <id>` - Mark as dropped
  - `update-folder <id>` with `--name` and `--parent` options
  - `delete-folder <id>` - Permanently delete
  - `duplicate <task-id>` with `--include-subtasks` option
  - `open <id>` - Open item in OmniFocus UI
  - `review-interval <project-id>` with `--set <days>` option

  **MCP Tools:**
  - `project_update`, `project_delete`, `project_drop`
  - `project_review_interval_get`, `project_review_interval_set`
  - `folder_update`, `folder_delete`
  - `task_duplicate`, `open`

  Includes comprehensive unit tests (194 new tests) covering validation, success paths, and error handling.

- 39da3ee: Add `template-get` CLI command to retrieve full details of project templates
  - Added `template-get <name>` command to CLI for parity with MCP `template_get` tool
  - Returns complete template structure including all tasks, metadata, and relative date offsets
  - Added comprehensive unit tests for template system (getTemplate, listTemplates, deleteTemplate)
  - Updated AGENT_INSTRUCTIONS.md with template management documentation

### Patch Changes

- Updated dependencies [39da3ee]
- Updated dependencies [39da3ee]
  - @ofocus/sdk@0.3.0

## 0.3.0

### Minor Changes

- 9b84d51: Add `template-get` CLI command to retrieve full details of project templates
  - Added `template-get <name>` command to CLI for parity with MCP `template_get` tool
  - Returns complete template structure including all tasks, metadata, and relative date offsets
  - Added comprehensive unit tests for template system (getTemplate, listTemplates, deleteTemplate)
  - Updated AGENT_INSTRUCTIONS.md with template management documentation

### Patch Changes

- Updated dependencies [9b84d51]
  - @ofocus/sdk@0.2.1

## 0.2.0

### Minor Changes

- d3fde6b: Add new commands for task management, productivity tracking, and database maintenance:

  **Date & Focus:**
  - `forecast` - Query tasks by date range
  - `focus` / `unfocus` / `focused` - Focus mode management
  - `deferred` - List deferred tasks
  - `defer` / `defer-batch` - Defer task operations

  **Quick Capture & TaskPaper:**
  - `quick` - Smart parsing for rapid task entry with natural language syntax
  - `export` / `import` - TaskPaper format import/export

  **Productivity:**
  - `stats` - Task and project statistics
  - `url` - Generate omnifocus:// deep links

  **Project Templates:**
  - `template-save` / `template-list` / `template-create` / `template-delete` - Reusable project templates

  **Attachments:**
  - `attach` / `attachments` / `detach` - File attachment management

  **Database & Sync:**
  - `archive` / `compact` - Database maintenance
  - `sync-status` / `sync` - Sync operations

### Patch Changes

- Updated dependencies [d3fde6b]
  - @ofocus/sdk@0.2.0

## 0.1.0

### Minor Changes

- 7bab77a: Complete monorepo refactoring with quality tooling, CI/CD, and publishing setup
  - Add GitHub Actions CI workflow (build, lint, typecheck, test, api-extractor)
  - Add GitHub Actions release workflow for automated npm publishing via changesets
  - Add changesets for version management
  - Update license from UNLICENSED to MIT
  - Add publishConfig and repository metadata to all packages
  - Expand test coverage with result helpers and mocked command tests
  - Update AGENT_INSTRUCTIONS.md with SDK programmatic usage and troubleshooting
  - Generate API documentation with api-documenter
  - Fix ESLint error in CLI entry point
  - Fix Jest deprecation warning by enabling isolatedModules
  - Clean up knip configuration

### Patch Changes

- 2b662a9: feat(sdk): add comprehensive OmniFocus features for batch operations, projects, folders, tags, subtasks, search, perspectives, and review
  - Add batch operations: `completeTasks`, `updateTasks`, `deleteTasks` for efficient multi-task processing
  - Add project management: `createProject` with folder assignment, sequential/parallel options
  - Add folder operations: `createFolder`, `queryFolders` for organizing projects
  - Add tag CRUD: `createTag`, `updateTag`, `deleteTag` for full tag management
  - Add subtask support: `createSubtask`, `querySubtasks`, `moveTaskToParent` for task hierarchies
  - Add search: `searchTasks` with scope filtering (name/note/both)
  - Add perspectives: `queryPerspective`, `listPerspectives` for saved views
  - Add review workflow: `reviewProject`, `queryProjectsForReview`
  - Add repetition rules: support for daily/weekly/monthly/yearly repeating tasks
  - Add estimated duration field to tasks
  - Migrate test suite from Jest to Vitest

- Updated dependencies [7bab77a]
- Updated dependencies [2b662a9]
  - @ofocus/sdk@0.1.0

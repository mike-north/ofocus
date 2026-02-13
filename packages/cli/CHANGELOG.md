# @ofocus/cli

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

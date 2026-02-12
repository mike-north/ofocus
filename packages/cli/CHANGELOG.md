# @ofocus/cli

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

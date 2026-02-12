---
"@ofocus/sdk": minor
"@ofocus/cli": patch
---

feat(sdk): add comprehensive OmniFocus features for batch operations, projects, folders, tags, subtasks, search, perspectives, and review

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

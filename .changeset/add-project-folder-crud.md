---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Add CRUD operations for projects and folders, plus utility commands

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

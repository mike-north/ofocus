# @ofocus/mcp

## 0.4.1

### Patch Changes

- Updated dependencies [cb84bb1]
- Updated dependencies [cb84bb1]
- Updated dependencies [b822dea]
  - @ofocus/sdk@0.4.0

## 0.4.0

### Minor Changes

- 39da3ee: Add MCP (Model Context Protocol) server package that enables AI assistants like Claude to interact with OmniFocus.

  Features:
  - Complete MCP server implementation wrapping @ofocus/sdk
  - 49 tools covering all major OmniFocus operations
  - Task management (create, update, complete, defer, delete, search)
  - Project and folder management
  - Tag management
  - Perspectives and forecast queries
  - Batch operations for efficiency
  - Templates, attachments, and import/export
  - Database maintenance and sync operations
  - Native integration with Claude Desktop via stdio transport

  Usage: Configure in Claude Desktop's `claude_desktop_config.json` to enable natural language task management with OmniFocus.

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

### Patch Changes

- Updated dependencies [39da3ee]
- Updated dependencies [39da3ee]
  - @ofocus/sdk@0.3.0

## 0.3.0

### Minor Changes

- 9b84d51: Add MCP (Model Context Protocol) server package that enables AI assistants like Claude to interact with OmniFocus.

  Features:
  - Complete MCP server implementation wrapping @ofocus/sdk
  - 49 tools covering all major OmniFocus operations
  - Task management (create, update, complete, defer, delete, search)
  - Project and folder management
  - Tag management
  - Perspectives and forecast queries
  - Batch operations for efficiency
  - Templates, attachments, and import/export
  - Database maintenance and sync operations
  - Native integration with Claude Desktop via stdio transport

  Usage: Configure in Claude Desktop's `claude_desktop_config.json` to enable natural language task management with OmniFocus.

### Patch Changes

- Updated dependencies [9b84d51]
  - @ofocus/sdk@0.2.1

## 0.2.0

### Minor Changes

- 248e5c9: Add MCP (Model Context Protocol) server package that enables AI assistants like Claude to interact with OmniFocus.

  Features:
  - Complete MCP server implementation wrapping @ofocus/sdk
  - 49 tools covering all major OmniFocus operations
  - Task management (create, update, complete, defer, delete, search)
  - Project and folder management
  - Tag management
  - Perspectives and forecast queries
  - Batch operations for efficiency
  - Templates, attachments, and import/export
  - Database maintenance and sync operations
  - Native integration with Claude Desktop via stdio transport

  Usage: Configure in Claude Desktop's `claude_desktop_config.json` to enable natural language task management with OmniFocus.

### Patch Changes

- Updated dependencies [d3fde6b]
  - @ofocus/sdk@0.2.0

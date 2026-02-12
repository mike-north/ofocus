# @ofocus/mcp

MCP (Model Context Protocol) server for OmniFocus, enabling AI assistants like Claude to interact with OmniFocus.

## Prerequisites

- macOS with OmniFocus installed and running
- Node.js 20 or higher
- OmniFocus must be running for most operations to work

## Installation

### Local Installation

```bash
npm install @ofocus/mcp
# or
pnpm add @ofocus/mcp
```

### Global Installation

```bash
npm install -g @ofocus/mcp
# or
pnpm add -g @ofocus/mcp
```

## Usage

### With Claude Desktop

Add to your Claude Desktop configuration file at:
`~/Library/Application Support/Claude/claude_desktop_config.json`

> **Note:** You may need to create this file if it doesn't exist.

**Using npx (recommended):**

```json
{
  "mcpServers": {
    "ofocus": {
      "command": "npx",
      "args": ["@ofocus/mcp"]
    }
  }
}
```

**Using global installation:**

```json
{
  "mcpServers": {
    "ofocus": {
      "command": "ofocus-mcp"
    }
  }
}
```

**Using local installation:**

```json
{
  "mcpServers": {
    "ofocus": {
      "command": "node",
      "args": ["./node_modules/@ofocus/mcp/dist/index.js"]
    }
  }
}
```

### Running Directly

For testing or debugging purposes, you can run the MCP server directly:

```bash
# Using npx
npx @ofocus/mcp

# Or if installed globally
ofocus-mcp
```

> **Note:** This mode is primarily for development and testing. For use with Claude Desktop, configure it as shown above.

## Available Tools

### Task Management

| Tool            | Description                           |
| --------------- | ------------------------------------- |
| `inbox_add`     | Add a new task to the OmniFocus inbox |
| `tasks_list`    | List and filter tasks                 |
| `task_complete` | Mark a task as complete               |
| `task_update`   | Update task properties                |
| `task_drop`     | Drop (cancel) a task                  |
| `task_delete`   | Permanently delete a task             |
| `task_defer`    | Defer a task to a later date          |
| `search`        | Search tasks by text                  |

### Batch Operations

| Tool                   | Description                     |
| ---------------------- | ------------------------------- |
| `tasks_complete_batch` | Complete multiple tasks at once |
| `tasks_update_batch`   | Update multiple tasks at once   |
| `tasks_delete_batch`   | Delete multiple tasks at once   |
| `tasks_defer_batch`    | Defer multiple tasks at once    |

### Project Management

| Tool                  | Description                 |
| --------------------- | --------------------------- |
| `projects_list`       | List and filter projects    |
| `project_create`      | Create a new project        |
| `project_review`      | Mark a project as reviewed  |
| `projects_for_review` | Get projects due for review |

### Tags

| Tool         | Description      |
| ------------ | ---------------- |
| `tags_list`  | List tags        |
| `tag_create` | Create a new tag |
| `tag_update` | Update a tag     |
| `tag_delete` | Delete a tag     |

### Folders

| Tool            | Description         |
| --------------- | ------------------- |
| `folders_list`  | List folders        |
| `folder_create` | Create a new folder |

### Subtasks

| Tool             | Description                     |
| ---------------- | ------------------------------- |
| `subtask_create` | Create a subtask under a task   |
| `subtasks_list`  | List subtasks of a task         |
| `task_move`      | Move a task to become a subtask |

### Perspectives

| Tool                | Description                    |
| ------------------- | ------------------------------ |
| `perspectives_list` | List all perspectives          |
| `perspective_query` | Query tasks from a perspective |

### Focus & Forecast

| Tool            | Description                  |
| --------------- | ---------------------------- |
| `forecast`      | Query tasks by date range    |
| `focus_set`     | Focus on a project or folder |
| `focus_clear`   | Clear the current focus      |
| `focus_get`     | Get the current focus        |
| `deferred_list` | List deferred tasks          |

### Quick Entry

| Tool        | Description                                                                             |
| ----------- | --------------------------------------------------------------------------------------- |
| `quick_add` | Add task using natural language syntax (e.g., "Buy milk @errands #shopping ::tomorrow") |

### Statistics & Sync

| Tool           | Description                 |
| -------------- | --------------------------- |
| `stats`        | Get productivity statistics |
| `sync_status`  | Get sync status             |
| `sync_trigger` | Trigger a sync              |

### Templates

| Tool                      | Description                  |
| ------------------------- | ---------------------------- |
| `template_save`           | Save a project as a template |
| `templates_list`          | List saved templates         |
| `template_get`            | Get template details         |
| `template_create_project` | Create project from template |
| `template_delete`         | Delete a template            |

### Attachments

| Tool                | Description              |
| ------------------- | ------------------------ |
| `attachment_add`    | Add attachment to a task |
| `attachments_list`  | List task attachments    |
| `attachment_remove` | Remove an attachment     |

### Import/Export

| Tool               | Description                        |
| ------------------ | ---------------------------------- |
| `export_taskpaper` | Export to TaskPaper format         |
| `import_taskpaper` | Import from TaskPaper format       |
| `generate_url`     | Generate OmniFocus URL scheme link |

### Maintenance

| Tool               | Description             |
| ------------------ | ----------------------- |
| `archive`          | Archive completed tasks |
| `compact_database` | Compact the database    |

## Example Interactions

Once configured with Claude Desktop, you can use natural language to interact with OmniFocus:

**Task Management:**

- "Add a task to buy groceries, due tomorrow, flagged"
- "Show me all flagged tasks"
- "Complete all tasks about the quarterly report"
- "What tasks are due this week?"

**Project Management:**

- "Create a new project called 'Website Redesign' in the Work folder"
- "What projects need review?"
- "Show me all active projects in my Personal folder"

**Forecasting & Planning:**

- "Show me my forecast for this week"
- "What's on my plate for the next 3 days?"
- "List all deferred tasks"

**Search & Organization:**

- "Search for tasks mentioning 'report'"
- "Show me all tasks tagged 'urgent'"
- "Find tasks in the Marketing project"

## Troubleshooting

### "OmniFocus is not running" errors

- Ensure OmniFocus is open before using the MCP server
- Most operations require OmniFocus to be running in the background

### Server not appearing in Claude

- Check that the path to the MCP server is correct in your config
- Restart Claude Desktop after modifying the configuration
- Check Claude Desktop logs for connection errors

### Permission errors

- OmniFocus may prompt for Automation permission the first time
- Grant the necessary permissions when prompted by macOS
- Check System Preferences > Security & Privacy > Privacy > Automation

### Common issues

- **Empty results:** Make sure OmniFocus has tasks/projects matching your query
- **Timeout errors:** Large databases may take longer; try filtering your queries
- **Invalid task ID:** Task IDs are internal OmniFocus identifiers, not task names

## Technical Details

- **Transport:** stdio (standard input/output)
- **MCP SDK:** @modelcontextprotocol/sdk ^1.11.0
- **OmniFocus Integration:** AppleScript via @ofocus/sdk

## License

MIT

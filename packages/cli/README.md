# @ofocus/cli

Command-line interface for OmniFocus, designed for AI agents.

## Installation

```bash
pnpm add @ofocus/cli
```

## Usage

> **Note:** The `@ofocus/cli` package installs as `ofocus-cli`. For the `ofocus` command, install the umbrella package: `pnpm add ofocus`

```bash
# Add a task to the inbox
ofocus-cli inbox "Buy groceries" --note "Milk, eggs, bread" --due "tomorrow" --flag

# Query tasks
ofocus-cli tasks --flagged --available

# Query projects
ofocus-cli projects --status active

# Query tags
ofocus-cli tags

# Complete a task
ofocus-cli complete <task-id>

# Update a task
ofocus-cli update <task-id> --title "New title" --due "next week"

# List available commands
ofocus-cli list-commands
```

## Querying Tasks

### Use Filters First

Always prefer filtering over fetching everything:

```bash
# Get flagged tasks
ofocus-cli tasks --flagged

# Get tasks in a specific project
ofocus-cli tasks --project "Project Name"

# Get tasks with a specific tag
ofocus-cli tasks --tag "urgent"

# Get available (actionable) tasks
ofocus-cli tasks --available

# Combine filters
ofocus-cli tasks --flagged --available
```

### Inbox vs Project Tasks

The `tasks` command returns both inbox and project tasks:

- **Inbox tasks**: `projectId` is `null` (not assigned to any project)
- **Project tasks**: `projectId` is set

### Pagination

By default, queries return up to 100 items. Use pagination to browse large result sets:

```bash
# First page (default limit: 100)
ofocus-cli tasks --flagged

# Smaller pages
ofocus-cli tasks --flagged --limit 20

# Next page
ofocus-cli tasks --flagged --limit 20 --offset 20
```

Only increase `--limit` beyond 100 when you specifically need all matching items.

## Output Formats

By default, output is JSON for machine parsing:

```bash
ofocus-cli tasks --flagged
```

Use `--human` for human-readable output:

```bash
ofocus-cli tasks --flagged --human
```

## Commands

| Command              | Description                 |
| -------------------- | --------------------------- |
| `inbox <title>`      | Add a task to the inbox     |
| `tasks`              | Query tasks with filters    |
| `projects`           | Query projects with filters |
| `tags`               | Query tags with filters     |
| `folders`            | Query folders with filters  |
| `complete <task-id>` | Mark a task as complete     |
| `update <task-id>`   | Update task properties      |
| `list-commands`      | List all available commands |

## Programmatic Usage

```typescript
import { createCli, outputJson, outputHuman } from "@ofocus/cli";

const cli = createCli();
cli.parse(["node", "ofocus", "tasks", "--flagged"]);
```

## License

MIT

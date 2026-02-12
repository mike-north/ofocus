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

| Command | Description |
|---------|-------------|
| `inbox <title>` | Add a task to the inbox |
| `tasks` | Query tasks with filters |
| `projects` | Query projects with filters |
| `tags` | Query tags with filters |
| `complete <task-id>` | Mark a task as complete |
| `update <task-id>` | Update task properties |
| `list-commands` | List all available commands |

## Programmatic Usage

```typescript
import { createCli, outputJson, outputHuman } from "@ofocus/cli";

const cli = createCli();
cli.parse(["node", "ofocus", "tasks", "--flagged"]);
```

## License

MIT

# @ofocus/cli

Command-line interface for OmniFocus, designed for AI agents.

## Installation

```bash
pnpm add @ofocus/cli
```

## Usage

```bash
# Add a task to the inbox
ofocus inbox "Buy groceries" --note "Milk, eggs, bread" --due "tomorrow" --flag

# Query tasks
ofocus tasks --flagged --available

# Query projects
ofocus projects --status active

# Query tags
ofocus tags

# Complete a task
ofocus complete <task-id>

# Update a task
ofocus update <task-id> --title "New title" --due "next week"

# List available commands
ofocus list-commands
```

## Output Formats

By default, output is JSON for machine parsing:

```bash
ofocus tasks --flagged
```

Use `--human` for human-readable output:

```bash
ofocus tasks --flagged --human
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

UNLICENSED

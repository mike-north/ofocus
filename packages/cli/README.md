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

Three output formats are supported:

| Flag            | Format                                     | Best for                                       |
| --------------- | ------------------------------------------ | ---------------------------------------------- |
| _(none)_        | JSON, or TOON when an AI agent is detected | Machine parsing / agent consumption            |
| `--format toon` | [TOON](https://toonformat.dev/)            | LLM/agent consumption (~40% smaller than JSON) |
| `--human`       | Human-readable text                        | Terminal use                                   |

```bash
# JSON (default)
ofocus-cli tasks --flagged

# TOON — token-efficient for LLM agents
ofocus-cli tasks --flagged --format toon

# Human-readable
ofocus-cli tasks --flagged --human
```

The `--format` option accepts `json` or `toon`. Use `--human` (not `--format human`) for human-readable output. `--human` takes precedence over `--format` when both are specified.

### Agent-aware default

When you don't pass `--format`, the CLI picks a default based on **who is calling**:

- If an AI coding agent is detected (Claude Code, Cursor, Gemini CLI, Aider — via [`is-agentic-tui`](https://github.com/mike-north/is-agentic-tui)), the default is **TOON** — the same envelope in ~40% fewer tokens, so agents don't have to remember `--format toon`.
- Otherwise the default is **JSON**.

The resolution order is: `--human` → explicit `--format` → `--json` (shorthand for `--format json`) → the `OFOCUS_FORMAT` environment variable (`json` or `toon`) → agent detection. An explicit flag or `OFOCUS_FORMAT` always wins, so set `OFOCUS_FORMAT=json` (or pass `--format json` / `--json`) in a script that runs inside an agent session but pipes output to a JSON tool like `jq`.

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
import {
  createCli,
  outputJson,
  outputHuman,
  outputToon,
  type OutputFormat,
} from "@ofocus/cli";

const cli = createCli();
cli.parse(["node", "ofocus", "tasks", "--flagged"]);
```

## License

MIT

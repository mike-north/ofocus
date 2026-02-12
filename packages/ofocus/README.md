# ofocus

OmniFocus CLI for AI agents - the complete package combining SDK and CLI.

## Installation

```bash
pnpm add ofocus
```

Or install globally:

```bash
pnpm add -g ofocus
```

## CLI Usage

```bash
# Add a task to the inbox
ofocus inbox "Buy groceries" --note "Milk, eggs, bread" --due "tomorrow" --flag

# Query tasks
ofocus tasks --flagged --available

# Query projects
ofocus projects --status active

# Complete a task
ofocus complete <task-id>

# List available commands
ofocus list-commands
```

## SDK Usage

```typescript
import {
  addToInbox,
  queryTasks,
  completeTask,
  success,
  failure,
  ErrorCode,
} from "ofocus";

// Add a task
const result = await addToInbox("Buy groceries", {
  note: "Milk, eggs, bread",
  flag: true,
});

// Query tasks
const tasks = await queryTasks({ flagged: true });

// Complete a task
await completeTask("task-id");
```

## Packages

This package re-exports:

- **@ofocus/sdk** - Core SDK with zero runtime dependencies
- **@ofocus/cli** - CLI implementation using Commander.js

## License

MIT

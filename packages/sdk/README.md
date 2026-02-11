# @ofocus/sdk

Core SDK for interacting with OmniFocus via AppleScript.

## Installation

```bash
pnpm add @ofocus/sdk
```

## Usage

```typescript
import {
  addToInbox,
  queryTasks,
  queryProjects,
  completeTask,
  success,
  failure,
} from "@ofocus/sdk";

// Add a task to the inbox
const result = await addToInbox("Buy groceries", {
  note: "Milk, eggs, bread",
  due: "tomorrow 5pm",
  flag: true,
  tags: ["errands"],
});

if (result.success) {
  console.log("Created task:", result.data.id);
} else {
  console.error("Error:", result.error.message);
}

// Query tasks
const tasks = await queryTasks({
  flagged: true,
  available: true,
});

// Complete a task
await completeTask("task-id-here");
```

## API

### Commands

- `addToInbox(title, options?)` - Add a task to the OmniFocus inbox
- `queryTasks(options?)` - Query tasks with optional filters
- `queryProjects(options?)` - Query projects with optional filters
- `queryTags(options?)` - Query tags with optional filters
- `completeTask(taskId)` - Mark a task as complete
- `updateTask(taskId, options)` - Update task properties

### Result Helpers

- `success(data)` - Create a successful result
- `failure(error)` - Create a failed result
- `failureMessage(message)` - Create a failed result with a string message

### Error Handling

- `ErrorCode` - Enum of error codes for semantic error handling
- `createError(code, message, details?)` - Create a structured error
- `parseAppleScriptError(rawError)` - Parse AppleScript errors

### Utilities

- `escapeAppleScript(str)` - Escape strings for AppleScript
- `validateId(id, type)` - Validate OmniFocus IDs
- `validateDateString(dateStr)` - Validate date strings
- `validateTags(tags)` - Validate tag names
- `validateProjectName(name)` - Validate project names

## License

UNLICENSED

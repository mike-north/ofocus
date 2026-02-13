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

## Querying Tasks

### Use Filters First

Always prefer filtering to fetching everything. The SDK supports many filters:

```typescript
// Get flagged tasks only
const flagged = await queryTasks({ flagged: true });

// Get tasks in a specific project
const projectTasks = await queryTasks({ project: "Project Name" });

// Get tasks with a specific tag
const tagged = await queryTasks({ tag: "urgent" });

// Get tasks due soon
const dueSoon = await queryTasks({ dueBefore: "2024-12-31" });

// Get available (actionable) tasks
const available = await queryTasks({ available: true });

// Combine filters
const urgentAvailable = await queryTasks({ flagged: true, available: true });
```

### Inbox vs Project Tasks

`queryTasks()` returns both inbox tasks and project tasks:

- **Inbox tasks**: `projectId === null` (not assigned to any project)
- **Project tasks**: `projectId` is set

```typescript
const result = await queryTasks({ flagged: true });
if (result.success) {
  const inboxTasks = result.data.items.filter((t) => t.projectId === null);
  const projectTasks = result.data.items.filter((t) => t.projectId !== null);
}
```

### Pagination

All query functions return paginated results (default limit: 100 items):

```typescript
// First page (default)
const page1 = await queryTasks({ flagged: true });

// Check if there are more results
if (page1.data.hasMore) {
  const page2 = await queryTasks({ flagged: true, offset: 100 });
}

// Smaller pages for efficiency
const smallPage = await queryTasks({ limit: 20, offset: 0 });
```

**Result format**:

```typescript
interface PaginatedResult<T> {
  items: T[]; // The items for this page
  totalCount: number; // Total items matching the query (before pagination)
  returnedCount: number; // Items in this page
  hasMore: boolean; // Whether more items exist
  offset: number; // The offset used
  limit: number; // The limit used
}
```

**Note**: Only increase the limit beyond 100 when you specifically need all matching items. For most agent tasks, filters and pagination are more efficient.

## API

### Commands

- `addToInbox(title, options?)` - Add a task to the OmniFocus inbox
- `queryTasks(options?)` - Query tasks with optional filters
- `queryProjects(options?)` - Query projects with optional filters
- `queryTags(options?)` - Query tags with optional filters
- `queryFolders(options?)` - Query folders with optional filters
- `completeTask(taskId)` - Mark a task as complete
- `updateTask(taskId, options)` - Update task properties
- `deleteTask(taskId)` - Permanently delete a task
- `deleteProject(projectId)` - Permanently delete a project
- `deleteTag(tagId)` - Permanently delete a tag
- `deleteFolder(folderId)` - Permanently delete a folder

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

MIT

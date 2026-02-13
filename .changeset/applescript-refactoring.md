---
"@ofocus/sdk": minor
"@ofocus/cli": patch
"ofocus": minor
---

Add AppleScript composition utilities, rename `focus` to `focusOn`, and fix CLI pagination output

**Breaking Change**: The `focus()` function has been renamed to `focusOn()` to avoid naming collision with the DOM global `focus()` function. This fixes API Extractor's `focus_2` artifact in the generated declaration file.

Before:

```typescript
import { focus } from "@ofocus/sdk";
await focus("My Project");
```

After:

```typescript
import { focusOn } from "@ofocus/sdk";
await focusOn("My Project");
```

**New AppleScript Utilities**:

Refactors AppleScript code organization by extracting inline AppleScript strings into dedicated `.applescript` files for better maintainability and editor syntax highlighting. This refactoring also exposes new public utilities for advanced script composition:

- `composeScript()`: Compose AppleScript handlers and body into a single script
- `runComposedScript()`: Execute composed scripts with proper error handling
- `loadScriptContent()`: Load external AppleScript files from the bundled scripts directory
- `loadScriptContentCached()`: Load with caching for performance
- `getScriptPath()`: Get absolute paths to bundled AppleScript files
- `clearScriptCache()`: Clear the script cache (useful for testing)

These utilities enable advanced users to compose custom AppleScript operations while reusing the library's built-in helpers and serializers.

**Bug Fix (CLI)**: Fixed missing `PaginatedResult` handling in CLI output. Paginated query results (from `queryTasks`, `queryProjects`, etc.) now display formatted items with pagination metadata showing "Showing X-Y of Z items" and instructions for fetching the next page. Previously, paginated results would fall through to raw JSON output.

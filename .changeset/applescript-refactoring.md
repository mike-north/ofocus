---
"@ofocus/sdk": minor
"ofocus": minor
---

Add AppleScript composition utilities

Refactors AppleScript code organization by extracting inline AppleScript strings into dedicated `.applescript` files for better maintainability and editor syntax highlighting. This refactoring also exposes new public utilities for advanced script composition:

- `composeScript()`: Compose AppleScript handlers and body into a single script
- `runComposedScript()`: Execute composed scripts with proper error handling
- `loadScriptContent()`: Load external AppleScript files from the bundled scripts directory
- `loadScriptContentCached()`: Load with caching for performance
- `getScriptPath()`: Get absolute paths to bundled AppleScript files
- `clearScriptCache()`: Clear the script cache (useful for testing)

These utilities enable advanced users to compose custom AppleScript operations while reusing the library's built-in helpers and serializers.

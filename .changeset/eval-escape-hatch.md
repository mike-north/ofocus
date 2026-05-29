---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Add OmniJS eval escape hatch: `evaluateScript` SDK function, `ofocus eval` CLI command, and `omnifocus_eval` MCP tool.

This is a last-resort tool for operations that no combination of flags on the deterministic commands (`tasks`, `projects`, `folders`, `tags`, `forecast`, `search`, etc.) can cover. Agents should always try the declarative surface first.

Key constraints:

- Scripts must end with a `return <expression>;` statement so the result can be decoded as JSON
- Script size is capped at 64 KB (both inline and file paths)
- Arguments are injected via a `const args = JSON.parse(...)` prefix to avoid string-interpolation escaping issues
- OmniJS error messages are surfaced verbatim for debuggability

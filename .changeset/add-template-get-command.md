---
"@ofocus/cli": minor
"@ofocus/sdk": patch
---

Add `template-get` CLI command to retrieve full details of project templates

- Added `template-get <name>` command to CLI for parity with MCP `template_get` tool
- Returns complete template structure including all tasks, metadata, and relative date offsets
- Added comprehensive unit tests for template system (getTemplate, listTemplates, deleteTemplate)
- Updated AGENT_INSTRUCTIONS.md with template management documentation

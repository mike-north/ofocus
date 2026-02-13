---
"@ofocus/mcp": minor
"ofocus": minor
---

Add MCP (Model Context Protocol) server package that enables AI assistants like Claude to interact with OmniFocus.

Features:

- Complete MCP server implementation wrapping @ofocus/sdk
- 49 tools covering all major OmniFocus operations
- Task management (create, update, complete, defer, delete, search)
- Project and folder management
- Tag management
- Perspectives and forecast queries
- Batch operations for efficiency
- Templates, attachments, and import/export
- Database maintenance and sync operations
- Native integration with Claude Desktop via stdio transport

Usage: Configure in Claude Desktop's `claude_desktop_config.json` to enable natural language task management with OmniFocus.

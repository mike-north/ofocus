# @ofocus/mcp

## 0.3.0

### Minor Changes

- 9b84d51: Add MCP (Model Context Protocol) server package that enables AI assistants like Claude to interact with OmniFocus.

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

### Patch Changes

- Updated dependencies [9b84d51]
  - @ofocus/sdk@0.2.1

## 0.2.0

### Minor Changes

- 248e5c9: Add MCP (Model Context Protocol) server package that enables AI assistants like Claude to interact with OmniFocus.

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

### Patch Changes

- Updated dependencies [d3fde6b]
  - @ofocus/sdk@0.2.0

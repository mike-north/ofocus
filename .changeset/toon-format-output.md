---
"@ofocus/cli": minor
"@ofocus/mcp": minor
"ofocus": minor
---

Add TOON output format for token-efficient agent consumption

## CLI: `--format <json|toon>` option

The CLI gains a new top-level `--format <fmt>` option (default `json`):

```
ofocus tasks --format toon        # TOON-encoded output (~40% smaller)
ofocus tasks --format json        # Pretty-printed JSON (previous default)
ofocus tasks --human              # Human-readable text (unchanged)
```

`--human` continues to be the way to select human-readable output and takes precedence over `--format` when both are supplied. `--format human` is rejected with a `VALIDATION_ERROR` envelope.

The `output()` function signature changes from `(result, json: boolean)` to `(result, format: OutputFormat)` where `OutputFormat = 'json' | 'toon' | 'human'`. The `OutputFormat` type is now exported from `@ofocus/cli`.

## MCP: `format` parameter on all tools

Every MCP tool registered through `registerMcpTool` gains an optional `format?: 'json' | 'toon'` parameter (default `'toon'`). The default is TOON because agents — the primary consumers of MCP tools — benefit from the token savings; humans rarely read MCP tool output directly.

```
# In an MCP tool call:
format: "toon"   # default — TOON-encoded result
format: "json"   # standard JSON for callers that require it
```

## Why TOON?

[TOON](https://toonformat.dev/) (Token-Oriented Object Notation) is a compact, human-readable encoding of the JSON data model designed for LLM consumption. For the uniform array-of-objects shapes that dominate this SDK's output, TOON is approximately **40–62% smaller than JSON**.

Example — 3 tasks, JSON vs TOON (CliOutput envelope):

**JSON** (366 bytes):

```json
{
  "success": true,
  "data": [
    {
      "id": "abc123",
      "name": "Buy milk",
      "flagged": false,
      "completed": false
    },
    {
      "id": "def456",
      "name": "Pay bills",
      "flagged": true,
      "completed": false
    },
    { "id": "ghi789", "name": "Call mom", "flagged": false, "completed": true }
  ],
  "error": null
}
```

**TOON** (138 bytes):

```
success: true
data[3]{id,name,flagged,completed}:
  abc123,Buy milk,false,false
  def456,Pay bills,true,false
  ghi789,Call mom,false,true
error: null
```

62% reduction in this example. Real-world task lists with more fields typically see 40–50% savings.

## New dependency

Both `@ofocus/cli` and `@ofocus/mcp` now depend on `@toon-format/toon@^2.3.0`.

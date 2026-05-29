import type { CliOutput } from "@ofocus/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { encode } from "@toon-format/toon";

/**
 * The serialization format for MCP tool results.
 *
 * - `'toon'` – TOON encoding (default). Approximately 40% smaller than JSON
 *              for the uniform array-of-objects shapes that dominate this SDK's
 *              output. Agents benefit from the token savings; humans rarely read
 *              MCP tool output directly.
 *              See https://toonformat.dev/ for the format specification.
 * - `'json'` – Pretty-printed JSON for callers that require it.
 *
 * @public
 */
export type McpOutputFormat = "toon" | "json";

/**
 * Format SDK result as MCP tool result.
 *
 * Converts the CliOutput format from @ofocus/sdk into the CallToolResult
 * format expected by MCP clients. Successful results include the data payload,
 * while errors are marked with isError: true and include error details.
 *
 * The default format is `'json'` for broad compatibility with all callers,
 * including direct `server.registerTool(...)` registrations that do not inject a
 * `format` input parameter. Descriptor-routed tools (registered via
 * {@link registerMcpTool} in `registry-adapter.ts`) always pass `format`
 * explicitly (defaulting to `'toon'` at the adapter layer), so they are
 * unaffected by this default.
 *
 * @param result - The result from an SDK function call
 * @param format - Serialization format (default: `'json'`)
 * @returns MCP-formatted tool result with text content
 */
export function formatResult<T>(
  result: CliOutput<T>,
  format: McpOutputFormat = "json"
): CallToolResult {
  if (!result.success) {
    // Ensure error has expected structure
    const error = result.error ?? {
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred",
    };

    return {
      content: [
        {
          type: "text" as const,
          text: serializeValue(error, format),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: serializeValue(result.data, format),
      },
    ],
  };
}

/**
 * Serialize a value using the specified format.
 * Falls back to JSON if TOON encoding fails for an unexpected payload shape.
 */
function serializeValue(value: unknown, format: McpOutputFormat): string {
  if (format === "json") {
    return JSON.stringify(value, null, 2);
  }
  // format === 'toon'
  try {
    return encode(value);
  } catch {
    // Defensive fallback: encode() handles all JSON-serializable values, but
    // if an exotic payload shape causes it to throw, fall back to JSON so the
    // caller always receives a usable response.
    return JSON.stringify(value, null, 2);
  }
}

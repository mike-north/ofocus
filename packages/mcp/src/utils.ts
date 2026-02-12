import type { CliOutput } from "@ofocus/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Format SDK result as MCP tool result.
 *
 * Converts the CliOutput format from @ofocus/sdk into the CallToolResult
 * format expected by MCP clients. Successful results include the data payload,
 * while errors are marked with isError: true and include error details.
 *
 * @param result - The result from an SDK function call
 * @returns MCP-formatted tool result with text content
 */
export function formatResult<T>(result: CliOutput<T>): CallToolResult {
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
          text: JSON.stringify(error, null, 2),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result.data, null, 2),
      },
    ],
  };
}

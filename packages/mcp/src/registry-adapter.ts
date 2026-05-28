import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ResolvedCommandDescriptor } from "@ofocus/sdk";
import { formatResult } from "./utils.js";

/**
 * Register a {@link ResolvedCommandDescriptor} as an MCP tool on `server`.
 *
 * The tool name is taken from `descriptor.mcpName` (snake_case). The tool's
 * input schema is the descriptor's `inputSchema.shape` — MCP wants a flat
 * `{ field: ZodType }` object, not a wrapped `z.object(...)`, so we expand it
 * once at registration time.
 *
 * The handler receives the parsed input, delegates to the descriptor's
 * `handler`, and routes the result through {@link formatResult}.
 *
 * @public
 */
export function registerMcpTool<TSchema extends z.AnyZodObject>(
  server: McpServer,
  descriptor: ResolvedCommandDescriptor<z.infer<TSchema>, unknown, TSchema>
): void {
  server.registerTool(
    descriptor.mcpName,
    {
      description: descriptor.description,
      inputSchema: descriptor.inputSchema.shape as Record<string, z.ZodTypeAny>,
    },
    async (params: z.infer<TSchema>) => {
      const result = await descriptor.handler(params);
      return formatResult(result);
    }
  );
}

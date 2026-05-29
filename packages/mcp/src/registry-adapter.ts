import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ResolvedCommandDescriptor } from "@ofocus/sdk";
import { formatResult, type McpOutputFormat } from "./utils.js";

/**
 * Zod schema for the `format` field that is automatically injected into every
 * tool's input schema by {@link registerMcpTool}. Kept here so the schema
 * object is created once at module load time rather than on every registration
 * call.
 */
const formatFieldSchema = z
  .enum(["json", "toon"])
  .optional()
  .default("toon")
  .describe(
    'Output serialization format. "toon" (default) uses Token-Oriented Object Notation ' +
      "(~40% smaller than JSON for uniform arrays — see https://toonformat.dev/), " +
      'which reduces token consumption for agents. Pass "json" for standard JSON.'
  );

/**
 * Register a {@link ResolvedCommandDescriptor} as an MCP tool on `server`.
 *
 * The tool name is taken from `descriptor.mcpName` (snake_case). The tool's
 * input schema is the descriptor's `inputSchema.shape` — MCP wants a flat
 * `{ field: ZodType }` object, not a wrapped `z.object(...)`, so we expand it
 * once at registration time.
 *
 * **Automatic `format` field**: every tool registered through this function
 * receives a `format?: 'json' | 'toon'` parameter (default `'toon'`). This
 * keeps all tools in sync automatically — descriptor authors do not need to
 * opt in or repeat the field definition. The default is `'toon'` because
 * agents (the primary consumers of MCP tools) benefit from the ~40% token
 * savings on the uniform array-of-objects shapes that dominate this SDK's
 * output.
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
  // Extend the descriptor's schema shape with the `format` field.
  // We spread the existing shape and add `format` last so it appears at the
  // end of the tool's parameter list in client UIs.
  const extendedShape: Record<string, z.ZodTypeAny> = {
    ...(descriptor.inputSchema.shape as Record<string, z.ZodTypeAny>),
    format: formatFieldSchema,
  };

  server.registerTool(
    descriptor.mcpName,
    {
      description: descriptor.description,
      inputSchema: extendedShape,
    },
    async (params: z.infer<TSchema> & { format?: McpOutputFormat }) => {
      // Extract the format field before handing params to the descriptor's
      // handler (which doesn't know about format and would reject the extra field).
      const { format = "toon", ...descriptorParams } = params as {
        format?: McpOutputFormat;
        [key: string]: unknown;
      };
      const result = await descriptor.handler(
        descriptorParams as z.infer<TSchema>
      );
      return formatResult(result, format);
    }
  );
}

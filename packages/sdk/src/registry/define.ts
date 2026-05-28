import type { z } from "zod";
import type { CliOutput } from "../types.js";
import type { CommandDescriptor } from "./types.js";
import { toKebabCase, toSnakeCase, validateCanonicalName } from "./naming.js";

/**
 * Resolved descriptor returned by {@link defineCommand}.
 *
 * Every CLI / MCP-derivable field is present (no `undefined`) so consumers can
 * rely on the values without having to apply the same kebab/snake derivation
 * rules themselves.
 *
 * @public
 */
export type ResolvedCommandDescriptor<
  TInput,
  TOutput,
  TSchema extends z.AnyZodObject,
> = Omit<
  Required<CommandDescriptor<TInput, TOutput, TSchema>>,
  "cliPositional"
> & {
  cliPositional: readonly string[];
};

/**
 * Factory for a {@link CommandDescriptor}.
 *
 * Performs canonical-name validation at definition time, verifies that any
 * declared positional fields exist in the schema, and fills in default
 * `cliName` / `mcpName` derivations so consumers can rely on those fields
 * always being present on the resolved descriptor.
 *
 * @typeParam TSchema  - Zod object schema for the command input.
 * @typeParam TOutput  - Successful payload type returned inside `CliOutput`.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { defineCommand } from "@ofocus/sdk";
 *
 * const inboxAdd = defineCommand({
 *   name: "addToInbox",
 *   cliName: "inbox",
 *   mcpName: "inbox_add",
 *   description: "Add a new task to the OmniFocus inbox.",
 *   cliPositional: ["title"],
 *   inputSchema: z.object({
 *     title: z.string().describe("Task title"),
 *     note: z.string().optional().describe("Task note"),
 *   }),
 *   handler: async (input) => addToInbox(input.title, { note: input.note }),
 * });
 * ```
 *
 * @throws RangeError if `name` is not a valid camelCase canonical identifier,
 *         the description is empty, or any `cliPositional` field is missing
 *         from the schema.
 *
 * @public
 */
export function defineCommand<TSchema extends z.AnyZodObject, TOutput>(spec: {
  name: string;
  cliName?: string;
  mcpName?: string;
  description: string;
  inputSchema: TSchema;
  cliPositional?: readonly string[];
  handler: (input: z.infer<TSchema>) => Promise<CliOutput<TOutput>>;
}): ResolvedCommandDescriptor<z.infer<TSchema>, TOutput, TSchema> {
  const nameError = validateCanonicalName(spec.name);
  if (nameError !== null) {
    throw new RangeError(nameError);
  }

  if (spec.description.trim().length === 0) {
    throw new RangeError(
      `Command ${spec.name} must have a non-empty description`
    );
  }

  if (spec.cliPositional !== undefined) {
    const shape = spec.inputSchema.shape as Record<string, unknown>;
    for (const field of spec.cliPositional) {
      if (!(field in shape)) {
        throw new RangeError(
          `Command ${spec.name}: cliPositional field "${field}" is not in the input schema`
        );
      }
    }
  }

  return {
    name: spec.name,
    cliName: spec.cliName ?? toKebabCase(spec.name),
    mcpName: spec.mcpName ?? toSnakeCase(spec.name),
    description: spec.description,
    inputSchema: spec.inputSchema,
    cliPositional: spec.cliPositional ?? [],
    handler: spec.handler,
  };
}

import type { z } from "zod";
import type { CliOutput } from "../types.js";
import type { CommandDescriptor } from "./types.js";
import { toKebabCase, toSnakeCase, validateCanonicalName } from "./naming.js";

/**
 * Factory for a {@link CommandDescriptor}.
 *
 * Performs canonical-name validation at definition time and fills in default
 * `cliName` / `mcpName` derivations so consumers can rely on those fields
 * always being present on the resolved descriptor.
 *
 * @typeParam TSchema  - Zod schema for the command input.
 * @typeParam TOutput  - Successful payload type returned inside `CliOutput`.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { defineCommand } from "@ofocus/sdk";
 *
 * const inboxAdd = defineCommand({
 *   name: "addToInbox",
 *   description: "Add a new task to the OmniFocus inbox.",
 *   inputSchema: z.object({
 *     title: z.string().describe("Task title"),
 *     note: z.string().optional().describe("Task note"),
 *   }),
 *   handler: async (input) => addToInbox(input.title, { note: input.note }),
 * });
 * ```
 *
 * @throws RangeError if `name` is not a valid camelCase canonical identifier.
 *
 * @public
 */
export function defineCommand<
  TSchema extends z.AnyZodObject,
  TOutput,
>(spec: {
  name: string;
  cliName?: string;
  mcpName?: string;
  description: string;
  inputSchema: TSchema;
  handler: (input: z.infer<TSchema>) => Promise<CliOutput<TOutput>>;
}): Required<
  Pick<
    CommandDescriptor<z.infer<TSchema>, TOutput, TSchema>,
    "name" | "cliName" | "mcpName" | "description" | "inputSchema" | "handler"
  >
> {
  const nameError = validateCanonicalName(spec.name);
  if (nameError !== null) {
    throw new RangeError(nameError);
  }

  if (spec.description.trim().length === 0) {
    throw new RangeError(
      `Command ${spec.name} must have a non-empty description`
    );
  }

  return {
    name: spec.name,
    cliName: spec.cliName ?? toKebabCase(spec.name),
    mcpName: spec.mcpName ?? toSnakeCase(spec.name),
    description: spec.description,
    inputSchema: spec.inputSchema,
    handler: spec.handler,
  };
}

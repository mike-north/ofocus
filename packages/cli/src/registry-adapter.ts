import { Command } from "commander";
import { z } from "zod";
import type { CliOutput, ResolvedCommandDescriptor } from "@ofocus/sdk";
import { ErrorCode, createError, toKebabCase } from "@ofocus/sdk";

/**
 * Callback that handles the result of a CLI command. Receives the
 * descriptor's `CliOutput` envelope and the Commander {@link Command} so
 * implementations can read global options off `cmd.optsWithGlobals()`.
 *
 * @public
 */
export type CliOutputHandler = (
  result: CliOutput<unknown>,
  cmd: Command
) => void;

/**
 * Register a {@link ResolvedCommandDescriptor} as a Commander subcommand on
 * `program`.
 *
 * Each top-level field in the descriptor's input schema becomes either a
 * positional argument (if listed in `cliPositional`) or a `--kebab-case`
 * option. Zod types map to Commander as follows:
 *
 * | Zod type                    | Commander shape                |
 * | --------------------------- | ------------------------------ |
 * | `z.string()`                | `--name <value>`               |
 * | `z.number()`                | `--name <value>` with parseInt |
 * | `z.boolean()`               | `--name`                       |
 * | `z.enum([...])`             | `--name <value>` (choices)     |
 * | `z.array(z.string())`       | `--name <values...>`           |
 *
 * Optional and default wrappers are unwrapped before inspection. Unknown
 * Zod types fall through to a plain `--name <value>` string option.
 *
 * @public
 */
export function registerCliCommand<TSchema extends z.AnyZodObject>(
  program: Command,
  descriptor: ResolvedCommandDescriptor<z.infer<TSchema>, unknown, TSchema>,
  handleOutput: CliOutputHandler
): Command {
  const cmd = program
    .command(descriptor.cliName)
    .description(descriptor.description);

  const shape = descriptor.inputSchema.shape as Record<string, z.ZodTypeAny>;
  const positionalSet = new Set(descriptor.cliPositional);

  // Positional arguments first, in the declared order.
  for (const fieldName of descriptor.cliPositional) {
    const fieldSchema = shape[fieldName];
    if (fieldSchema === undefined) {
      throw new Error(
        `registerCliCommand: positional field "${fieldName}" is not in the schema for "${descriptor.name}"`
      );
    }
    const required = !isFieldOptional(fieldSchema);
    const description = fieldSchema.description ?? fieldName;
    const display = required ? `<${fieldName}>` : `[${fieldName}]`;
    cmd.argument(display, description);
  }

  // Remaining fields become --flag options.
  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    if (positionalSet.has(fieldName)) continue;
    addOptionForField(cmd, fieldName, fieldSchema);
  }

  cmd.action(async (...args: unknown[]) => {
    // Commander passes positional args first, then the parsed options object,
    // then the Command itself. We rely on the Command being last because the
    // arity varies per descriptor.
    const cmdInstance = args[args.length - 1] as Command;
    const options = args[args.length - 2] as Record<string, unknown>;
    const positionalValues = args.slice(0, descriptor.cliPositional.length);

    const rawInput: Record<string, unknown> = { ...options };
    descriptor.cliPositional.forEach((fieldName, index) => {
      const value = positionalValues[index];
      if (value !== undefined) {
        rawInput[fieldName] = value;
      }
    });

    // Re-key option names — Commander stores `--repeat-frequency` as
    // `repeatFrequency` already (camelCase) for kebab-flagged options, so
    // no remapping is needed. Empty strings on optional positionals become
    // undefined so the schema treats them as "not provided".
    const parsed = descriptor.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join(".") ?? "input";
      const message = issue?.message ?? "Invalid input";
      handleOutput(
        {
          success: false,
          data: null,
          error: createError(
            ErrorCode.VALIDATION_ERROR,
            `${path}: ${message}`,
            JSON.stringify(parsed.error.issues)
          ),
        },
        cmdInstance
      );
      process.exitCode = 1;
      return;
    }

    const result = await descriptor.handler(parsed.data);
    handleOutput(result, cmdInstance);
    if (!result.success) process.exitCode = 1;
  });

  return cmd;
}

/**
 * Strip ZodOptional, ZodNullable, and ZodDefault wrappers to expose the
 * underlying type for Commander mapping.
 */
function unwrapField(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  optional: boolean;
} {
  let current = schema;
  let optional = false;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      optional = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodDefault) {
      optional = true;
      current = current.removeDefault() as z.ZodTypeAny;
      continue;
    }
    break;
  }
  return { inner: current, optional };
}

function isFieldOptional(schema: z.ZodTypeAny): boolean {
  return unwrapField(schema).optional;
}

function addOptionForField(
  cmd: Command,
  fieldName: string,
  schema: z.ZodTypeAny
): void {
  const flag = `--${toKebabCase(fieldName)}`;
  const description = schema.description ?? fieldName;
  const { inner } = unwrapField(schema);

  if (inner instanceof z.ZodBoolean) {
    cmd.option(flag, description);
    return;
  }

  if (inner instanceof z.ZodNumber) {
    cmd.option(`${flag} <value>`, description, parseNumber);
    return;
  }

  if (inner instanceof z.ZodArray) {
    cmd.option(`${flag} <values...>`, description);
    return;
  }

  if (inner instanceof z.ZodEnum) {
    const choices = (inner as z.ZodEnum<[string, ...string[]]>).options;
    const description2 = `${description} (one of: ${choices.join(", ")})`;
    cmd.option(`${flag} <value>`, description2);
    return;
  }

  // ZodString, ZodLiteral, ZodUnion, and anything unfamiliar: take a string
  // value and let the schema do the runtime validation in safeParse.
  cmd.option(`${flag} <value>`, description);
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected a number, got "${value}"`);
  }
  return parsed;
}

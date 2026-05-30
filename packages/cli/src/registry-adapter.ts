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
 * option. A positional field whose type is `z.array(...)` is rendered as a
 * Commander variadic argument (`<field...>` / `[field...]`); Commander
 * collects the trailing args into an array which is handed to the schema
 * unchanged. A variadic positional must be the last positional field.
 *
 * Zod types map to Commander as follows:
 *
 * | Zod type                    | Commander shape                |
 * | --------------------------- | ------------------------------ |
 * | `z.string()`                | `--name <value>`               |
 * | `z.number()`                | `--name <value>`               |
 * | `z.boolean()`               | `--name`                       |
 * | `z.enum([...])`             | `--name <value>` (choices)     |
 * | `z.array(z.string())`       | `--name <values...>`           |
 * | `z.array(z.number())`       | `--name <values...>`           |
 *
 * Commander itself stores all option values as strings; the adapter coerces
 * to numbers (for `ZodNumber` fields and `ZodArray<ZodNumber>` elements)
 * before handing the raw input to Zod. Uncoercible values are passed
 * through so Zod surfaces them through the standard validation path
 * (`ErrorCode.VALIDATION_ERROR`) rather than aborting via Commander's own
 * parser-error code path.
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
    const { inner } = unwrapField(fieldSchema);
    const required = !isFieldOptional(fieldSchema);
    const description = fieldSchema.description ?? fieldName;
    // Array-typed positionals become Commander variadic args; the trailing
    // CLI tokens are collected into an array passed straight to the schema.
    const token = inner instanceof z.ZodArray ? `${fieldName}...` : fieldName;
    const display = required ? `<${token}>` : `[${token}]`;
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

    // Commander stores option values as strings; coerce to numbers where
    // the schema expects them so Zod doesn't fail with "expected number,
    // received string". Bad coercions are left as the raw string so the
    // schema produces a clean VALIDATION_ERROR instead of throwing.
    coerceInputForSchema(rawInput, shape);

    // Re-key option names — Commander stores `--repeat-frequency` as
    // `repeatFrequency` already (camelCase) for kebab-flagged options, so
    // no remapping is needed.
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
 * Strip ZodOptional, ZodNullable, ZodDefault, and ZodEffects wrappers to
 * expose the underlying type for Commander mapping.
 *
 * `ZodEffects` is produced by `z.preprocess(...)` and `z.transform(...)`.
 * Stripping it allows Commander to see the inner `ZodArray` so the flag is
 * rendered as variadic (`--flag <values...>`) rather than singular
 * (`--flag <value>`). The preprocess function still runs when Zod parses the
 * collected array at `safeParse` time — Commander's role is only to collect
 * the raw tokens.
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
    if (current instanceof z.ZodEffects) {
      // z.preprocess / z.transform — peek at the inner output schema so
      // Commander can determine the correct flag shape. The effects fn still
      // runs during safeParse.
      current = current._def.schema as z.ZodTypeAny;
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
    // Negation form so callers can explicitly set the field to false.
    // Commander stores both under the camelCase field name; `--no-foo`
    // sets `foo: false`, matching the old hand-written CLI conventions.
    cmd.option(
      `--no-${toKebabCase(fieldName)}`,
      `Disable --${toKebabCase(fieldName)}`
    );
    return;
  }

  if (inner instanceof z.ZodNumber) {
    // No custom parser — accept the raw string; coerceInputForSchema converts
    // before safeParse. This keeps invalid input on the safeParse → handler
    // path (VALIDATION_ERROR) instead of Commander's own error path.
    cmd.option(`${flag} <value>`, description);
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

/**
 * Coerce string-typed CLI values to the JS shapes the descriptor's schema
 * expects. Mutates `input` in place.
 *
 * Commander stores every option as a string (or array of strings for
 * variadic options). Without coercion, a schema field like `z.number()`
 * would fail with "expected number, received string" before the value
 * reached the handler. We coerce here so the schema sees the JS type it
 * expects, and uncoercible values are left as strings so Zod produces a
 * clean validation error rather than aborting.
 */
function coerceInputForSchema(
  input: Record<string, unknown>,
  shape: Record<string, z.ZodTypeAny>
): void {
  for (const [field, schema] of Object.entries(shape)) {
    const value = input[field];
    if (value === undefined) continue;
    const { inner } = unwrapField(schema);

    if (inner instanceof z.ZodNumber && typeof value === "string") {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        input[field] = num;
      }
      // NaN: leave as string; z.number() will reject it cleanly.
      continue;
    }

    if (inner instanceof z.ZodArray && Array.isArray(value)) {
      const elementInner = unwrapField(
        (inner as z.ZodArray<z.ZodTypeAny>).element
      ).inner;
      if (elementInner instanceof z.ZodNumber) {
        input[field] = (value as unknown[]).map((v): unknown => {
          if (typeof v !== "string") return v;
          const num = Number(v);
          return Number.isNaN(num) ? v : num;
        });
      }
    }
  }
}

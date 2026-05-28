import type { z } from "zod";
import type { CliOutput } from "../types.js";

/**
 * Declarative description of a single command on the ofocus surface.
 *
 * One descriptor drives all three consumers:
 * - The SDK function (the `handler`).
 * - The CLI: name → kebab-case subcommand, `inputSchema` → Commander options,
 *   `description` → help text.
 * - The MCP server: name → snake_case tool, `inputSchema` → tool input schema,
 *   `description` → tool description shown to the agent.
 *
 * Defining one descriptor per command means the surfaces never drift. New
 * commands land in the registry and propagate to CLI + MCP automatically.
 *
 * @typeParam TInput  - Inferred input shape after parsing `inputSchema`.
 * @typeParam TOutput - Successful payload returned inside `CliOutput`.
 *
 * @public
 */
export interface CommandDescriptor<
  TInput = unknown,
  TOutput = unknown,
  TSchema extends z.AnyZodObject = z.AnyZodObject,
> {
  /**
   * Canonical camelCase identifier, matching the SDK function name.
   * Display names for CLI / MCP are derived from this via `toKebabCase` /
   * `toSnakeCase`. Override per-surface only when the natural derivation
   * is misleading (e.g. a deliberately shorter CLI alias).
   */
  name: string;

  /**
   * Optional CLI display name (kebab-case). Defaults to `toKebabCase(name)`.
   * Set this when a command needs a CLI-specific alias that does not match
   * the derivation rule.
   */
  cliName?: string;

  /**
   * Optional MCP tool name (snake_case). Defaults to `toSnakeCase(name)`.
   * Set this only when a tool needs a name that does not match the
   * derivation rule (e.g. a domain-prefixed override like `omnifocus_eval`).
   */
  mcpName?: string;

  /**
   * Ordered list of input-schema field names that should be exposed as
   * **positional** arguments on the CLI rather than `--flag` options. The
   * remaining fields are registered as options. MCP ignores this field
   * because tools have no positional concept — every field is keyed.
   *
   * @example
   * ```ts
   * cliPositional: ["title"]
   * // CLI: ofocus inbox "<title>" [--note ...]
   * ```
   */
  cliPositional?: readonly string[];

  /**
   * One- or two-sentence description used as both CLI help text and MCP tool
   * description. Keep it tight — verbose descriptions inflate every agent
   * call's token budget. Examples and flag details live in the
   * `inputSchema` field `.describe()` annotations.
   */
  description: string;

  /**
   * Zod schema for the command's input. Drives:
   * - CLI: each top-level field becomes a Commander flag.
   * - MCP: passed through as the tool's input schema.
   * - SDK: parsed at the boundary before invoking `handler`.
   *
   * The generic constraint `z.AnyZodObject` enforces an object schema at the
   * type level — top-level fields are what map to CLI flags / MCP tool
   * properties. Add `.describe("…")` to each field so the description flows
   * to both CLI help and the MCP schema.
   */
  inputSchema: TSchema;

  /**
   * The SDK function bound to this descriptor. Receives the parsed input and
   * returns the standard `CliOutput<TOutput>` envelope.
   *
   * Handlers should be thin: validate via the schema, delegate to the
   * underlying SDK function, return the result. They MUST NOT throw — wrap
   * errors with `failure(...)`.
   */
  handler: (input: TInput) => Promise<CliOutput<TOutput>>;
}

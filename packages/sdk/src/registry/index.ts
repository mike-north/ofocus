/**
 * Foundation for the centralized command registry.
 *
 * One {@link CommandDescriptor} per command will drive the SDK function, the
 * CLI subcommand (kebab-case), and the MCP tool (snake_case). Consumers
 * iterate over an array of descriptors to derive their surfaces — eliminating
 * the drift that arises from maintaining three parallel command lists by
 * hand.
 *
 * This module exports the descriptor type, the {@link defineCommand} factory,
 * and the canonical {@link allCommandDescriptors} array that lists every
 * registered command descriptor in one place.
 */

export type { CommandDescriptor } from "./types.js";
export { toKebabCase, toSnakeCase, validateCanonicalName } from "./naming.js";
export { defineCommand } from "./define.js";
export type { ResolvedCommandDescriptor } from "./define.js";
export { allCommandDescriptors } from "./all-descriptors.js";

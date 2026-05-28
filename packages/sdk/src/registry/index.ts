/**
 * Foundation for the centralized command registry.
 *
 * One {@link CommandDescriptor} per command will drive the SDK function, the
 * CLI subcommand (kebab-case), and the MCP tool (snake_case). Consumers
 * iterate over an array of descriptors to derive their surfaces — eliminating
 * the drift that arises from maintaining three parallel command lists by
 * hand.
 *
 * This module exports the descriptor type and the {@link defineCommand}
 * factory. The descriptor array itself will be assembled and exported as
 * commands migrate to the registry; until then, CLI and MCP continue to
 * declare commands the old way.
 */

export type { CommandDescriptor } from "./types.js";
export {
  toKebabCase,
  toSnakeCase,
  validateCanonicalName,
} from "./naming.js";
export { defineCommand } from "./define.js";

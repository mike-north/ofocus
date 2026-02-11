import type { CliOutput, CommandInfo } from "../lib/types.js";
import { success } from "../lib/output.js";
import { commandRegistry } from "./index.js";

/**
 * List all available commands with their descriptions for semantic activation.
 */
export function listCommands(): CliOutput<{ commands: CommandInfo[] }> {
  return success({ commands: commandRegistry });
}

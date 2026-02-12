import type { CliOutput, CommandInfo } from "@ofocus/sdk";
import { success } from "@ofocus/sdk";
import { commandRegistry } from "./index.js";

/**
 * List all available commands with their descriptions for semantic activation.
 */
export function listCommands(): CliOutput<{ commands: CommandInfo[] }> {
  return success({ commands: commandRegistry });
}

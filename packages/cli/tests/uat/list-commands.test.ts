/**
 * UAT tests for the `list-commands` CLI command.
 *
 * These tests spawn the real CLI binary as a subprocess and assert on stdout,
 * stderr, and exit codes — exactly as a user or agent would invoke it.
 *
 * The suite is skipped by default so it does not run in CI without a built CLI.
 * To opt in:
 *   pnpm -F @ofocus/cli build && OFOCUS_UAT=1 pnpm -F @ofocus/cli test
 *
 * @see https://github.com/tj/commander.js — CLI framework used by @ofocus/cli
 */
import { describe, it, expect } from "vitest";
import { runCli } from "./helpers.js";
import type { CliOutput, CommandInfo } from "@ofocus/sdk";

/**
 * Skip every test in this file unless the caller has opted in via env var.
 * This prevents the suite from running in CI environments where the dist may
 * not be present and no OmniFocus interaction is expected.
 */
const skipCondition = process.env.OFOCUS_UAT !== "1";

describe.skipIf(skipCondition)("UAT: list-commands (subprocess)", () => {
  it("exits 0 with --json and stdout is valid JSON", async () => {
    const result = await runCli(["list-commands", "--json"]);

    expect(result.exitCode).toBe(0);
    // Must be valid JSON — parse throws on invalid input
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it("JSON output has the expected CliOutput<{commands}> envelope shape", async () => {
    const result = await runCli(["list-commands", "--json"]);

    const parsed = JSON.parse(result.stdout) as CliOutput<{
      commands: CommandInfo[];
    }>;

    // Top-level envelope
    expect(parsed.success).toBe(true);
    expect(parsed.error).toBeNull();
    expect(parsed.data).not.toBeNull();

    // Inner shape: data.commands is the array (not data directly)
    const commands = parsed.data?.commands;
    expect(Array.isArray(commands)).toBe(true);
    expect(commands!.length).toBeGreaterThan(0);

    // Every entry must have the full CommandInfo shape
    for (const cmd of commands!) {
      expect(typeof cmd.name).toBe("string");
      expect(cmd.name.length).toBeGreaterThan(0);
      expect(typeof cmd.description).toBe("string");
      expect(cmd.description.length).toBeGreaterThan(0);
      expect(typeof cmd.usage).toBe("string");
      expect(cmd.usage.length).toBeGreaterThan(0);
    }
  });

  it("JSON output contains at least the core domain command names", async () => {
    const result = await runCli(["list-commands", "--json"]);

    const parsed = JSON.parse(result.stdout) as CliOutput<{
      commands: CommandInfo[];
    }>;
    const names = new Set(parsed.data?.commands.map((c) => c.name));

    // These represent the four domain pillars (tasks, projects, tags, folders)
    // plus the meta-command itself. If any go missing, a registration was
    // accidentally dropped.
    const coreNames = [
      "list-commands",
      "tasks",
      "projects",
      "tags",
      "folders",
    ] as const;

    for (const name of coreNames) {
      expect(names.has(name), `command "${name}" should be registered`).toBe(
        true
      );
    }
  });

  it("exits 0 with --human and stdout contains 'tasks' and 'projects'", async () => {
    const result = await runCli(["list-commands", "--human"]);

    expect(result.exitCode).toBe(0);

    // The list-commands data shape ({ commands: [...] }) does not match any
    // named type guard in the human formatter, so it falls through to the
    // generic JSON serialization of just the data portion. The command names
    // "tasks" and "projects" must appear somewhere in the output.
    expect(result.stdout).toContain("tasks");
    expect(result.stdout).toContain("projects");
  });

  it("--human exits 0 and omits the top-level CliOutput success/error envelope", async () => {
    const result = await runCli(["list-commands", "--human"]);

    expect(result.exitCode).toBe(0);

    // The human formatter outputs just result.data (the inner object), not
    // the full CliOutput envelope. The top-level "success" and "error" keys
    // from the envelope must NOT appear in the output.
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsed, "success")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, "error")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, "commands")).toBe(true);
  });
});

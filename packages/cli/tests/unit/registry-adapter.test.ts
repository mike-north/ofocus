import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { z } from "zod";
import { defineCommand } from "@ofocus/sdk";
import { success, failure, ErrorCode, createError } from "@ofocus/sdk";
import { registerCliCommand } from "../../src/registry-adapter.js";

describe("registerCliCommand", () => {
  beforeEach(() => {
    // Reset between tests so we don't leak process.exitCode.
    process.exitCode = 0;
  });

  it("registers the descriptor's cliName as the subcommand", () => {
    const program = new Command();
    program.exitOverride();
    const cmd = defineCommand({
      name: "doThing",
      cliName: "do-the-thing",
      description: "Do the thing.",
      inputSchema: z.object({}),
      handler: async () => await Promise.resolve(success({ ok: true })),
    });

    registerCliCommand(program, cmd, () => undefined);

    const sub = program.commands.find((c) => c.name() === "do-the-thing");
    expect(sub).toBeDefined();
    expect(sub?.description()).toBe("Do the thing.");
  });

  it("registers each cliPositional field as a positional argument", () => {
    const program = new Command();
    const cmd = defineCommand({
      name: "thing",
      description: "Do.",
      cliPositional: ["title"],
      inputSchema: z.object({
        title: z.string().describe("The title"),
      }),
      handler: async () => await Promise.resolve(success({ ok: true })),
    });

    registerCliCommand(program, cmd, () => undefined);

    const sub = program.commands.find((c) => c.name() === "thing");
    const positional = sub?.registeredArguments;
    expect(positional?.[0]?.name()).toBe("title");
    expect(positional?.[0]?.required).toBe(true);
  });

  it("registers each non-positional field as a --kebab-case flag", () => {
    const program = new Command();
    const cmd = defineCommand({
      name: "thing",
      description: "Do.",
      inputSchema: z.object({
        repeatFrequency: z.string().optional().describe("freq"),
        flag: z.boolean().optional().describe("flagged"),
      }),
      handler: async () => await Promise.resolve(success({ ok: true })),
    });

    registerCliCommand(program, cmd, () => undefined);

    const sub = program.commands.find((c) => c.name() === "thing");
    const flagNames = sub?.options.map((o) => o.long);
    expect(flagNames).toContain("--repeat-frequency");
    expect(flagNames).toContain("--flag");
  });

  it("emits a value-taking flag for non-boolean fields and a value-less flag for booleans", () => {
    const program = new Command();
    const cmd = defineCommand({
      name: "thing",
      description: "Do.",
      inputSchema: z.object({
        note: z.string().optional().describe("note"),
        flagged: z.boolean().optional().describe("flagged"),
      }),
      handler: async () => await Promise.resolve(success({ ok: true })),
    });

    registerCliCommand(program, cmd, () => undefined);

    const sub = program.commands.find((c) => c.name() === "thing");
    const note = sub?.options.find((o) => o.long === "--note");
    const flagged = sub?.options.find((o) => o.long === "--flagged");
    expect(note?.required).toBe(true);
    expect(flagged?.required).toBeFalsy();
  });

  it("invokes the handler with parsed input on success", async () => {
    const handler = vi.fn(
      async (input: { title: string; note?: string | undefined }) =>
        await Promise.resolve(success({ id: input.title, note: input.note }))
    );
    const onOutput = vi.fn();

    const program = new Command();
    const cmd = defineCommand({
      name: "thing",
      description: "Do.",
      cliPositional: ["title"],
      inputSchema: z.object({
        title: z.string(),
        note: z.string().optional(),
      }),
      handler,
    });

    registerCliCommand(program, cmd, onOutput);

    await program.parseAsync(["node", "test", "thing", "Buy milk", "--note", "From the store"]);

    expect(handler).toHaveBeenCalledWith({
      title: "Buy milk",
      note: "From the store",
    });
    expect(onOutput).toHaveBeenCalledOnce();
    const [result] = onOutput.mock.calls[0]!;
    expect((result as { success: boolean }).success).toBe(true);
  });

  it("reports validation errors without invoking the handler", async () => {
    const handler = vi.fn(
      async () => await Promise.resolve(success({ ok: true }))
    );
    const onOutput = vi.fn();

    const program = new Command();
    const cmd = defineCommand({
      name: "thing",
      description: "Do.",
      inputSchema: z.object({
        count: z.number().int().positive(),
      }),
      handler,
    });

    registerCliCommand(program, cmd, onOutput);

    await program.parseAsync(["node", "test", "thing", "--count", "-5"]);

    expect(handler).not.toHaveBeenCalled();
    expect(onOutput).toHaveBeenCalledOnce();
    const [result] = onOutput.mock.calls[0]!;
    expect((result as { success: boolean }).success).toBe(false);
    expect(
      (result as { error?: { code: string } }).error?.code
    ).toBe(ErrorCode.VALIDATION_ERROR);
    expect(process.exitCode).toBe(1);
  });

  it("sets process.exitCode to 1 when the handler returns failure", async () => {
    const handler = vi.fn(
      async () =>
        await Promise.resolve(
          failure(createError(ErrorCode.TASK_NOT_FOUND, "no"))
        )
    );
    const onOutput = vi.fn();

    const program = new Command();
    const cmd = defineCommand({
      name: "thing",
      description: "Do.",
      inputSchema: z.object({}),
      handler,
    });

    registerCliCommand(program, cmd, onOutput);

    await program.parseAsync(["node", "test", "thing"]);

    expect(process.exitCode).toBe(1);
  });

  it("supports variadic string arrays via --name <values...>", async () => {
    const handler = vi.fn(
      async (input: { tags?: string[] }) =>
        await Promise.resolve(success({ tags: input.tags ?? [] }))
    );
    const onOutput = vi.fn();

    const program = new Command();
    const cmd = defineCommand({
      name: "thing",
      description: "Do.",
      inputSchema: z.object({
        tags: z.array(z.string()).optional(),
      }),
      handler,
    });

    registerCliCommand(program, cmd, onOutput);

    await program.parseAsync([
      "node",
      "test",
      "thing",
      "--tags",
      "Work",
      "Home",
      "Errands",
    ]);

    expect(handler).toHaveBeenCalledWith({ tags: ["Work", "Home", "Errands"] });
  });

  it("coerces number flags from their string form", async () => {
    const handler = vi.fn(
      async (input: { count?: number }) =>
        await Promise.resolve(success(input.count ?? 0))
    );

    const program = new Command();
    const cmd = defineCommand({
      name: "thing",
      description: "Do.",
      inputSchema: z.object({ count: z.number().optional() }),
      handler,
    });

    registerCliCommand(program, cmd, () => undefined);
    await program.parseAsync(["node", "test", "thing", "--count", "42"]);

    expect(handler).toHaveBeenCalledWith({ count: 42 });
  });
});

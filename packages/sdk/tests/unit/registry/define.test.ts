import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineCommand } from "../../../src/registry/define.js";
import { success } from "../../../src/result.js";

const noopHandler = async () =>
  await Promise.resolve(success({ ok: true as const }));

describe("defineCommand", () => {
  it("returns the canonical name unchanged", () => {
    const cmd = defineCommand({
      name: "addToInbox",
      description: "Add a task to the inbox.",
      inputSchema: z.object({ title: z.string() }),
      handler: noopHandler,
    });
    expect(cmd.name).toBe("addToInbox");
  });

  it("derives cliName as kebab-case by default", () => {
    const cmd = defineCommand({
      name: "createProject",
      description: "Create a new project.",
      inputSchema: z.object({ name: z.string() }),
      handler: noopHandler,
    });
    expect(cmd.cliName).toBe("create-project");
  });

  it("derives mcpName as snake_case by default", () => {
    const cmd = defineCommand({
      name: "createProject",
      description: "Create a new project.",
      inputSchema: z.object({ name: z.string() }),
      handler: noopHandler,
    });
    expect(cmd.mcpName).toBe("create_project");
  });

  it("preserves an explicit cliName override", () => {
    const cmd = defineCommand({
      name: "addToInbox",
      cliName: "inbox",
      description: "Add a task to the inbox.",
      inputSchema: z.object({ title: z.string() }),
      handler: noopHandler,
    });
    expect(cmd.cliName).toBe("inbox");
  });

  it("preserves an explicit mcpName override", () => {
    const cmd = defineCommand({
      name: "evaluate",
      mcpName: "omnifocus_eval",
      description: "Evaluate an OmniJS script.",
      inputSchema: z.object({ script: z.string() }),
      handler: noopHandler,
    });
    expect(cmd.mcpName).toBe("omnifocus_eval");
  });

  it("threads description through unchanged", () => {
    const cmd = defineCommand({
      name: "inbox",
      description: "Add a task to the inbox in two sentences. Second one.",
      inputSchema: z.object({ title: z.string() }),
      handler: noopHandler,
    });
    expect(cmd.description).toBe(
      "Add a task to the inbox in two sentences. Second one."
    );
  });

  it("preserves the input schema reference", () => {
    const schema = z.object({ title: z.string() });
    const cmd = defineCommand({
      name: "inbox",
      description: "Add a task.",
      inputSchema: schema,
      handler: noopHandler,
    });
    expect(cmd.inputSchema).toBe(schema);
  });

  it("rejects an empty name at definition time", () => {
    expect(() =>
      defineCommand({
        name: "",
        description: "x",
        inputSchema: z.object({}),
        handler: noopHandler,
      })
    ).toThrow(RangeError);
  });

  it("rejects a kebab-case name at definition time", () => {
    expect(() =>
      defineCommand({
        name: "create-project",
        description: "x",
        inputSchema: z.object({}),
        handler: noopHandler,
      })
    ).toThrow(RangeError);
  });

  it("rejects an empty description at definition time", () => {
    expect(() =>
      defineCommand({
        name: "inbox",
        description: "   ",
        inputSchema: z.object({}),
        handler: noopHandler,
      })
    ).toThrow(/non-empty description/);
  });

  it("returns the handler reference unchanged so consumers can invoke it directly", () => {
    const cmd = defineCommand({
      name: "inbox",
      description: "Add a task.",
      inputSchema: z.object({ title: z.string() }),
      handler: noopHandler,
    });
    expect(cmd.handler).toBe(noopHandler);
  });
});

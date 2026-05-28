import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineCommand, success } from "@ofocus/sdk";
import { registerMcpTool } from "../src/registry-adapter.js";

describe("registerMcpTool", () => {
  it("registers the tool under the descriptor's mcpName", () => {
    const registerTool = vi.fn();
    const mockServer = { registerTool } as unknown as McpServer;

    const cmd = defineCommand({
      name: "doThing",
      mcpName: "do_a_thing",
      description: "Do.",
      inputSchema: z.object({ title: z.string() }),
      handler: async () => await Promise.resolve(success({ ok: true })),
    });

    registerMcpTool(mockServer, cmd);

    expect(registerTool).toHaveBeenCalledOnce();
    expect(registerTool.mock.calls[0]![0]).toBe("do_a_thing");
  });

  it("passes the descriptor's description and schema shape to registerTool", () => {
    const registerTool = vi.fn();
    const mockServer = { registerTool } as unknown as McpServer;

    const cmd = defineCommand({
      name: "doThing",
      description: "Do the thing.",
      inputSchema: z.object({
        title: z.string().describe("the title"),
        flag: z.boolean().optional().describe("optional flag"),
      }),
      handler: async () => await Promise.resolve(success({ ok: true })),
    });

    registerMcpTool(mockServer, cmd);

    const [, config] = registerTool.mock.calls[0]! as [
      string,
      { description: string; inputSchema: Record<string, unknown> },
      unknown,
    ];
    expect(config.description).toBe("Do the thing.");
    // The inputSchema is the descriptor's schema's `.shape` — top-level keys
    // match the schema's fields, and each value is the field's Zod schema.
    expect(Object.keys(config.inputSchema).sort()).toEqual([
      "flag",
      "title",
    ]);
  });

  it("invokes the descriptor's handler with the supplied params and returns a formatted result", async () => {
    const handler = vi.fn(
      async (input: { title: string }) =>
        await Promise.resolve(success({ id: input.title }))
    );
    const registerTool = vi.fn();
    const mockServer = { registerTool } as unknown as McpServer;

    const cmd = defineCommand({
      name: "doThing",
      description: "Do.",
      inputSchema: z.object({ title: z.string() }),
      handler,
    });

    registerMcpTool(mockServer, cmd);

    const handlerArg = registerTool.mock.calls[0]![2] as (
      params: unknown
    ) => Promise<{ content: { type: string; text: string }[] }>;
    const response = await handlerArg({ title: "Buy milk" });

    expect(handler).toHaveBeenCalledWith({ title: "Buy milk" });
    expect(response.content[0]?.type).toBe("text");
    // formatResult unwraps the CliOutput envelope and serializes only the
    // payload (or the error on failure). Successful tools should produce
    // the inner data directly so MCP clients see the useful shape.
    const parsed = JSON.parse(response.content[0]!.text) as { id: string };
    expect(parsed.id).toBe("Buy milk");
  });
});

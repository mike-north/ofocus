/**
 * Tests for registerMcpTool — MCP tool registration adapter.
 *
 * @see https://toonformat.dev/ TOON format specification
 * @see https://www.npmjs.com/package/@toon-format/toon @toon-format/toon package
 */
import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineCommand, success } from "@ofocus/sdk";
import { decode } from "@toon-format/toon";
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

  it("passes the descriptor's description and schema shape (plus format) to registerTool", () => {
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
    // The inputSchema is the descriptor's schema's `.shape` plus the
    // automatically-injected `format` field.
    expect(Object.keys(config.inputSchema).sort()).toEqual([
      "flag",
      "format",
      "title",
    ]);
  });

  it("automatically injects a 'format' field into every tool's input schema", () => {
    const registerTool = vi.fn();
    const mockServer = { registerTool } as unknown as McpServer;

    const cmd = defineCommand({
      name: "doThing",
      description: "Do.",
      inputSchema: z.object({ id: z.string() }),
      handler: async () => await Promise.resolve(success({ ok: true })),
    });

    registerMcpTool(mockServer, cmd);

    const [, config] = registerTool.mock.calls[0]! as [
      string,
      { description: string; inputSchema: Record<string, unknown> },
      unknown,
    ];
    expect(Object.keys(config.inputSchema)).toContain("format");
  });

  it("invokes the descriptor's handler without the format field in the params", async () => {
    // The format field is extracted by the adapter before calling the
    // descriptor's handler. The handler should receive only its own fields.
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
    await handlerArg({ title: "Buy milk", format: "toon" });

    // Handler receives only the descriptor's own fields — no `format`
    expect(handler).toHaveBeenCalledWith({ title: "Buy milk" });
  });

  it("returns TOON-encoded result when format='toon'", async () => {
    // Default and explicit 'toon': result should be TOON-encoded.
    // TOON objects use `key: value` lines, not JSON braces.
    // @see https://toonformat.dev/ §2 "Objects"
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
    const response = await handlerArg({ title: "Buy milk", format: "toon" });

    expect(response.content[0]?.type).toBe("text");
    const text = response.content[0]!.text;
    // TOON output — not JSON (no leading `{`)
    expect(text).not.toMatch(/^\{/);
    // Round-trip: decode gives back the data
    const decoded = decode(text) as { id: string };
    expect(decoded.id).toBe("Buy milk");
  });

  it("returns JSON-encoded result when format='json'", async () => {
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
    const response = await handlerArg({ title: "Buy milk", format: "json" });

    expect(response.content[0]?.type).toBe("text");
    // JSON-encoded: parseable with JSON.parse
    const parsed = JSON.parse(response.content[0]!.text) as { id: string };
    expect(parsed.id).toBe("Buy milk");
  });

  it("defaults to TOON format when format is omitted", async () => {
    // The default is 'toon' because agents benefit from ~40% token savings.
    // @see https://toonformat.dev/
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
    // No format field — should default to TOON
    const response = await handlerArg({ title: "Buy milk" });

    const text = response.content[0]!.text;
    // TOON output — not JSON
    expect(text).not.toMatch(/^\{/);
    expect(text).toContain("id: Buy milk");
  });
});

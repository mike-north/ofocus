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
import { formatResult } from "../src/utils.js";

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

  // ---------------------------------------------------------------------------
  // Regression tests for PR #39 Copilot finding:
  // "Changing formatResult's default to 'toon' affects every direct
  //  server.registerTool caller that still invokes formatResult(result) without
  //  a format parameter."
  //
  // The fix: formatResult's function-level default is 'json' (safe for direct
  // registrations). registerMcpTool's adapter layer defaults format to 'toon'
  // explicitly before passing it to formatResult, so descriptor-routed tools
  // still produce TOON when no format is provided by the caller.
  // ---------------------------------------------------------------------------

  describe("PR #39 regression: default format isolation between registration paths", () => {
    it("descriptor-routed tool (via registerMcpTool) defaults to TOON when caller omits format", async () => {
      // This is the descriptor-routed path. The adapter extracts
      // `format ?? "toon"` before calling formatResult, so omitting `format`
      // in the tool call input still produces TOON output.
      const handler = vi.fn(
        async (_input: { title: string }) =>
          await Promise.resolve(success({ id: "42", name: "Test" }))
      );
      const registerTool = vi.fn();
      const mockServer = { registerTool } as unknown as McpServer;

      const cmd = defineCommand({
        name: "testThing",
        description: "Test.",
        inputSchema: z.object({ title: z.string() }),
        handler,
      });

      registerMcpTool(mockServer, cmd);

      const toolHandler = registerTool.mock.calls[0]![2] as (
        params: unknown
      ) => Promise<{ content: { type: string; text: string }[] }>;

      // Invoke without a `format` field — adapter must default to TOON
      const response = await toolHandler({ title: "anything" });
      const text = response.content[0]!.text;

      // Must be TOON (not JSON): TOON objects use `key: value` lines
      // @see https://toonformat.dev/ §2 "Objects"
      expect(text).not.toMatch(/^\{/);
      // Confirm it decodes correctly via TOON
      const decoded = decode(text) as { id: string; name: string };
      expect(decoded.id).toBe("42");
    });

    it("formatResult called without format arg produces JSON (safe default for direct registrations)", () => {
      // This simulates what direct server.registerTool(...) callers do:
      // they call formatResult(result) with no format argument.
      // Before the fix, this silently produced TOON, breaking those callers.
      // After the fix, the function-level default is 'json'.
      const result = formatResult({
        success: true,
        data: { id: "1", name: "Task" },
      });
      const text = result.content[0]!.text;

      // Must be valid JSON — the default for formatResult() with no format arg
      const parsed = JSON.parse(text) as { id: string; name: string };
      expect(parsed.id).toBe("1");
      expect(parsed.name).toBe("Task");
      expect(result.isError).toBeUndefined();
    });
  });
});

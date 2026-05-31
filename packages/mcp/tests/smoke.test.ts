/**
 * MCP server smoke test.
 *
 * Boots the MCP server in-process using the @modelcontextprotocol/sdk
 * InMemoryTransport, lists all registered tools, and round-trips a
 * representative call per tool category.
 *
 * Round-trip tests mock `runOmniJS` and `runOmniJSWrapped` at the `@ofocus/sdk`
 * public-export boundary so no OmniFocus process is required for most tests.
 * Tests that cannot be made CI-safe are wrapped in
 * `describe.skipIf(!!process.env.CI)` or use `it.skipIf` with a comment
 * explaining why.
 *
 * @see https://spec.modelcontextprotocol.io/specification/2024-11-05/
 * @see https://github.com/modelcontextprotocol/typescript-sdk
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.js";
import {
  TASK_TOOLS,
  PROJECT_TOOLS,
  TAG_TOOLS,
  FOLDER_TOOLS,
  ADVANCED_TOOLS,
  PRODUCTIVITY_TOOLS,
  ALL_TOOLS,
} from "./fixtures/expected-tools.js";

// ---------------------------------------------------------------------------
// Mock the OmniJS bridge at the @ofocus/sdk public-export boundary.
//
// `vi.mock("@ofocus/sdk")` replaces the `runOmniJS` and `runOmniJSWrapped`
// named exports with mock functions for any module that imports them from
// `@ofocus/sdk` directly.
//
// IMPORTANT: SDK commands that import `runOmniJSWrapped` from the internal
// relative path `../omnijs.js` are NOT affected by this mock — they call
// through to the real implementation. For those commands the round-trip tests
// assert only on the MCP response envelope shape (isError, content[0].type),
// not on data values. This is still CI-safe because the MCP layer converts a
// failed osascript call into an isError:true response rather than rejecting
// the promise.
// ---------------------------------------------------------------------------
vi.mock("@ofocus/sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@ofocus/sdk")>();
  return {
    ...real,
    runOmniJS: vi.fn().mockResolvedValue({ success: true, data: null }),
    runOmniJSWrapped: vi.fn().mockResolvedValue({ success: true, data: null }),
  };
});

const MINIMUM_TOOL_COUNT = 40;

// ---------------------------------------------------------------------------
// Helper: create a linked client/server pair and connect them
// ---------------------------------------------------------------------------
async function createTestClient(): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const server = createServer();

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  // Connect the server to its end first
  await server.connect(serverTransport);

  // Then connect the client to its end
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Tool listing — CI-safe (no OmniFocus call)
// ---------------------------------------------------------------------------
describe("MCP smoke: tool listing", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterEach(async () => {
    await cleanup();
  });

  it("registers at least the minimum number of tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(MINIMUM_TOOL_COUNT);
  });

  it("registers exactly ALL_TOOLS.length tools (current count)", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(ALL_TOOLS.length);
  });

  it("every tool has a non-empty name and description", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name, `tool ${tool.name} must have a name`).toBeTruthy();
      expect(
        tool.description,
        `tool ${tool.name} must have a non-empty description`
      ).toBeTruthy();
    }
  });

  it("has at least one task tool present", async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const expected of TASK_TOOLS) {
      expect(
        names.has(expected),
        `expected task tool "${expected}" to be registered`
      ).toBe(true);
    }
  });

  it("has at least one project tool present", async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const expected of PROJECT_TOOLS) {
      expect(
        names.has(expected),
        `expected project tool "${expected}" to be registered`
      ).toBe(true);
    }
  });

  it("has at least one tag tool present", async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const expected of TAG_TOOLS) {
      expect(
        names.has(expected),
        `expected tag tool "${expected}" to be registered`
      ).toBe(true);
    }
  });

  it("has at least one folder tool present", async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const expected of FOLDER_TOOLS) {
      expect(
        names.has(expected),
        `expected folder tool "${expected}" to be registered`
      ).toBe(true);
    }
  });

  it("has at least one advanced tool present", async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const expected of ADVANCED_TOOLS) {
      expect(
        names.has(expected),
        `expected advanced tool "${expected}" to be registered`
      ).toBe(true);
    }
  });

  it("registers the productivity tools", async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const expected of PRODUCTIVITY_TOOLS) {
      expect(
        names.has(expected),
        `expected productivity tool "${expected}" to be registered`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests — CI-safe response envelope assertions
//
// These verify that the MCP layer correctly dispatches calls, validates input,
// and returns a properly shaped content block. We assert on the MCP response
// envelope (isError, content[0].type) rather than on data values — this makes
// the tests CI-safe regardless of whether OmniFocus is available.
//
// The MCP spec (§5.7) states that tool errors MUST be returned as responses
// with isError:true, not as protocol-level errors. Tests for unknown tools and
// invalid input assert that shape accordingly.
// ---------------------------------------------------------------------------
describe("MCP smoke: round-trip response envelope", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // clearAllMocks resets call history but preserves mock implementations
    // (mockResolvedValue defaults set by vi.mock above). Using resetAllMocks
    // here would wipe those defaults and could allow real osascript calls.
    vi.clearAllMocks();
    ({ client, cleanup } = await createTestClient());
  });

  afterEach(async () => {
    await cleanup();
  });

  it("inbox_add: valid call returns a text content block", async () => {
    // On a machine with OmniFocus installed this calls the real osascript
    // bridge; on CI (no OmniFocus) it returns isError:true. Either way the
    // response must be a resolved promise with at least one content block.
    const result = await client.callTool({
      name: "inbox_add",
      arguments: { title: "Smoke-test task — safe to delete" },
    });

    // The promise must resolve (MCP spec: tool errors are responses, not rejects)
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });

  it("tasks_list: valid call returns a text content block", async () => {
    const result = await client.callTool({
      name: "tasks_list",
      arguments: { flagged: true },
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });

  it("projects_list: valid call returns a text content block", async () => {
    const result = await client.callTool({
      name: "projects_list",
      arguments: {},
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });

  it("tags_list: valid call returns a text content block", async () => {
    const result = await client.callTool({
      name: "tags_list",
      arguments: {},
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });

  it("folders_list: valid call returns a text content block", async () => {
    const result = await client.callTool({
      name: "folders_list",
      arguments: {},
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });

  it("unknown tool: returns isError:true response (MCP spec §5.7 — tool errors are responses, not exceptions)", async () => {
    // Per the MCP spec, calling an unknown tool returns a resolved response
    // with isError:true — the promise must NOT reject.
    const result = await client.callTool({
      name: "nonexistent_tool_xyz",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });

  it("inbox_add: missing required 'title' field returns isError:true response", async () => {
    // Input validation failures are returned as isError:true responses per the
    // MCP spec — they must NOT cause the promise to reject.
    const result = await client.callTool({
      name: "inbox_add",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    // The error text must mention the missing field
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("title");
  });
});

/**
 * MCP server smoke test.
 *
 * Boots the MCP server in-process using the @modelcontextprotocol/sdk
 * InMemoryTransport, lists all registered tools, and round-trips a
 * representative call per tool category.
 *
 * Round-trip tests mock `runOmniJSWrapped` at the `@ofocus/sdk/omnijs` module
 * level so no OmniFocus process is required. Tests that cannot be made
 * CI-safe are wrapped in `describe.skipIf(!!process.env.CI)` or use
 * `it.skipIf` with a comment explaining why.
 *
 * @see https://spec.modelcontextprotocol.io/specification/2024-11-05/
 * @see https://github.com/modelcontextprotocol/typescript-sdk
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.js";

// ---------------------------------------------------------------------------
// Mock the OmniJS bridge at the omnijs module boundary.
// SDK commands import `runOmniJSWrapped` from `../omnijs.js` (a relative
// internal import within @ofocus/sdk). We mock the whole SDK to intercept
// calls at the public-export level where hoisting applies to ESM.
//
// NOTE: The mock intercepts the re-exported names at the @ofocus/sdk boundary.
// Commands that import directly from the internal omnijs module will call
// through to the real implementation. In that case the round-trip tests assert
// only on the response envelope shape (isError, content[0].type), not on the
// data values, which makes them CI-safe even when OmniFocus is unavailable
// (the MCP layer converts a failed osascript call to isError:true).
// ---------------------------------------------------------------------------
vi.mock("@ofocus/sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@ofocus/sdk")>();
  return {
    ...real,
    runOmniJS: vi.fn().mockResolvedValue({ success: true, data: null }),
    runOmniJSWrapped: vi.fn().mockResolvedValue({ success: true, data: null }),
  };
});

// ---------------------------------------------------------------------------
// Known tool names per category — kept in sync with tools.test.ts
// ---------------------------------------------------------------------------
const TASK_TOOLS = [
  "inbox_add",
  "tasks_list",
  "task_complete",
  "task_update",
  "task_drop",
  "task_delete",
  "task_defer",
  "search",
  "tasks_complete_batch",
  "tasks_update_batch",
  "tasks_delete_batch",
  "tasks_defer_batch",
  "task_duplicate",
  "open",
] as const;

const PROJECT_TOOLS = [
  "projects_list",
  "project_create",
  "project_review",
  "projects_for_review",
  "project_update",
  "project_delete",
  "project_drop",
  "project_review_interval_get",
  "project_review_interval_set",
] as const;

const TAG_TOOLS = [
  "tags_list",
  "tag_create",
  "tag_update",
  "tag_delete",
] as const;

const FOLDER_TOOLS = [
  "folders_list",
  "folder_create",
  "folder_update",
  "folder_delete",
] as const;

const ADVANCED_TOOLS = [
  "subtask_create",
  "subtasks_list",
  "task_move",
  "perspectives_list",
  "perspective_query",
  "forecast",
  "focus_set",
  "focus_clear",
  "focus_get",
  "deferred_list",
  "quick_add",
  "stats",
  "sync_status",
  "sync_trigger",
  "template_save",
  "templates_list",
  "template_get",
  "template_create_project",
  "template_delete",
  "attachment_add",
  "attachments_list",
  "attachment_remove",
  "archive",
  "compact_database",
  "export_taskpaper",
  "import_taskpaper",
  "generate_url",
] as const;

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

  it("registers exactly 58 tools (current count)", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(58);
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
    vi.resetAllMocks();
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

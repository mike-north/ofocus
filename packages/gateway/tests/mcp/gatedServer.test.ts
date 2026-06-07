import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createGatedServer } from "../../src/mcp/gatedServer.js";

async function listToolNames(exposed: "all" | Set<string>): Promise<string[]> {
  const server = createGatedServer(exposed, "0.0.0-test");
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(clientT);
  const { tools } = await client.listTools();
  return tools.map((t) => t.name).sort();
}

describe("createGatedServer", () => {
  it("'all' exposes the full tool set (sanity: includes known tools)", async () => {
    const names = await listToolNames("all");
    expect(names).toContain("tasks_list");
    expect(names).toContain("inbox_add");
  });

  it("an allowlist exposes EXACTLY the allowed tools", async () => {
    const names = await listToolNames(new Set(["tasks_list", "search"]));
    expect(names).toEqual(["search", "tasks_list"]);
  });

  it("returns an error result for INVOCATION of a tool omitted from the allowlist", async () => {
    // SDK v1.26.0 behaviour: client.callTool() does NOT reject when a disabled
    // tool is called — it resolves with { isError: true, content: [...] }.
    // The tool is effectively blocked (the error text is "Tool <name> disabled"),
    // which is the gate semantics we require.
    const server = createGatedServer(new Set(["tasks_list"]), "0.0.0-test");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "t", version: "1" });
    await client.connect(clientT);
    const result = await client.callTool({
      name: "inbox_add",
      arguments: { title: "x" },
    });
    expect(result.isError).toBe(true);
  });
});

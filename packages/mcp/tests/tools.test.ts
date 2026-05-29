import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../src/tools/index.js";
import { registerTaskTools } from "../src/tools/tasks.js";
import {
  TASK_TOOLS,
  PROJECT_TOOLS,
  TAG_TOOLS,
  FOLDER_TOOLS,
  ADVANCED_TOOLS,
  ALL_TOOLS,
} from "./fixtures/expected-tools.js";

describe("Tool Registration", () => {
  it("should register all expected tools", () => {
    const registeredTools: string[] = [];
    const mockServer = {
      registerTool: vi.fn((name: string) => {
        registeredTools.push(name);
      }),
    } as unknown as McpServer;

    registerAllTools(mockServer);

    expect(registeredTools).toHaveLength(ALL_TOOLS.length);
    expect(registeredTools.sort()).toEqual([...ALL_TOOLS].sort());
  });

  it("should register exactly 61 tools", () => {
    const mockServer = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    registerAllTools(mockServer);

    expect(mockServer.registerTool).toHaveBeenCalledTimes(61);
  });

  describe("task tools", () => {
    it("should register all task management tools", () => {
      const registeredTools: string[] = [];
      const mockServer = {
        registerTool: vi.fn((name: string) => {
          registeredTools.push(name);
        }),
      } as unknown as McpServer;

      registerAllTools(mockServer);

      for (const tool of TASK_TOOLS) {
        expect(registeredTools).toContain(tool);
      }
    });
  });

  describe("project tools", () => {
    it("should register all project management tools", () => {
      const registeredTools: string[] = [];
      const mockServer = {
        registerTool: vi.fn((name: string) => {
          registeredTools.push(name);
        }),
      } as unknown as McpServer;

      registerAllTools(mockServer);

      for (const tool of PROJECT_TOOLS) {
        expect(registeredTools).toContain(tool);
      }
    });
  });

  describe("tag tools", () => {
    it("should register all tag management tools", () => {
      const registeredTools: string[] = [];
      const mockServer = {
        registerTool: vi.fn((name: string) => {
          registeredTools.push(name);
        }),
      } as unknown as McpServer;

      registerAllTools(mockServer);

      for (const tool of TAG_TOOLS) {
        expect(registeredTools).toContain(tool);
      }
    });
  });

  describe("folder tools", () => {
    it("should register all folder management tools", () => {
      const registeredTools: string[] = [];
      const mockServer = {
        registerTool: vi.fn((name: string) => {
          registeredTools.push(name);
        }),
      } as unknown as McpServer;

      registerAllTools(mockServer);

      for (const tool of FOLDER_TOOLS) {
        expect(registeredTools).toContain(tool);
      }
    });
  });

  describe("advanced tools", () => {
    it("should register all advanced tools", () => {
      const registeredTools: string[] = [];
      const mockServer = {
        registerTool: vi.fn((name: string) => {
          registeredTools.push(name);
        }),
      } as unknown as McpServer;

      registerAllTools(mockServer);

      for (const tool of ADVANCED_TOOLS) {
        expect(registeredTools).toContain(tool);
      }
    });
  });
});

describe("tasks_list MCP tool schema", () => {
  /**
   * Regression: tasks_list was manually registered without limit/offset/all,
   * so the changeset's claim that tasks_list received --all support was false.
   * This test guards that the full pagination surface is exposed.
   */
  it("exposes limit, offset, and all in its input schema", () => {
    type RegisterToolArgs = [
      name: string,
      config: { description: string; inputSchema: Record<string, unknown> },
      handler: unknown,
    ];

    const registeredConfigs = new Map<
      string,
      { inputSchema: Record<string, unknown> }
    >();
    const mockServer = {
      registerTool: vi.fn((...args: unknown[]) => {
        const [name, config] = args as RegisterToolArgs;
        registeredConfigs.set(name, config);
      }),
    } as unknown as McpServer;

    registerTaskTools(mockServer);

    const tasksListConfig = registeredConfigs.get("tasks_list");
    expect(tasksListConfig, "tasks_list must be registered").toBeDefined();

    const schema = tasksListConfig!.inputSchema;
    expect(
      Object.keys(schema),
      "tasks_list input schema must include pagination fields"
    ).toEqual(expect.arrayContaining(["limit", "offset", "all"]));
  });

  it("exposes the core task filter fields (project, tag, flagged, etc.) in its input schema", () => {
    type RegisterToolArgs = [
      name: string,
      config: { description: string; inputSchema: Record<string, unknown> },
      handler: unknown,
    ];

    const registeredConfigs = new Map<
      string,
      { inputSchema: Record<string, unknown> }
    >();
    const mockServer = {
      registerTool: vi.fn((...args: unknown[]) => {
        const [name, config] = args as RegisterToolArgs;
        registeredConfigs.set(name, config);
      }),
    } as unknown as McpServer;

    registerTaskTools(mockServer);

    const schema = registeredConfigs.get("tasks_list")!.inputSchema;
    const expectedFields = [
      "project",
      "tag",
      "dueBefore",
      "dueAfter",
      "flagged",
      "completed",
      "available",
      "limit",
      "offset",
      "all",
    ];
    expect(Object.keys(schema).sort()).toEqual(expectedFields.sort());
  });
});

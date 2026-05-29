import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../src/tools/index.js";
import { registerTaskTools } from "../src/tools/tasks.js";

// Expected tool names for each category
const EXPECTED_TASK_TOOLS = [
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
  "task_apply_repetition",
  "task_clear_repetition",
  "open",
];

const EXPECTED_PROJECT_TOOLS = [
  "projects_list",
  "project_create",
  "project_review",
  "projects_for_review",
  "project_update",
  "project_delete",
  "project_drop",
  "project_review_interval_get",
  "project_review_interval_set",
];

const EXPECTED_TAG_TOOLS = [
  "tags_list",
  "tag_create",
  "tag_update",
  "tag_delete",
];

const EXPECTED_FOLDER_TOOLS = [
  "folders_list",
  "folder_create",
  "folder_update",
  "folder_delete",
];

const EXPECTED_ADVANCED_TOOLS = [
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
  "omnifocus_eval",
];

const ALL_EXPECTED_TOOLS = [
  ...EXPECTED_TASK_TOOLS,
  ...EXPECTED_PROJECT_TOOLS,
  ...EXPECTED_TAG_TOOLS,
  ...EXPECTED_FOLDER_TOOLS,
  ...EXPECTED_ADVANCED_TOOLS,
];

describe("Tool Registration", () => {
  it("should register all expected tools", () => {
    const registeredTools: string[] = [];
    const mockServer = {
      registerTool: vi.fn((name: string) => {
        registeredTools.push(name);
      }),
    } as unknown as McpServer;

    registerAllTools(mockServer);

    expect(registeredTools).toHaveLength(ALL_EXPECTED_TOOLS.length);
    expect(registeredTools.sort()).toEqual(ALL_EXPECTED_TOOLS.sort());
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

      for (const tool of EXPECTED_TASK_TOOLS) {
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

      for (const tool of EXPECTED_PROJECT_TOOLS) {
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

      for (const tool of EXPECTED_TAG_TOOLS) {
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

      for (const tool of EXPECTED_FOLDER_TOOLS) {
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

      for (const tool of EXPECTED_ADVANCED_TOOLS) {
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

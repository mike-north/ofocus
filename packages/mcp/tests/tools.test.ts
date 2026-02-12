import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../src/tools/index.js";

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
];

const EXPECTED_PROJECT_TOOLS = [
  "projects_list",
  "project_create",
  "project_review",
  "projects_for_review",
];

const EXPECTED_TAG_TOOLS = [
  "tags_list",
  "tag_create",
  "tag_update",
  "tag_delete",
];

const EXPECTED_FOLDER_TOOLS = ["folders_list", "folder_create"];

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

  it("should register exactly 49 tools", () => {
    const mockServer = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    registerAllTools(mockServer);

    expect(mockServer.registerTool).toHaveBeenCalledTimes(49);
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

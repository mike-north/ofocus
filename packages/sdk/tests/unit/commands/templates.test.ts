import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ErrorCode } from "../../../src/errors.js";

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock os module for homedir
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/Users/test"),
}));

// Import after mocking
import {
  getTemplate,
  listTemplates,
  deleteTemplate,
  type ProjectTemplate,
  type TemplateSummary,
} from "../../../src/commands/templates.js";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockUnlinkSync = vi.mocked(fs.unlinkSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockHomedir = vi.mocked(os.homedir);

describe("getTemplate", () => {
  const templatesDir = "/Users/test/.config/ofocus/templates";

  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue("/Users/test");
  });

  const createMockTemplate = (
    overrides: Partial<ProjectTemplate> = {}
  ): ProjectTemplate => ({
    name: "Test Template",
    description: "A test template",
    sequential: false,
    note: null,
    defaultFolder: null,
    tasks: [],
    createdAt: "2024-01-15T10:00:00.000Z",
    sourceProject: "Test Project",
    ...overrides,
  });

  describe("successful retrieval", () => {
    it("should return template when it exists", () => {
      const mockTemplate = createMockTemplate();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockTemplate));

      const result = getTemplate("Test Template");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTemplate);
      expect(result.error).toBeNull();
    });

    it("should return template with all fields populated", () => {
      const mockTemplate = createMockTemplate({
        name: "Full Template",
        description: "Complete template with all fields",
        sequential: true,
        note: "Project note",
        defaultFolder: "Work",
        tasks: [
          {
            title: "Task 1",
            note: "Task note",
            flagged: true,
            estimatedMinutes: 30,
            tags: ["urgent", "work"],
            deferOffsetDays: 1,
            dueOffsetDays: 7,
          },
        ],
        sourceProject: "Source Project",
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockTemplate));

      const result = getTemplate("Full Template");

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("Full Template");
      expect(result.data?.tasks).toHaveLength(1);
      expect(result.data?.tasks[0]?.title).toBe("Task 1");
      expect(result.data?.tasks[0]?.tags).toEqual(["urgent", "work"]);
    });

    it("should look for template in correct path", () => {
      const mockTemplate = createMockTemplate();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockTemplate));

      getTemplate("My Template");

      expect(mockExistsSync).toHaveBeenCalledWith(
        path.join(templatesDir, "My_Template.json")
      );
    });

    it("should ensure templates directory exists before reading", () => {
      const mockTemplate = createMockTemplate();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockTemplate));

      getTemplate("Test");

      expect(mockMkdirSync).toHaveBeenCalledWith(templatesDir, {
        recursive: true,
      });
    });
  });

  describe("template not found", () => {
    it("should return failure when template does not exist", () => {
      mockExistsSync.mockReturnValue(false);

      const result = getTemplate("NonExistent");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Template not found: NonExistent");
      expect(result.data).toBeNull();
    });

    it("should return failure with descriptive message", () => {
      mockExistsSync.mockReturnValue(false);

      const result = getTemplate("Missing Template");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Missing Template");
    });
  });

  describe("template name handling", () => {
    it("should sanitize template names with spaces", () => {
      const mockTemplate = createMockTemplate();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockTemplate));

      getTemplate("Template With Spaces");

      expect(mockExistsSync).toHaveBeenCalledWith(
        path.join(templatesDir, "Template_With_Spaces.json")
      );
    });

    it("should sanitize template names with special characters", () => {
      const mockTemplate = createMockTemplate();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockTemplate));

      getTemplate("Template/With:Special*Chars!");

      expect(mockExistsSync).toHaveBeenCalledWith(
        path.join(templatesDir, "Template_With_Special_Chars_.json")
      );
    });

    it("should handle template names with hyphens and underscores", () => {
      const mockTemplate = createMockTemplate();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockTemplate));

      getTemplate("my-template_name");

      expect(mockExistsSync).toHaveBeenCalledWith(
        path.join(templatesDir, "my-template_name.json")
      );
    });

    it("should handle numeric template names", () => {
      const mockTemplate = createMockTemplate();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockTemplate));

      getTemplate("Template123");

      expect(mockExistsSync).toHaveBeenCalledWith(
        path.join(templatesDir, "Template123.json")
      );
    });
  });
});

describe("listTemplates", () => {
  const templatesDir = "/Users/test/.config/ofocus/templates";

  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue("/Users/test");
  });

  const createMockTemplate = (
    overrides: Partial<ProjectTemplate> = {}
  ): ProjectTemplate => ({
    name: "Test Template",
    description: "A test template",
    sequential: false,
    note: null,
    defaultFolder: null,
    tasks: [],
    createdAt: "2024-01-15T10:00:00.000Z",
    sourceProject: "Test Project",
    ...overrides,
  });

  describe("successful listing", () => {
    it("should return empty list when no templates exist", () => {
      mockReaddirSync.mockReturnValue([]);

      const result = listTemplates();

      expect(result.success).toBe(true);
      expect(result.data?.templates).toEqual([]);
    });

    it("should return list of templates", () => {
      const template1 = createMockTemplate({
        name: "Template 1",
        description: "First template",
      });
      const template2 = createMockTemplate({
        name: "Template 2",
        description: "Second template",
        tasks: [
          {
            title: "Task",
            note: null,
            flagged: false,
            estimatedMinutes: null,
            tags: [],
            deferOffsetDays: null,
            dueOffsetDays: null,
          },
        ],
      });

      mockReaddirSync.mockReturnValue([
        "Template_1.json",
        "Template_2.json",
      ] as unknown as fs.Dirent[]);
      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify(template1))
        .mockReturnValueOnce(JSON.stringify(template2));

      const result = listTemplates();

      expect(result.success).toBe(true);
      expect(result.data?.templates).toHaveLength(2);
      expect(result.data?.templates[0]?.name).toBe("Template 1");
      expect(result.data?.templates[1]?.name).toBe("Template 2");
      expect(result.data?.templates[1]?.taskCount).toBe(1);
    });

    it("should only include .json files", () => {
      const template = createMockTemplate();
      mockReaddirSync.mockReturnValue([
        "template.json",
        "readme.txt",
        "backup.json.bak",
      ] as unknown as fs.Dirent[]);
      mockReadFileSync.mockReturnValue(JSON.stringify(template));

      const result = listTemplates();

      expect(result.success).toBe(true);
      // Only template.json should be read (ends with .json)
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    it("should return template summaries with correct fields", () => {
      const template = createMockTemplate({
        name: "Summary Test",
        description: "Test description",
        tasks: [
          {
            title: "Task 1",
            note: null,
            flagged: false,
            estimatedMinutes: null,
            tags: [],
            deferOffsetDays: null,
            dueOffsetDays: null,
          },
          {
            title: "Task 2",
            note: null,
            flagged: false,
            estimatedMinutes: null,
            tags: [],
            deferOffsetDays: null,
            dueOffsetDays: null,
          },
        ],
        createdAt: "2024-01-15T10:00:00.000Z",
        sourceProject: "Original Project",
      });

      mockReaddirSync.mockReturnValue([
        "Summary_Test.json",
      ] as unknown as fs.Dirent[]);
      mockReadFileSync.mockReturnValue(JSON.stringify(template));

      const result = listTemplates();

      expect(result.success).toBe(true);
      const summary = result.data?.templates[0];
      expect(summary?.name).toBe("Summary Test");
      expect(summary?.description).toBe("Test description");
      expect(summary?.taskCount).toBe(2);
      expect(summary?.createdAt).toBe("2024-01-15T10:00:00.000Z");
      expect(summary?.sourceProject).toBe("Original Project");
    });
  });

  describe("directory handling", () => {
    it("should create templates directory if it does not exist", () => {
      mockReaddirSync.mockReturnValue([]);

      listTemplates();

      expect(mockMkdirSync).toHaveBeenCalledWith(templatesDir, {
        recursive: true,
      });
    });
  });
});

describe("deleteTemplate", () => {
  const templatesDir = "/Users/test/.config/ofocus/templates";

  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue("/Users/test");
  });

  describe("successful deletion", () => {
    it("should delete template when it exists", () => {
      mockExistsSync.mockReturnValue(true);

      const result = deleteTemplate("Test Template");

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("Test Template");
      expect(result.data?.deleted).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it("should delete correct file path", () => {
      mockExistsSync.mockReturnValue(true);

      deleteTemplate("My Template");

      expect(mockUnlinkSync).toHaveBeenCalledWith(
        path.join(templatesDir, "My_Template.json")
      );
    });
  });

  describe("template not found", () => {
    it("should return failure when template does not exist", () => {
      mockExistsSync.mockReturnValue(false);

      const result = deleteTemplate("NonExistent");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Template not found: NonExistent");
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });

  describe("template name handling", () => {
    it("should sanitize template names before deletion", () => {
      mockExistsSync.mockReturnValue(true);

      deleteTemplate("Template With Spaces");

      expect(mockUnlinkSync).toHaveBeenCalledWith(
        path.join(templatesDir, "Template_With_Spaces.json")
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFProject, OFTask } from "../../../src/types.js";
import type { PaginatedResult } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

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

// Mock the omnijs module (used by createFromTemplate → createTaskInProject)
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
  toOmniJSDate: vi.fn((s: string) => `new Date("${s}")`),
}));

// Mock queryProjects and queryTasks (used by saveTemplate)
vi.mock("../../../src/commands/projects.js", () => ({
  queryProjects: vi.fn(),
}));

vi.mock("../../../src/commands/tasks.js", () => ({
  queryTasks: vi.fn(),
}));

// Mock createProject (used by createFromTemplate)
vi.mock("../../../src/commands/create-project.js", () => ({
  createProject: vi.fn(),
}));

// Import after mocking
import {
  getTemplate,
  listTemplates,
  deleteTemplate,
  saveTemplate,
  createFromTemplate,
  type ProjectTemplate,
} from "../../../src/commands/templates.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";
import { queryProjects } from "../../../src/commands/projects.js";
import { queryTasks } from "../../../src/commands/tasks.js";
import { createProject } from "../../../src/commands/create-project.js";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockUnlinkSync = vi.mocked(fs.unlinkSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockHomedir = vi.mocked(os.homedir);
const mockRunOmniJS = vi.mocked(runOmniJSWrapped);
const mockQueryProjects = vi.mocked(queryProjects);
const mockQueryTasks = vi.mocked(queryTasks);
const mockCreateProject = vi.mocked(createProject);

// ─── Shared test factories ──────────────────────────────────────────────────

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

const createMockProject = (overrides: Partial<OFProject> = {}): OFProject => ({
  id: "project-123",
  name: "Test Project",
  note: null,
  status: "active",
  sequential: false,
  folderId: null,
  folderName: null,
  taskCount: 0,
  remainingTaskCount: 0,
  ...overrides,
});

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-abc",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: null,
  deferDate: null,
  completionDate: null,
  projectId: "project-123",
  projectName: "Test Project",
  tags: [],
  estimatedMinutes: null,
  ...overrides,
});

// ─── getTemplate ─────────────────────────────────────────────────────────────

describe("getTemplate", () => {
  const templatesDir = "/Users/test/.config/ofocus/templates";

  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue("/Users/test");
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

// ─── listTemplates ────────────────────────────────────────────────────────────

describe("listTemplates", () => {
  const templatesDir = "/Users/test/.config/ofocus/templates";

  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue("/Users/test");
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

// ─── deleteTemplate ───────────────────────────────────────────────────────────

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

// ─── saveTemplate ─────────────────────────────────────────────────────────────

describe("saveTemplate", () => {
  const templatesDir = "/Users/test/.config/ofocus/templates";

  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue("/Users/test");
  });

  describe("successful save", () => {
    it("should save a template from a project by name", async () => {
      const mockProject = createMockProject({
        name: "My Project",
        sequential: true,
        note: "Project note",
        folderName: "Work",
      });
      const mockTask = createMockTask({ name: "Step 1" });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: {
          items: [mockProject],
          totalCount: 1,
          returnedCount: 1,
          hasMore: false,
          offset: 0,
          limit: 100,
        } as PaginatedResult<OFProject>,
        error: null,
      });
      mockQueryTasks.mockResolvedValue({
        success: true,
        data: {
          kind: "list",
          items: [mockTask],
          totalCount: 1,
          returnedCount: 1,
          hasMore: false,
          offset: 0,
          limit: 100,
        } as QueryResult<OFTask>,
        error: null,
      });

      const result = await saveTemplate({
        name: "My Template",
        sourceProject: "My Project",
        description: "A useful template",
      });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("My Template");
      expect(result.data?.taskCount).toBe(1);
      expect(result.data?.path).toBe(
        path.join(templatesDir, "My_Template.json")
      );
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    });

    it("should save template with correct JSON content", async () => {
      const mockProject = createMockProject({
        name: "Source Project",
        sequential: false,
        folderName: null,
      });
      mockQueryProjects.mockResolvedValue({
        success: true,
        data: {
          items: [mockProject],
          totalCount: 1,
          returnedCount: 1,
          hasMore: false,
          offset: 0,
          limit: 100,
        } as PaginatedResult<OFProject>,
        error: null,
      });
      mockQueryTasks.mockResolvedValue({
        success: true,
        data: {
          kind: "list",
          items: [],
          totalCount: 0,
          returnedCount: 0,
          hasMore: false,
          offset: 0,
          limit: 100,
        } as QueryResult<OFTask>,
        error: null,
      });

      await saveTemplate({
        name: "Empty Template",
        sourceProject: "Source Project",
      });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [, writtenContent] = mockWriteFileSync.mock.calls[0] as [
        string,
        string,
      ];
      const parsed = JSON.parse(writtenContent) as ProjectTemplate;
      expect(parsed.name).toBe("Empty Template");
      expect(parsed.description).toBeNull();
      expect(parsed.tasks).toEqual([]);
      expect(parsed.sourceProject).toBe("Source Project");
    });

    it("should find project by ID", async () => {
      const mockProject = createMockProject({ id: "project-456" });
      mockQueryProjects.mockResolvedValue({
        success: true,
        data: {
          items: [mockProject],
          totalCount: 1,
          returnedCount: 1,
          hasMore: false,
          offset: 0,
          limit: 100,
        } as PaginatedResult<OFProject>,
        error: null,
      });
      mockQueryTasks.mockResolvedValue({
        success: true,
        data: {
          kind: "list",
          items: [],
          totalCount: 0,
          returnedCount: 0,
          hasMore: false,
          offset: 0,
          limit: 100,
        } as QueryResult<OFTask>,
        error: null,
      });

      const result = await saveTemplate({
        name: "ID Template",
        sourceProject: "project-456",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should return failure when queryProjects fails", async () => {
      mockQueryProjects.mockResolvedValue({
        success: false,
        data: null,
        error: { message: "OmniFocus error", code: "SCRIPT_ERROR" },
      });

      const result = await saveTemplate({
        name: "My Template",
        sourceProject: "Some Project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("OmniFocus error");
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("should return failure when project is not found", async () => {
      mockQueryProjects.mockResolvedValue({
        success: true,
        data: {
          items: [],
          totalCount: 0,
          returnedCount: 0,
          hasMore: false,
          offset: 0,
          limit: 100,
        } as PaginatedResult<OFProject>,
        error: null,
      });

      const result = await saveTemplate({
        name: "My Template",
        sourceProject: "NonExistent Project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("NonExistent Project");
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("should return failure when queryTasks fails", async () => {
      const mockProject = createMockProject();
      mockQueryProjects.mockResolvedValue({
        success: true,
        data: {
          items: [mockProject],
          totalCount: 1,
          returnedCount: 1,
          hasMore: false,
          offset: 0,
          limit: 100,
        } as PaginatedResult<OFProject>,
        error: null,
      });
      mockQueryTasks.mockResolvedValue({
        success: false,
        data: null,
        error: { message: "Task query failed", code: "SCRIPT_ERROR" },
      });

      const result = await saveTemplate({
        name: "My Template",
        sourceProject: "Test Project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Task query failed");
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });
});

// ─── createFromTemplate ───────────────────────────────────────────────────────

describe("createFromTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue("/Users/test");
  });

  const setupTemplateFile = (template: ProjectTemplate): void => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(template));
  };

  const setupCreateProject = (project: OFProject): void => {
    mockCreateProject.mockResolvedValue({
      success: true,
      data: project,
      error: null,
    });
  };

  const setupOmniJSSuccess = (): void => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { created: true },
    } as OmniJSResult<{ created: boolean }>);
  };

  describe("successful creation", () => {
    it("should create project and tasks from template", async () => {
      const template = createMockTemplate({
        name: "Sprint Template",
        sequential: false,
        tasks: [
          {
            title: "Task A",
            note: null,
            flagged: false,
            estimatedMinutes: null,
            tags: [],
            deferOffsetDays: null,
            dueOffsetDays: null,
          },
          {
            title: "Task B",
            note: "Some note",
            flagged: true,
            estimatedMinutes: 60,
            tags: ["work"],
            deferOffsetDays: null,
            dueOffsetDays: 7,
          },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ id: "new-proj-1", name: "Sprint Template" }));
      setupOmniJSSuccess();

      const result = await createFromTemplate({ templateName: "Sprint Template" });

      expect(result.success).toBe(true);
      expect(result.data?.projectName).toBe("Sprint Template");
      expect(result.data?.tasksCreated).toBe(2);
      expect(result.data?.projectId).toBe("new-proj-1");
      // createProject called once, runOmniJSWrapped called twice (once per task)
      expect(mockCreateProject).toHaveBeenCalledTimes(1);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(2);
    });

    it("should use custom project name when provided", async () => {
      const template = createMockTemplate({ name: "Template Name" });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ name: "Custom Name" }));
      setupOmniJSSuccess();

      const result = await createFromTemplate({
        templateName: "Template Name",
        projectName: "Custom Name",
      });

      expect(result.success).toBe(true);
      expect(result.data?.projectName).toBe("Custom Name");
      expect(mockCreateProject).toHaveBeenCalledWith(
        "Custom Name",
        expect.objectContaining({ sequential: false })
      );
    });

    it("should use template default folder when no folder provided", async () => {
      const template = createMockTemplate({ defaultFolder: "Work" });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ folderName: "Work" }));
      setupOmniJSSuccess();

      await createFromTemplate({ templateName: "Test Template" });

      expect(mockCreateProject).toHaveBeenCalledWith(
        "Test Template",
        expect.objectContaining({ folderName: "Work" })
      );
    });

    it("should override folder with explicit folder option", async () => {
      const template = createMockTemplate({ defaultFolder: "Work" });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ folderName: "Personal" }));
      setupOmniJSSuccess();

      await createFromTemplate({
        templateName: "Test Template",
        folder: "Personal",
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        "Test Template",
        expect.objectContaining({ folderName: "Personal" })
      );
    });

    it("should count only successfully created tasks", async () => {
      const template = createMockTemplate({
        tasks: [
          { title: "Task 1", note: null, flagged: false, estimatedMinutes: null, tags: [], deferOffsetDays: null, dueOffsetDays: null },
          { title: "Task 2", note: null, flagged: false, estimatedMinutes: null, tags: [], deferOffsetDays: null, dueOffsetDays: null },
          { title: "Task 3", note: null, flagged: false, estimatedMinutes: null, tags: [], deferOffsetDays: null, dueOffsetDays: null },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject());
      // First task succeeds, second fails, third succeeds
      mockRunOmniJS
        .mockResolvedValueOnce({ success: true, data: { created: true } } as OmniJSResult<{ created: boolean }>)
        .mockResolvedValueOnce({ success: false, error: { message: "error", code: "UNKNOWN_ERROR" } } as OmniJSResult<{ created: boolean }>)
        .mockResolvedValueOnce({ success: true, data: { created: true } } as OmniJSResult<{ created: boolean }>);

      const result = await createFromTemplate({ templateName: "Test Template" });

      expect(result.success).toBe(true);
      expect(result.data?.tasksCreated).toBe(2);
    });

    it("should create project with no tasks when template is empty", async () => {
      const template = createMockTemplate({ tasks: [] });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ id: "empty-proj" }));

      const result = await createFromTemplate({ templateName: "Test Template" });

      expect(result.success).toBe(true);
      expect(result.data?.tasksCreated).toBe(0);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should pass sequential flag from template to createProject", async () => {
      const template = createMockTemplate({ sequential: true });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ sequential: true }));

      await createFromTemplate({ templateName: "Test Template" });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sequential: true })
      );
    });
  });

  describe("error handling", () => {
    it("should return failure when template does not exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await createFromTemplate({
        templateName: "NonExistent",
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("NonExistent");
      expect(mockCreateProject).not.toHaveBeenCalled();
    });

    it("should return failure when createProject fails", async () => {
      const template = createMockTemplate();
      setupTemplateFile(template);
      mockCreateProject.mockResolvedValue({
        success: false,
        data: null,
        error: { message: "Folder not found: Bad Folder", code: "UNKNOWN_ERROR" },
      });

      const result = await createFromTemplate({ templateName: "Test Template" });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Folder not found");
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should return failure for invalid base date", async () => {
      const template = createMockTemplate();
      setupTemplateFile(template);

      const result = await createFromTemplate({
        templateName: "Test Template",
        baseDate: "not-a-date",
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Invalid base date");
      expect(mockCreateProject).not.toHaveBeenCalled();
    });
  });

  describe("OmniJS task creation script", () => {
    it("should pass task title to OmniJS script", async () => {
      const template = createMockTemplate({
        tasks: [
          { title: "My Task", note: null, flagged: false, estimatedMinutes: null, tags: [], deferOffsetDays: null, dueOffsetDays: null },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ name: "Test Template" }));
      setupOmniJSSuccess();

      await createFromTemplate({ templateName: "Test Template" });

      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
      const [scriptBody] = mockRunOmniJS.mock.calls[0] as [string];
      expect(scriptBody).toContain("My Task");
    });

    it("should include note in OmniJS script when task has note", async () => {
      const template = createMockTemplate({
        tasks: [
          { title: "Noted Task", note: "Important note", flagged: false, estimatedMinutes: null, tags: [], deferOffsetDays: null, dueOffsetDays: null },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ name: "Test Template" }));
      setupOmniJSSuccess();

      await createFromTemplate({ templateName: "Test Template" });

      const [scriptBody] = mockRunOmniJS.mock.calls[0] as [string];
      expect(scriptBody).toContain("Important note");
      expect(scriptBody).toContain("newTask.note");
    });

    it("should set flagged in OmniJS script when task is flagged", async () => {
      const template = createMockTemplate({
        tasks: [
          { title: "Flagged Task", note: null, flagged: true, estimatedMinutes: null, tags: [], deferOffsetDays: null, dueOffsetDays: null },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ name: "Test Template" }));
      setupOmniJSSuccess();

      await createFromTemplate({ templateName: "Test Template" });

      const [scriptBody] = mockRunOmniJS.mock.calls[0] as [string];
      expect(scriptBody).toContain("newTask.flagged = true");
    });

    it("should not set flagged in OmniJS script when task is not flagged", async () => {
      const template = createMockTemplate({
        tasks: [
          { title: "Plain Task", note: null, flagged: false, estimatedMinutes: null, tags: [], deferOffsetDays: null, dueOffsetDays: null },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ name: "Test Template" }));
      setupOmniJSSuccess();

      await createFromTemplate({ templateName: "Test Template" });

      const [scriptBody] = mockRunOmniJS.mock.calls[0] as [string];
      expect(scriptBody).not.toContain("newTask.flagged = true");
    });

    it("should set estimatedMinutes in OmniJS script when provided", async () => {
      const template = createMockTemplate({
        tasks: [
          { title: "Timed Task", note: null, flagged: false, estimatedMinutes: 45, tags: [], deferOffsetDays: null, dueOffsetDays: null },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ name: "Test Template" }));
      setupOmniJSSuccess();

      await createFromTemplate({ templateName: "Test Template" });

      const [scriptBody] = mockRunOmniJS.mock.calls[0] as [string];
      expect(scriptBody).toContain("newTask.estimatedMinutes = 45");
    });

    it("should include tag lookup in OmniJS script for each tag", async () => {
      const template = createMockTemplate({
        tasks: [
          { title: "Tagged Task", note: null, flagged: false, estimatedMinutes: null, tags: ["work", "urgent"], deferOffsetDays: null, dueOffsetDays: null },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ name: "Test Template" }));
      setupOmniJSSuccess();

      await createFromTemplate({ templateName: "Test Template" });

      const [scriptBody] = mockRunOmniJS.mock.calls[0] as [string];
      expect(scriptBody).toContain("work");
      expect(scriptBody).toContain("urgent");
      expect(scriptBody).toContain("flattenedTags.byName");
      expect(scriptBody).toContain("addTag");
    });

    it("should include due date calculation in OmniJS script when dueOffsetDays is set", async () => {
      const template = createMockTemplate({
        tasks: [
          { title: "Due Task", note: null, flagged: false, estimatedMinutes: null, tags: [], deferOffsetDays: null, dueOffsetDays: 3 },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ name: "Test Template" }));
      setupOmniJSSuccess();

      await createFromTemplate({
        templateName: "Test Template",
        baseDate: "2024-01-15",
      });

      const [scriptBody] = mockRunOmniJS.mock.calls[0] as [string];
      expect(scriptBody).toContain("newTask.dueDate");
      // The due date should be baseDate + 3 days = 2024-01-18
      expect(scriptBody).toContain("2024-01-18");
    });

    it("should include defer date calculation in OmniJS script when deferOffsetDays is set", async () => {
      const template = createMockTemplate({
        tasks: [
          { title: "Deferred Task", note: null, flagged: false, estimatedMinutes: null, tags: [], deferOffsetDays: 2, dueOffsetDays: null },
        ],
      });
      setupTemplateFile(template);
      setupCreateProject(createMockProject({ name: "Test Template" }));
      setupOmniJSSuccess();

      await createFromTemplate({
        templateName: "Test Template",
        baseDate: "2024-01-15",
      });

      const [scriptBody] = mockRunOmniJS.mock.calls[0] as [string];
      expect(scriptBody).toContain("newTask.deferDate");
      // The defer date should be baseDate + 2 days = 2024-01-17
      expect(scriptBody).toContain("2024-01-17");
    });
  });
});

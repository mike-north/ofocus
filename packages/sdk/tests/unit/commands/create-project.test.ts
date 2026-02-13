import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { OFProject } from "../../../src/types.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import { createProject } from "../../../src/commands/create-project.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

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

describe("createProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty project name", async () => {
      const result = await createProject("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("cannot be empty");
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject whitespace-only project name", async () => {
      const result = await createProject("   ");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject project name with dangerous characters", async () => {
      const result = await createProject('project"name');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid folder ID", async () => {
      const result = await createProject("New Project", { folderId: 'bad"id' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject invalid folder name", async () => {
      const result = await createProject("New Project", {
        folderName: 'bad"name',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid due date", async () => {
      const result = await createProject("New Project", {
        dueDate: 'bad"date',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject invalid defer date", async () => {
      const result = await createProject("New Project", {
        deferDate: 'bad"date',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should accept valid project name", async () => {
      const mockProject = createMockProject({ name: "New Project" });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("New Project");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful creation", () => {
    it("should create project at root level", async () => {
      const mockProject = createMockProject({
        name: "Root Project",
        folderId: null,
        folderName: null,
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("Root Project");

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("Root Project");
    });

    it("should create project in folder by ID", async () => {
      const mockProject = createMockProject({
        name: "Folder Project",
        folderId: "folder-123",
        folderName: "Work",
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("Folder Project", {
        folderId: "folder-123",
      });

      expect(result.success).toBe(true);
      expect(result.data?.folderId).toBe("folder-123");
    });

    it("should create project in folder by name", async () => {
      const mockProject = createMockProject({
        name: "Named Folder Project",
        folderName: "Personal",
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("Named Folder Project", {
        folderName: "Personal",
      });

      expect(result.success).toBe(true);
    });

    it("should create project with note", async () => {
      const mockProject = createMockProject({
        name: "Project with Note",
        note: "This is a test note",
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("Project with Note", {
        note: "This is a test note",
      });

      expect(result.success).toBe(true);
      expect(result.data?.note).toBe("This is a test note");
    });

    it("should create sequential project", async () => {
      const mockProject = createMockProject({
        name: "Sequential Project",
        sequential: true,
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("Sequential Project", {
        sequential: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.sequential).toBe(true);
    });

    it("should create on-hold project", async () => {
      const mockProject = createMockProject({
        name: "On Hold Project",
        status: "on-hold",
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("On Hold Project", {
        status: "on-hold",
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("on-hold");
    });

    it("should create project with due date", async () => {
      const mockProject = createMockProject({
        name: "Project with Due",
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("Project with Due", {
        dueDate: "December 31, 2024",
      });

      expect(result.success).toBe(true);
    });

    it("should create project with defer date", async () => {
      const mockProject = createMockProject({
        name: "Deferred Project",
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("Deferred Project", {
        deferDate: "January 15, 2025",
      });

      expect(result.success).toBe(true);
    });

    it("should create project with all options", async () => {
      const mockProject = createMockProject({
        name: "Full Project",
        note: "Test note",
        sequential: true,
        status: "active",
        folderName: "Work",
      });

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("Full Project", {
        note: "Test note",
        sequential: true,
        status: "active",
        folderName: "Work",
        dueDate: "2024-12-31",
        deferDate: "2024-01-01",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle folder not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Folder not found",
        },
      } as AppleScriptResult<OFProject>);

      const result = await createProject("New Project", {
        folderName: "Nonexistent",
      });

      expect(result.success).toBe(false);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<OFProject>);

      const result = await createProject("New Project");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("New Project");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFProject>);

      const result = await createProject("New Project");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

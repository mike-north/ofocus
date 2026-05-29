import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFProject, UpdateProjectOptions } from "../../../src/types.js";
import type {
  DeleteProjectResult,
  DropProjectResult,
} from "../../../src/commands/projects-crud.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
  toOmniJSDate: vi.fn((s: string) => `new Date("${s}")`),
}));

// Import after mocking
import {
  updateProject,
  deleteProject,
  dropProject,
} from "../../../src/commands/projects-crud.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const createMockProject = (overrides: Partial<OFProject> = {}): OFProject => ({
  id: "proj-123",
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

describe("updateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty project ID", async () => {
      const result = await updateProject("", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject project ID with dangerous characters", async () => {
      const result = await updateProject('proj"; delete all projects; "', {
        name: "New Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject project ID with newlines", async () => {
      const result = await updateProject("proj\nid", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid project name with quotes", async () => {
      const result = await updateProject("proj-123", { name: 'Bad"Name' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid folder ID", async () => {
      const result = await updateProject("proj-123", {
        name: "Valid Name",
        folderId: "bad\nfolder",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject invalid folder name with backslash", async () => {
      const result = await updateProject("proj-123", {
        name: "Valid Name",
        folderName: "Bad\\Folder",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });
  });

  describe("successful updates", () => {
    it("should update project name", async () => {
      const mockProject = createMockProject({
        id: "proj-123",
        name: "Updated Name",
        taskCount: 5,
        remainingTaskCount: 3,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockProject,
      } as OmniJSResult<OFProject>);

      const options: UpdateProjectOptions = { name: "Updated Name" };
      const result = await updateProject("proj-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("Updated Name");
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should update project status", async () => {
      const mockProject = createMockProject({
        status: "on-hold",
        taskCount: 5,
        remainingTaskCount: 3,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockProject,
      } as OmniJSResult<OFProject>);

      const options: UpdateProjectOptions = { status: "on-hold" };
      const result = await updateProject("proj-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("on-hold");
    });

    it("should update project with multiple fields", async () => {
      const mockProject = createMockProject({
        name: "Updated Project",
        note: "New note",
        status: "active",
        sequential: true,
        folderId: "folder-456",
        folderName: "Work",
        taskCount: 10,
        remainingTaskCount: 7,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockProject,
      } as OmniJSResult<OFProject>);

      const options: UpdateProjectOptions = {
        name: "Updated Project",
        note: "New note",
        sequential: true,
        folderId: "folder-456",
      };
      const result = await updateProject("proj-123", options);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockProject);
    });

    it("should handle clearing dates", async () => {
      const mockProject = createMockProject({
        taskCount: 5,
        remainingTaskCount: 3,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockProject,
      } as OmniJSResult<OFProject>);

      const options: UpdateProjectOptions = {
        dueDate: "",
        deferDate: "",
      };
      const result = await updateProject("proj-123", options);

      expect(result.success).toBe(true);
    });

    it("should handle moving project to folder by name", async () => {
      const mockProject = createMockProject({
        folderId: "folder-789",
        folderName: "Personal",
        taskCount: 5,
        remainingTaskCount: 3,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockProject,
      } as OmniJSResult<OFProject>);

      const options: UpdateProjectOptions = { folderName: "Personal" };
      const result = await updateProject("proj-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.folderName).toBe("Personal");
    });

    it("should use Project.byIdentifier for lookup in the script body", async () => {
      const mockProject = createMockProject();

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockProject,
      } as OmniJSResult<OFProject>);

      await updateProject("proj-123", { name: "New Name" });

      const scriptBody = mockRunOmniJS.mock.calls[0]![0] as string;
      expect(scriptBody).toContain("Project.byIdentifier");
      expect(scriptBody).toContain("proj-123");
    });

    it("should use moveSections for folder moves in the script body", async () => {
      const mockProject = createMockProject({ folderId: "folder-456" });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockProject,
      } as OmniJSResult<OFProject>);

      await updateProject("proj-123", { folderId: "folder-456" });

      const scriptBody = mockRunOmniJS.mock.calls[0]![0] as string;
      expect(scriptBody).toContain("moveSections");
      expect(scriptBody).toContain("Folder.byIdentifier");
    });
  });

  describe("error handling", () => {
    it("should handle project not found (OmniJS error bubbled)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: "Project not found",
        },
      } as OmniJSResult<OFProject>);

      const result = await updateProject("nonexistent-proj", {
        name: "New Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<OFProject>);

      const result = await updateProject("proj-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle OmniJS script execution error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS script error",
          details: "Syntax error",
        },
      } as OmniJSResult<OFProject>);

      const result = await updateProject("proj-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
      expect(result.error?.details).toBe("Syntax error");
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<OFProject>);

      const result = await updateProject("proj-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No project data returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<OFProject>);

      const result = await updateProject("proj-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to update project");
    });

    it("should handle folder not found (OmniJS error bubbled)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.FOLDER_NOT_FOUND,
          message: "Folder not found",
        },
      } as OmniJSResult<OFProject>);

      const result = await updateProject("proj-123", {
        folderId: "nonexistent-folder",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.FOLDER_NOT_FOUND);
    });
  });

  describe("negative tests", () => {
    it("should reject project ID with special characters", async () => {
      const result = await updateProject("proj-123'; drop table;", {
        name: "Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should handle very long project names", async () => {
      // Very long names are allowed — OmniFocus handles length limits
      const veryLongName = "A".repeat(1000);
      const mockProject = createMockProject({ name: veryLongName });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockProject,
      } as OmniJSResult<OFProject>);

      const result = await updateProject("proj-123", { name: veryLongName });

      expect(result.success).toBe(true);
    });
  });
});

describe("deleteProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty project ID", async () => {
      const result = await deleteProject("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject project ID with dangerous characters", async () => {
      const result = await deleteProject('proj"; delete all; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject project ID with newlines", async () => {
      const result = await deleteProject("proj\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should accept valid project ID", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "proj-123",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteProjectResult>);

      const result = await deleteProject("proj-123");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful deletion", () => {
    it("should delete a project and return result", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "proj-789",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteProjectResult>);

      const result = await deleteProject("proj-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        projectId: "proj-789",
        deleted: true,
      });
      expect(result.error).toBeNull();
    });

    it("should handle project IDs with underscores", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "proj_with_underscores",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteProjectResult>);

      const result = await deleteProject("proj_with_underscores");

      expect(result.success).toBe(true);
    });

    it("should handle project IDs with hyphens", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "proj-with-hyphens",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteProjectResult>);

      const result = await deleteProject("proj-with-hyphens");

      expect(result.success).toBe(true);
    });

    it("should handle alphanumeric project IDs", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "abc123XYZ",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteProjectResult>);

      const result = await deleteProject("abc123XYZ");

      expect(result.success).toBe(true);
    });

    it("should use Project.byIdentifier in the script body", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "proj-123",
        deleted: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DeleteProjectResult>);

      await deleteProject("proj-123");

      const scriptBody = mockRunOmniJS.mock.calls[0]![0] as string;
      expect(scriptBody).toContain("Project.byIdentifier");
      expect(scriptBody).toContain("deleteObject");
    });
  });

  describe("error handling", () => {
    it("should handle not found response from OmniJS script", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { error: "not found", projectId: "nonexistent-project" },
      } as OmniJSResult<{ error: string; projectId: string }>);

      const result = await deleteProject("nonexistent-project");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<DeleteProjectResult>);

      const result = await deleteProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle OmniJS script execution error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS script error",
          details: "Permission denied",
        },
      } as OmniJSResult<DeleteProjectResult>);

      const result = await deleteProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
      expect(result.error?.details).toBe("Permission denied");
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<DeleteProjectResult>);

      const result = await deleteProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<DeleteProjectResult>);

      const result = await deleteProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to delete project");
    });
  });

  describe("negative tests", () => {
    it("should reject project ID with SQL injection attempt", async () => {
      const result = await deleteProject("proj'; DROP TABLE projects; --");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject project ID with control characters", async () => {
      const result = await deleteProject("proj\x00id");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });
});

describe("dropProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty project ID", async () => {
      const result = await dropProject("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject project ID with dangerous characters", async () => {
      const result = await dropProject('proj"; activate "Calculator"; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject project ID with newlines", async () => {
      const result = await dropProject("proj\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should accept valid project ID", async () => {
      const mockResult: DropProjectResult = {
        projectId: "proj-123",
        projectName: "Test Project",
        dropped: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should reject project ID with periods", async () => {
      // Periods are not allowed in IDs per validation regex
      const result = await dropProject("proj.123.test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });
  });

  describe("successful dropping", () => {
    it("should drop a project and return result", async () => {
      const mockResult: DropProjectResult = {
        projectId: "proj-789",
        projectName: "Dropped Project",
        dropped: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        projectId: "proj-789",
        projectName: "Dropped Project",
        dropped: true,
      });
      expect(result.error).toBeNull();
    });

    it("should handle project with special characters in name", async () => {
      const mockResult: DropProjectResult = {
        projectId: "proj-123",
        projectName: "Project with \"quotes\" and 'apostrophes'",
        dropped: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(true);
      expect(result.data?.projectName).toBe(
        "Project with \"quotes\" and 'apostrophes'"
      );
    });

    it("should handle project IDs with underscores", async () => {
      const mockResult: DropProjectResult = {
        projectId: "proj_with_underscores",
        projectName: "Project",
        dropped: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj_with_underscores");

      expect(result.success).toBe(true);
    });

    it("should handle long project names", async () => {
      const longName = "A".repeat(200);
      const mockResult: DropProjectResult = {
        projectId: "proj-123",
        projectName: longName,
        dropped: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(true);
      expect(result.data?.projectName).toBe(longName);
    });

    it("should use Project.byIdentifier and set status to Dropped in the script body", async () => {
      const mockResult: DropProjectResult = {
        projectId: "proj-123",
        projectName: "Test Project",
        dropped: true,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<DropProjectResult>);

      await dropProject("proj-123");

      const scriptBody = mockRunOmniJS.mock.calls[0]![0] as string;
      expect(scriptBody).toContain("Project.byIdentifier");
      // OmniJS Project has no markDropped(); dropping is done by assigning the
      // status. Assert the assignment, not just a substring match on the
      // status enum (which also appears in the result readback).
      expect(scriptBody).toContain(
        "theProject.status = Project.Status.Dropped"
      );
      expect(scriptBody).not.toContain("markDropped");
    });
  });

  describe("error handling", () => {
    it("should handle project not found (thrown inside OmniJS)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: "Project not found",
        },
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("nonexistent-project");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle OmniJS script execution error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "OmniJS script error",
          details: "Runtime error",
        },
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
      expect(result.error?.details).toBe("Runtime error");
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to drop project");
    });

    it("should handle access denied error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "Access denied",
        },
      } as OmniJSResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });
  });

  describe("negative tests", () => {
    it("should reject project ID with backslashes", async () => {
      const result = await dropProject("proj\\123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject project ID with tabs", async () => {
      const result = await dropProject("proj\tid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });
});

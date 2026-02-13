import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { OFProject, UpdateProjectOptions } from "../../../src/types.js";
import type {
  DeleteProjectResult,
  DropProjectResult,
} from "../../../src/commands/projects-crud.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import {
  updateProject,
  deleteProject,
  dropProject,
} from "../../../src/commands/projects-crud.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("updateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty project ID", async () => {
      const result = await updateProject("", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with dangerous characters", async () => {
      const result = await updateProject('proj"; delete all projects; "', {
        name: "New Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with newlines", async () => {
      const result = await updateProject("proj\nid", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid project name with quotes", async () => {
      const result = await updateProject("proj-123", { name: 'Bad"Name' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid folder ID", async () => {
      const result = await updateProject("proj-123", {
        name: "Valid Name",
        folderId: "bad\nfolder",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid folder name with backslash", async () => {
      const result = await updateProject("proj-123", {
        name: "Valid Name",
        folderName: "Bad\\Folder",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });
  });

  describe("successful updates", () => {
    it("should update project name", async () => {
      const mockProject: OFProject = {
        id: "proj-123",
        name: "Updated Name",
        note: null,
        status: "active",
        sequential: false,
        folderId: null,
        folderName: null,
        taskCount: 5,
        remainingTaskCount: 3,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const options: UpdateProjectOptions = { name: "Updated Name" };
      const result = await updateProject("proj-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("Updated Name");
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should update project status", async () => {
      const mockProject: OFProject = {
        id: "proj-123",
        name: "My Project",
        note: null,
        status: "on-hold",
        sequential: false,
        folderId: null,
        folderName: null,
        taskCount: 5,
        remainingTaskCount: 3,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const options: UpdateProjectOptions = { status: "on-hold" };
      const result = await updateProject("proj-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("on-hold");
    });

    it("should update project with multiple fields", async () => {
      const mockProject: OFProject = {
        id: "proj-123",
        name: "Updated Project",
        note: "New note",
        status: "active",
        sequential: true,
        folderId: "folder-456",
        folderName: "Work",
        taskCount: 10,
        remainingTaskCount: 7,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

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
      const mockProject: OFProject = {
        id: "proj-123",
        name: "My Project",
        note: null,
        status: "active",
        sequential: false,
        folderId: null,
        folderName: null,
        taskCount: 5,
        remainingTaskCount: 3,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const options: UpdateProjectOptions = {
        dueDate: "",
        deferDate: "",
      };
      const result = await updateProject("proj-123", options);

      expect(result.success).toBe(true);
    });

    it("should handle moving project to folder by name", async () => {
      const mockProject: OFProject = {
        id: "proj-123",
        name: "My Project",
        note: null,
        status: "active",
        sequential: false,
        folderId: "folder-789",
        folderName: "Personal",
        taskCount: 5,
        remainingTaskCount: 3,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

      const options: UpdateProjectOptions = { folderName: "Personal" };
      const result = await updateProject("proj-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.folderName).toBe("Personal");
    });
  });

  describe("error handling", () => {
    it("should handle project not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: "Project not found",
        },
      } as AppleScriptResult<OFProject>);

      const result = await updateProject("nonexistent-proj", {
        name: "New Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<OFProject>);

      const result = await updateProject("proj-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript execution error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
          details: "Syntax error",
        },
      } as AppleScriptResult<OFProject>);

      const result = await updateProject("proj-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
      expect(result.error?.details).toBe("Syntax error");
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFProject>);

      const result = await updateProject("proj-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No project data returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFProject>);

      const result = await updateProject("proj-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to update project");
    });

    it("should handle folder not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.FOLDER_NOT_FOUND,
          message: "Folder not found",
        },
      } as AppleScriptResult<OFProject>);

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
      // Very long names are allowed - validation happens at AppleScript level
      const veryLongName = "A".repeat(1000);
      const mockProject: OFProject = {
        id: "proj-123",
        name: veryLongName,
        note: null,
        status: "active",
        sequential: false,
        folderId: null,
        folderName: null,
        taskCount: 0,
        remainingTaskCount: 0,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProject,
      } as AppleScriptResult<OFProject>);

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
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with dangerous characters", async () => {
      const result = await deleteProject('proj"; delete all; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with newlines", async () => {
      const result = await deleteProject("proj\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should accept valid project ID", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "proj-123",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteProjectResult>);

      const result = await deleteProject("proj-123");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful deletion", () => {
    it("should delete a project and return result", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "proj-789",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteProjectResult>);

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

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteProjectResult>);

      const result = await deleteProject("proj_with_underscores");

      expect(result.success).toBe(true);
    });

    it("should handle project IDs with hyphens", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "proj-with-hyphens",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteProjectResult>);

      const result = await deleteProject("proj-with-hyphens");

      expect(result.success).toBe(true);
    });

    it("should handle alphanumeric project IDs", async () => {
      const mockResult: DeleteProjectResult = {
        projectId: "abc123XYZ",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteProjectResult>);

      const result = await deleteProject("abc123XYZ");

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle project not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: "Project not found",
        },
      } as AppleScriptResult<DeleteProjectResult>);

      const result = await deleteProject("nonexistent-project");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
      expect(result.error?.message).toBe("Project not found");
    });

    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<DeleteProjectResult>);

      const result = await deleteProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript execution error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
          details: "Permission denied",
        },
      } as AppleScriptResult<DeleteProjectResult>);

      const result = await deleteProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
      expect(result.error?.details).toBe("Permission denied");
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<DeleteProjectResult>);

      const result = await deleteProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<DeleteProjectResult>);

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
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with dangerous characters", async () => {
      const result = await dropProject('proj"; activate "Calculator"; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with newlines", async () => {
      const result = await dropProject("proj\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should accept valid project ID", async () => {
      const mockResult: DropProjectResult = {
        projectId: "proj-123",
        projectName: "Test Project",
        dropped: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should reject project ID with periods", async () => {
      // Periods are not allowed in IDs per validation regex
      const result = await dropProject("proj.123.test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });
  });

  describe("successful dropping", () => {
    it("should drop a project and return result", async () => {
      const mockResult: DropProjectResult = {
        projectId: "proj-789",
        projectName: "Dropped Project",
        dropped: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DropProjectResult>);

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

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DropProjectResult>);

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

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DropProjectResult>);

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

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(true);
      expect(result.data?.projectName).toBe(longName);
    });
  });

  describe("error handling", () => {
    it("should handle project not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: "Project not found",
        },
      } as AppleScriptResult<DropProjectResult>);

      const result = await dropProject("nonexistent-project");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
      expect(result.error?.message).toBe("Project not found");
    });

    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript execution error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
          details: "Runtime error",
        },
      } as AppleScriptResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
      expect(result.error?.details).toBe("Runtime error");
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to drop project");
    });

    it("should handle access denied error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Access denied",
        },
      } as AppleScriptResult<DropProjectResult>);

      const result = await dropProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
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

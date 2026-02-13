import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { OFFolder, UpdateFolderOptions } from "../../../src/types.js";
import type { DeleteFolderResult } from "../../../src/commands/folders-crud.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import {
  updateFolder,
  deleteFolder,
} from "../../../src/commands/folders-crud.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("updateFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty folder ID", async () => {
      const result = await updateFolder("", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject folder ID with dangerous characters", async () => {
      const result = await updateFolder('folder"; delete all folders; "', {
        name: "New Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject folder ID with newlines", async () => {
      const result = await updateFolder("folder\nid", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid folder name with quotes", async () => {
      const result = await updateFolder("folder-123", { name: 'Bad"Name' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid parent folder ID", async () => {
      const result = await updateFolder("folder-123", {
        name: "Valid Name",
        parentFolderId: "bad\nparent",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid parent folder name with backslash", async () => {
      const result = await updateFolder("folder-123", {
        name: "Valid Name",
        parentFolderName: "Bad\\Parent",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });
  });

  describe("successful updates", () => {
    it("should update folder name", async () => {
      const mockFolder: OFFolder = {
        id: "folder-123",
        name: "Updated Name",
        parentId: null,
        parentName: null,
        projectCount: 5,
        folderCount: 2,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as AppleScriptResult<OFFolder>);

      const options: UpdateFolderOptions = { name: "Updated Name" };
      const result = await updateFolder("folder-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("Updated Name");
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should move folder to new parent by ID", async () => {
      const mockFolder: OFFolder = {
        id: "folder-123",
        name: "My Folder",
        parentId: "parent-456",
        parentName: "Parent Folder",
        projectCount: 5,
        folderCount: 2,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as AppleScriptResult<OFFolder>);

      const options: UpdateFolderOptions = { parentFolderId: "parent-456" };
      const result = await updateFolder("folder-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.parentId).toBe("parent-456");
    });

    it("should move folder to new parent by name", async () => {
      const mockFolder: OFFolder = {
        id: "folder-123",
        name: "My Folder",
        parentId: "parent-789",
        parentName: "Work",
        projectCount: 5,
        folderCount: 2,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as AppleScriptResult<OFFolder>);

      const options: UpdateFolderOptions = { parentFolderName: "Work" };
      const result = await updateFolder("folder-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.parentName).toBe("Work");
    });

    it("should update folder name and parent", async () => {
      const mockFolder: OFFolder = {
        id: "folder-123",
        name: "Renamed Folder",
        parentId: "parent-456",
        parentName: "New Parent",
        projectCount: 10,
        folderCount: 3,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as AppleScriptResult<OFFolder>);

      const options: UpdateFolderOptions = {
        name: "Renamed Folder",
        parentFolderId: "parent-456",
      };
      const result = await updateFolder("folder-123", options);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockFolder);
    });

    it("should handle folders with no parent", async () => {
      const mockFolder: OFFolder = {
        id: "folder-123",
        name: "Root Folder",
        parentId: null,
        parentName: null,
        projectCount: 0,
        folderCount: 5,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as AppleScriptResult<OFFolder>);

      const options: UpdateFolderOptions = { name: "Root Folder" };
      const result = await updateFolder("folder-123", options);

      expect(result.success).toBe(true);
      expect(result.data?.parentId).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should handle folder not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.FOLDER_NOT_FOUND,
          message: "Folder not found",
        },
      } as AppleScriptResult<OFFolder>);

      const result = await updateFolder("nonexistent-folder", {
        name: "New Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.FOLDER_NOT_FOUND);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<OFFolder>);

      const result = await updateFolder("folder-123", { name: "New Name" });

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
      } as AppleScriptResult<OFFolder>);

      const result = await updateFolder("folder-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
      expect(result.error?.details).toBe("Permission denied");
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFFolder>);

      const result = await updateFolder("folder-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No folder data returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFFolder>);

      const result = await updateFolder("folder-123", { name: "New Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to update folder");
    });

    it("should handle parent folder not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.FOLDER_NOT_FOUND,
          message: "Parent folder not found",
        },
      } as AppleScriptResult<OFFolder>);

      const result = await updateFolder("folder-123", {
        parentFolderId: "nonexistent-parent",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.FOLDER_NOT_FOUND);
    });
  });

  describe("negative tests", () => {
    it("should reject folder ID with special characters", async () => {
      const result = await updateFolder("folder-123'; activate 'Calculator';", {
        name: "Name",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should handle very long folder names", async () => {
      // Very long names are allowed - validation happens at AppleScript level
      const veryLongName = "A".repeat(1000);
      const mockFolder: OFFolder = {
        id: "folder-123",
        name: veryLongName,
        parentId: null,
        parentName: null,
        projectCount: 0,
        folderCount: 0,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockFolder,
      } as AppleScriptResult<OFFolder>);

      const result = await updateFolder("folder-123", { name: veryLongName });

      expect(result.success).toBe(true);
    });

    it("should reject folder ID with control characters", async () => {
      const result = await updateFolder("folder\x00id", { name: "Name" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });
});

describe("deleteFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty folder ID", async () => {
      const result = await deleteFolder("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject folder ID with dangerous characters", async () => {
      const result = await deleteFolder('folder"; delete all; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject folder ID with newlines", async () => {
      const result = await deleteFolder("folder\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should accept valid folder ID", async () => {
      const mockResult: DeleteFolderResult = {
        folderId: "folder-123",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder-123");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should accept folder ID with underscores", async () => {
      const mockResult: DeleteFolderResult = {
        folderId: "folder_with_underscores",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder_with_underscores");

      expect(result.success).toBe(true);
    });
  });

  describe("successful deletion", () => {
    it("should delete a folder and return result", async () => {
      const mockResult: DeleteFolderResult = {
        folderId: "folder-789",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        folderId: "folder-789",
        deleted: true,
      });
      expect(result.error).toBeNull();
    });

    it("should handle folder IDs with underscores", async () => {
      const mockResult: DeleteFolderResult = {
        folderId: "folder_with_underscores",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder_with_underscores");

      expect(result.success).toBe(true);
    });

    it("should handle folder IDs with hyphens", async () => {
      const mockResult: DeleteFolderResult = {
        folderId: "folder-with-hyphens",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder-with-hyphens");

      expect(result.success).toBe(true);
    });

    it("should handle alphanumeric folder IDs", async () => {
      const mockResult: DeleteFolderResult = {
        folderId: "abc123XYZ",
        deleted: true,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("abc123XYZ");

      expect(result.success).toBe(true);
    });

    it("should reject folder IDs with periods", async () => {
      // Periods are not allowed in IDs per validation regex
      const result = await deleteFolder("folder.123.test");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle folder not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.FOLDER_NOT_FOUND,
          message: "Folder not found",
        },
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("nonexistent-folder");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.FOLDER_NOT_FOUND);
      expect(result.error?.message).toBe("Folder not found");
    });

    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript execution error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
          details: "Access denied",
        },
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
      expect(result.error?.details).toBe("Access denied");
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to delete folder");
    });

    it("should handle folder with contents error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Cannot delete folder with contents",
        },
      } as AppleScriptResult<DeleteFolderResult>);

      const result = await deleteFolder("folder-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });
  });

  describe("negative tests", () => {
    it("should reject folder ID with SQL injection attempt", async () => {
      const result = await deleteFolder("folder'; DROP TABLE folders; --");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject folder ID with backslashes", async () => {
      const result = await deleteFolder("folder\\123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject folder ID with tabs", async () => {
      const result = await deleteFolder("folder\tid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type {
  ArchiveResult,
  CompactResult,
} from "../../../src/commands/archive.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import {
  archiveTasks,
  compactDatabase,
} from "../../../src/commands/archive.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("archiveTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject when no date options provided", async () => {
      const result = await archiveTasks({});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain(
        "At least one of --completed-before or --dropped-before"
      );
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject invalid completedBefore date format", async () => {
      const result = await archiveTasks({ completedBefore: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject invalid droppedBefore date format", async () => {
      const result = await archiveTasks({ droppedBefore: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should accept valid completedBefore date", async () => {
      const mockResult: ArchiveResult = {
        tasksArchived: 5,
        projectsArchived: 1,
        dryRun: false,
        archivePath: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ArchiveResult>);

      const result = await archiveTasks({ completedBefore: "2024-01-01" });

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should accept valid droppedBefore date", async () => {
      const mockResult: ArchiveResult = {
        tasksArchived: 3,
        projectsArchived: 0,
        dryRun: false,
        archivePath: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ArchiveResult>);

      const result = await archiveTasks({ droppedBefore: "December 31, 2023" });

      expect(result.success).toBe(true);
    });
  });

  describe("successful archive", () => {
    it("should archive tasks with completedBefore filter", async () => {
      const mockResult: ArchiveResult = {
        tasksArchived: 10,
        projectsArchived: 2,
        dryRun: false,
        archivePath: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ArchiveResult>);

      const result = await archiveTasks({ completedBefore: "2024-01-01" });

      expect(result.success).toBe(true);
      expect(result.data?.tasksArchived).toBe(10);
      expect(result.data?.projectsArchived).toBe(2);
    });

    it("should support dry run mode", async () => {
      const mockResult: ArchiveResult = {
        tasksArchived: 5,
        projectsArchived: 1,
        dryRun: true,
        archivePath: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ArchiveResult>);

      const result = await archiveTasks({
        completedBefore: "2024-01-01",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.dryRun).toBe(true);
    });

    it("should filter by project", async () => {
      const mockResult: ArchiveResult = {
        tasksArchived: 3,
        projectsArchived: 0,
        dryRun: false,
        archivePath: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ArchiveResult>);

      const result = await archiveTasks({
        completedBefore: "2024-01-01",
        project: "Old Project",
      });

      expect(result.success).toBe(true);
    });

    it("should support both completedBefore and droppedBefore", async () => {
      const mockResult: ArchiveResult = {
        tasksArchived: 8,
        projectsArchived: 2,
        dryRun: false,
        archivePath: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ArchiveResult>);

      const result = await archiveTasks({
        completedBefore: "2024-01-01",
        droppedBefore: "2024-01-01",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<ArchiveResult>);

      const result = await archiveTasks({ completedBefore: "2024-01-01" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<ArchiveResult>);

      const result = await archiveTasks({ completedBefore: "2024-01-01" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<ArchiveResult>);

      const result = await archiveTasks({ completedBefore: "2024-01-01" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("compactDatabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful compact", () => {
    it("should trigger database compaction", async () => {
      const mockResult: CompactResult = {
        compacted: true,
        message: "Database compaction triggered",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<CompactResult>);

      const result = await compactDatabase();

      expect(result.success).toBe(true);
      expect(result.data?.compacted).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<CompactResult>);

      const result = await compactDatabase();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<CompactResult>);

      const result = await compactDatabase();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

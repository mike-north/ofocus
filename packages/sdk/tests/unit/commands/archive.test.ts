import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type {
  ArchiveResult,
  CompactResult,
} from "../../../src/commands/archive.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
  toOmniJSDate: vi.fn((d: string) => `new Date("${d}")`),
}));

// Import after mocking
import {
  archiveTasks,
  compactDatabase,
} from "../../../src/commands/archive.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

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
      expect(mockRunOmniJS).not.toHaveBeenCalled();
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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<ArchiveResult>);

      const result = await archiveTasks({ completedBefore: "2024-01-01" });

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should accept valid droppedBefore date", async () => {
      const mockResult: ArchiveResult = {
        tasksArchived: 3,
        projectsArchived: 0,
        dryRun: false,
        archivePath: null,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<ArchiveResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<ArchiveResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<ArchiveResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<ArchiveResult>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<ArchiveResult>);

      const result = await archiveTasks({
        completedBefore: "2024-01-01",
        droppedBefore: "2024-01-01",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<ArchiveResult>);

      const result = await archiveTasks({ completedBefore: "2024-01-01" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<ArchiveResult>);

      const result = await archiveTasks({ completedBefore: "2024-01-01" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<ArchiveResult>);

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

  /**
   * OmniJS does not expose a compact() method — OmniFocus handles database
   * compaction internally and does not surface it through JavaScript
   * automation. compactDatabase() now returns a structured "not supported"
   * result (compacted: false) instead of fabricating success.
   *
   * Behavioral change from AppleScript: previously returned { compacted: true }
   * by calling AppleScript's `compact` command. Now returns { compacted: false }
   * with an explanatory message. Callers should check compacted === false and
   * treat it as a no-op rather than an error.
   */
  describe("not supported via OmniJS", () => {
    it("should return compacted: false with an explanatory message", async () => {
      const result = await compactDatabase();

      expect(result.success).toBe(true);
      expect(result.data?.compacted).toBe(false);
      expect(result.data?.message).toContain("not supported via OmniJS");
      // compactDatabase no longer calls OmniJS — it returns synchronously
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should always succeed (never throw or return failure)", async () => {
      // Called multiple times to confirm no side-effects or error states
      const result1 = await compactDatabase();
      const result2 = await compactDatabase();

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data?.compacted).toBe(false);
      expect(result2.data?.compacted).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { OFProject, ReviewResult } from "../../../src/types.js";
import type { ReviewIntervalResult } from "../../../src/commands/review.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import {
  reviewProject,
  queryProjectsForReview,
  getReviewInterval,
  setReviewInterval,
} from "../../../src/commands/review.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("reviewProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty project ID", async () => {
      const result = await reviewProject("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with dangerous characters", async () => {
      const result = await reviewProject('proj"; delete all projects; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with newlines", async () => {
      const result = await reviewProject("proj\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should accept valid project ID", async () => {
      const mockResult: ReviewResult = {
        projectId: "proj-123",
        projectName: "Test project",
        lastReviewed: "2024-01-15 10:30:00",
        nextReviewDate: "2024-02-15 10:30:00",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj-123");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should accept project ID with underscores", async () => {
      const mockResult: ReviewResult = {
        projectId: "proj_with_underscores",
        projectName: "Test project",
        lastReviewed: "2024-01-15 10:30:00",
        nextReviewDate: "2024-02-15 10:30:00",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj_with_underscores");

      expect(result.success).toBe(true);
    });
  });

  describe("successful review", () => {
    it("should review a project and return result", async () => {
      const mockResult: ReviewResult = {
        projectId: "proj-789",
        projectName: "Reviewed Project",
        lastReviewed: "2024-01-20 14:30:00",
        nextReviewDate: "2024-02-20 14:30:00",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj-789");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        projectId: "proj-789",
        projectName: "Reviewed Project",
        lastReviewed: "2024-01-20 14:30:00",
        nextReviewDate: "2024-02-20 14:30:00",
      });
      expect(result.error).toBeNull();
    });

    it("should handle project with no next review date", async () => {
      const mockResult: ReviewResult = {
        projectId: "proj-123",
        projectName: "Project",
        lastReviewed: "2024-01-20 14:30:00",
        nextReviewDate: null,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj-123");

      expect(result.success).toBe(true);
      expect(result.data?.nextReviewDate).toBeNull();
    });

    it("should handle project names with special characters", async () => {
      const mockResult: ReviewResult = {
        projectId: "proj-123",
        projectName: 'Project with "quotes"',
        lastReviewed: "2024-01-20 14:30:00",
        nextReviewDate: "2024-02-20 14:30:00",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj-123");

      expect(result.success).toBe(true);
      expect(result.data?.projectName).toBe('Project with "quotes"');
    });

    it("should handle project IDs with hyphens", async () => {
      const mockResult: ReviewResult = {
        projectId: "proj-with-hyphens",
        projectName: "Project",
        lastReviewed: "2024-01-20 14:30:00",
        nextReviewDate: "2024-02-20 14:30:00",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj-with-hyphens");

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
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("nonexistent-project");

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
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript execution error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
          details: "Review error",
        },
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
      expect(result.error?.details).toBe("Review error");
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<ReviewResult>);

      const result = await reviewProject("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to review project");
    });
  });

  describe("negative tests", () => {
    it("should reject project ID with SQL injection attempt", async () => {
      const result = await reviewProject("proj'; DROP TABLE projects; --");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject project ID with control characters", async () => {
      const result = await reviewProject("proj\x00id");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });
});

describe("queryProjectsForReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful query", () => {
    it("should return projects due for review", async () => {
      const mockProjects: OFProject[] = [
        {
          id: "proj-1",
          name: "Project 1",
          note: null,
          status: "active",
          sequential: false,
          folderId: null,
          folderName: null,
          taskCount: 5,
          remainingTaskCount: 3,
        },
        {
          id: "proj-2",
          name: "Project 2",
          note: "Notes",
          status: "active",
          sequential: true,
          folderId: "folder-123",
          folderName: "Work",
          taskCount: 10,
          remainingTaskCount: 7,
        },
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProjects,
      } as AppleScriptResult<OFProject[]>);

      const result = await queryProjectsForReview();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockProjects);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should return empty array when no projects need review", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFProject[]>);

      const result = await queryProjectsForReview();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should handle undefined data as empty array", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFProject[]>);

      const result = await queryProjectsForReview();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should filter out dropped and completed projects", async () => {
      const mockProjects: OFProject[] = [
        {
          id: "proj-1",
          name: "Active Project",
          note: null,
          status: "active",
          sequential: false,
          folderId: null,
          folderName: null,
          taskCount: 5,
          remainingTaskCount: 3,
        },
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProjects,
      } as AppleScriptResult<OFProject[]>);

      const result = await queryProjectsForReview();

      expect(result.success).toBe(true);
      expect(
        result.data?.every(
          (p) => p.status !== "dropped" && p.status !== "completed"
        )
      ).toBe(true);
    });

    it("should include on-hold projects", async () => {
      const mockProjects: OFProject[] = [
        {
          id: "proj-1",
          name: "On Hold Project",
          note: null,
          status: "on-hold",
          sequential: false,
          folderId: null,
          folderName: null,
          taskCount: 5,
          remainingTaskCount: 3,
        },
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockProjects,
      } as AppleScriptResult<OFProject[]>);

      const result = await queryProjectsForReview();

      expect(result.success).toBe(true);
      expect(result.data?.[0]?.status).toBe("on-hold");
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
      } as AppleScriptResult<OFProject[]>);

      const result = await queryProjectsForReview();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle AppleScript execution error", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "AppleScript execution failed",
        },
      } as AppleScriptResult<OFProject[]>);

      const result = await queryProjectsForReview();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.APPLESCRIPT_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFProject[]>);

      const result = await queryProjectsForReview();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to query projects for review");
    });
  });
});

describe("getReviewInterval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty project ID", async () => {
      const result = await getReviewInterval("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with dangerous characters", async () => {
      const result = await getReviewInterval('proj"; delete all; "');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with newlines", async () => {
      const result = await getReviewInterval("proj\nid");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should accept valid project ID", async () => {
      const mockResult: ReviewIntervalResult = {
        projectId: "proj-123",
        projectName: "Test project",
        reviewIntervalDays: 30,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await getReviewInterval("proj-123");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful retrieval", () => {
    it("should get review interval in days", async () => {
      const mockResult: ReviewIntervalResult = {
        projectId: "proj-789",
        projectName: "Weekly Project",
        reviewIntervalDays: 7,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await getReviewInterval("proj-789");

      expect(result.success).toBe(true);
      expect(result.data?.reviewIntervalDays).toBe(7);
    });

    it("should handle zero interval", async () => {
      const mockResult: ReviewIntervalResult = {
        projectId: "proj-123",
        projectName: "Project",
        reviewIntervalDays: 0,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await getReviewInterval("proj-123");

      expect(result.success).toBe(true);
      expect(result.data?.reviewIntervalDays).toBe(0);
    });

    it("should handle monthly interval", async () => {
      const mockResult: ReviewIntervalResult = {
        projectId: "proj-123",
        projectName: "Monthly Project",
        reviewIntervalDays: 30,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await getReviewInterval("proj-123");

      expect(result.success).toBe(true);
      expect(result.data?.reviewIntervalDays).toBe(30);
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
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await getReviewInterval("nonexistent-project");

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
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await getReviewInterval("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await getReviewInterval("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await getReviewInterval("proj-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to get review interval");
    });
  });
});

describe("setReviewInterval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty project ID", async () => {
      const result = await setReviewInterval("", 7);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with dangerous characters", async () => {
      const result = await setReviewInterval('proj"; delete all; "', 7);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject project ID with newlines", async () => {
      const result = await setReviewInterval("proj\nid", 7);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject non-integer days", async () => {
      const result = await setReviewInterval("proj-123", 7.5);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("positive integer");
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject zero days", async () => {
      const result = await setReviewInterval("proj-123", 0);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("positive integer");
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject negative days", async () => {
      const result = await setReviewInterval("proj-123", -7);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("positive integer");
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should accept valid project ID and days", async () => {
      const mockResult: ReviewIntervalResult = {
        projectId: "proj-123",
        projectName: "Test project",
        reviewIntervalDays: 7,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await setReviewInterval("proj-123", 7);

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful setting", () => {
    it("should set review interval to 7 days", async () => {
      const mockResult: ReviewIntervalResult = {
        projectId: "proj-789",
        projectName: "Weekly Project",
        reviewIntervalDays: 7,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await setReviewInterval("proj-789", 7);

      expect(result.success).toBe(true);
      expect(result.data?.reviewIntervalDays).toBe(7);
    });

    it("should set review interval to 30 days", async () => {
      const mockResult: ReviewIntervalResult = {
        projectId: "proj-123",
        projectName: "Monthly Project",
        reviewIntervalDays: 30,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await setReviewInterval("proj-123", 30);

      expect(result.success).toBe(true);
      expect(result.data?.reviewIntervalDays).toBe(30);
    });

    it("should set review interval to 1 day", async () => {
      const mockResult: ReviewIntervalResult = {
        projectId: "proj-123",
        projectName: "Daily Project",
        reviewIntervalDays: 1,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await setReviewInterval("proj-123", 1);

      expect(result.success).toBe(true);
      expect(result.data?.reviewIntervalDays).toBe(1);
    });

    it("should set review interval to large number of days", async () => {
      const mockResult: ReviewIntervalResult = {
        projectId: "proj-123",
        projectName: "Yearly Project",
        reviewIntervalDays: 365,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await setReviewInterval("proj-123", 365);

      expect(result.success).toBe(true);
      expect(result.data?.reviewIntervalDays).toBe(365);
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
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await setReviewInterval("nonexistent-project", 7);

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
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await setReviewInterval("proj-123", 7);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await setReviewInterval("proj-123", 7);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No result returned");
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<ReviewIntervalResult>);

      const result = await setReviewInterval("proj-123", 7);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("Failed to set review interval");
    });
  });

  describe("negative tests", () => {
    it("should reject project ID with control characters", async () => {
      const result = await setReviewInterval("proj\x00id", 7);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject NaN as days parameter", async () => {
      const result = await setReviewInterval("proj-123", Number.NaN);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject Infinity as days parameter", async () => {
      const result = await setReviewInterval(
        "proj-123",
        Number.POSITIVE_INFINITY
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});

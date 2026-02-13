import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OFTask, OFProject, PaginatedResult } from "../../../src/types.js";
import type { StatsResult } from "../../../src/commands/stats.js";

// Mock the tasks module
vi.mock("../../../src/commands/tasks.js", () => ({
  queryTasks: vi.fn(),
}));

// Mock the projects module
vi.mock("../../../src/commands/projects.js", () => ({
  queryProjects: vi.fn(),
}));

// Import after mocking
import { getStats } from "../../../src/commands/stats.js";
import { queryTasks } from "../../../src/commands/tasks.js";
import { queryProjects } from "../../../src/commands/projects.js";

const mockQueryTasks = vi.mocked(queryTasks);
const mockQueryProjects = vi.mocked(queryProjects);

const createMockTask = (overrides: Partial<OFTask> = {}): OFTask => ({
  id: "task-123",
  name: "Test Task",
  note: null,
  flagged: false,
  completed: false,
  dueDate: null,
  deferDate: null,
  completionDate: null,
  projectId: null,
  projectName: null,
  tags: [],
  estimatedMinutes: null,
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
  taskCount: 5,
  remainingTaskCount: 3,
  ...overrides,
});

const createMockPaginatedTasks = (
  items: OFTask[]
): PaginatedResult<OFTask> => ({
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
});

const createMockPaginatedProjects = (
  items: OFProject[]
): PaginatedResult<OFProject> => ({
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
});

describe("getStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject invalid since date format", async () => {
      const result = await getStats({ since: 'bad"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(mockQueryTasks).not.toHaveBeenCalled();
    });

    it("should reject invalid until date format", async () => {
      const result = await getStats({ until: 'invalid"date' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });
  });

  describe("successful stats retrieval", () => {
    it("should return stats with default options", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", completed: false }),
        createMockTask({ id: "task-2", completed: true }),
      ];
      const mockProjects = [createMockProject({ status: "active" })];

      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks(mockTasks),
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects(mockProjects),
      });

      const result = await getStats();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.tasksCompleted).toBe(1);
      expect(result.data?.tasksRemaining).toBe(1);
      expect(result.data?.projectsActive).toBe(1);
    });

    it("should count flagged tasks", async () => {
      const mockTasks = [
        createMockTask({ flagged: true, completed: false }),
        createMockTask({ flagged: true, completed: false }),
        createMockTask({ flagged: false, completed: false }),
      ];

      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks(mockTasks),
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects([]),
      });

      const result = await getStats();

      expect(result.success).toBe(true);
      expect(result.data?.tasksFlagged).toBe(2);
    });

    it("should count overdue tasks", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      const mockTasks = [
        createMockTask({ dueDate: yesterdayStr, completed: false }),
      ];

      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks(mockTasks),
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects([]),
      });

      const result = await getStats();

      expect(result.success).toBe(true);
      expect(result.data?.tasksOverdue).toBe(1);
    });

    it("should count tasks due today", async () => {
      // Create a datetime string that will be correctly parsed as today
      // Using toISOString() preserves the exact moment, which will match today
      const now = new Date();
      now.setHours(12, 0, 0, 0); // Set to noon to avoid timezone edge cases
      const todayDatetime = now.toISOString();

      const mockTasks = [
        createMockTask({ dueDate: todayDatetime, completed: false }),
      ];

      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks(mockTasks),
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects([]),
      });

      const result = await getStats();

      expect(result.success).toBe(true);
      expect(result.data?.tasksDueToday).toBe(1);
    });

    it("should count on-hold projects", async () => {
      const mockProjects = [
        createMockProject({ status: "active" }),
        createMockProject({ status: "on-hold" }),
        createMockProject({ status: "on-hold" }),
      ];

      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks([]),
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects(mockProjects),
      });

      const result = await getStats();

      expect(result.success).toBe(true);
      expect(result.data?.projectsActive).toBe(1);
      expect(result.data?.projectsOnHold).toBe(2);
    });

    it("should filter by project", async () => {
      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks([]),
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects([]),
      });

      const result = await getStats({ project: "Work" });

      expect(result.success).toBe(true);
      expect(result.data?.projectFilter).toBe("Work");
      expect(mockQueryTasks).toHaveBeenCalledWith(
        expect.objectContaining({ project: "Work" })
      );
    });

    it("should filter by period", async () => {
      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks([]),
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects([]),
      });

      const result = await getStats({ period: "week" });

      expect(result.success).toBe(true);
      expect(result.data?.periodStart).toBeDefined();
      expect(result.data?.periodEnd).toBeDefined();
    });

    it("should filter by since date", async () => {
      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks([]),
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects([]),
      });

      const result = await getStats({ since: "2024-01-01" });

      expect(result.success).toBe(true);
      // periodStart is set based on the since option (may have timezone offset)
      expect(result.data?.periodStart).toBeDefined();
      expect(result.data?.periodStart?.startsWith("202")).toBe(true);
    });

    it("should filter by since and until dates", async () => {
      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks([]),
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects([]),
      });

      const result = await getStats({
        since: "2024-01-01",
        until: "2024-01-31",
      });

      expect(result.success).toBe(true);
      // periodStart and periodEnd are set based on options (may have timezone offset)
      expect(result.data?.periodStart).toBeDefined();
      expect(result.data?.periodEnd).toBeDefined();
      expect(result.data?.periodStart?.startsWith("202")).toBe(true);
      expect(result.data?.periodEnd?.startsWith("202")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle task query failure", async () => {
      mockQueryTasks.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      });

      const result = await getStats();

      expect(result.success).toBe(false);
    });

    it("should handle empty task result gracefully", async () => {
      mockQueryTasks.mockResolvedValue({
        success: true,
        data: undefined,
      });

      mockQueryProjects.mockResolvedValue({
        success: true,
        data: createMockPaginatedProjects([]),
      });

      const result = await getStats();

      expect(result.success).toBe(true);
      expect(result.data?.tasksCompleted).toBe(0);
    });

    it("should handle project query failure gracefully", async () => {
      mockQueryTasks.mockResolvedValue({
        success: true,
        data: createMockPaginatedTasks([]),
      });

      mockQueryProjects.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Query failed",
        },
      });

      const result = await getStats();

      // Stats should still succeed with partial data
      expect(result.success).toBe(true);
      expect(result.data?.projectsActive).toBe(0);
    });
  });
});

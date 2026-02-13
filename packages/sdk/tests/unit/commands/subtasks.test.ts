import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type {
  OFTaskWithChildren,
  PaginatedResult,
} from "../../../src/types.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runComposedScript: vi.fn(),
}));

// Mock the asset-loader module
vi.mock("../../../src/asset-loader.js", () => ({
  loadScriptContentCached: vi.fn().mockResolvedValue("-- mocked script"),
}));

// Import after mocking
import {
  createSubtask,
  querySubtasks,
  moveTaskToParent,
} from "../../../src/commands/subtasks.js";
import { runComposedScript } from "../../../src/applescript.js";

const mockRunComposedScript = vi.mocked(runComposedScript);

const createMockTaskWithChildren = (
  overrides: Partial<OFTaskWithChildren> = {}
): OFTaskWithChildren => ({
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
  parentTaskId: "parent-123",
  parentTaskName: "Parent Task",
  subtasks: [],
  ...overrides,
});

const createMockPaginatedResult = (
  items: OFTaskWithChildren[],
  overrides: Partial<PaginatedResult<OFTaskWithChildren>> = {}
): PaginatedResult<OFTaskWithChildren> => ({
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
  ...overrides,
});

describe("createSubtask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty parent task ID", async () => {
      const result = await createSubtask("New Subtask", "");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunComposedScript).not.toHaveBeenCalled();
    });

    it("should reject invalid parent task ID format", async () => {
      const result = await createSubtask("New Subtask", 'parent"id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject empty title", async () => {
      const result = await createSubtask("", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("title cannot be empty");
    });

    it("should reject whitespace-only title", async () => {
      const result = await createSubtask("   ", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject invalid due date", async () => {
      const result = await createSubtask("New Subtask", "parent-123", {
        due: 'bad"date',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject invalid defer date", async () => {
      const result = await createSubtask("New Subtask", "parent-123", {
        defer: 'bad"date',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("should reject empty tags", async () => {
      const result = await createSubtask("New Subtask", "parent-123", {
        tags: ["valid", ""],
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should reject negative estimated minutes", async () => {
      const result = await createSubtask("New Subtask", "parent-123", {
        estimatedMinutes: -10,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid subtask creation", async () => {
      const mockTask = createMockTaskWithChildren({ name: "New Subtask" });

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTaskWithChildren>);

      const result = await createSubtask("New Subtask", "parent-123");

      expect(result.success).toBe(true);
      expect(mockRunComposedScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful creation", () => {
    it("should create subtask with all options", async () => {
      const mockTask = createMockTaskWithChildren({
        name: "New Subtask",
        note: "Test note",
        flagged: true,
        tags: ["work"],
        estimatedMinutes: 30,
      });

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTaskWithChildren>);

      const result = await createSubtask("New Subtask", "parent-123", {
        note: "Test note",
        flag: true,
        tags: ["work"],
        estimatedMinutes: 30,
      });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("New Subtask");
    });
  });

  describe("error handling", () => {
    it("should handle parent task not found", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Parent task not found",
        },
      } as AppleScriptResult<OFTaskWithChildren>);

      const result = await createSubtask("New Subtask", "nonexistent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFTaskWithChildren>);

      const result = await createSubtask("New Subtask", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("querySubtasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty parent task ID", async () => {
      const result = await querySubtasks("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject invalid parent task ID format", async () => {
      const result = await querySubtasks('parent"id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });

  describe("successful query", () => {
    it("should return paginated subtasks", async () => {
      const mockSubtasks = [
        createMockTaskWithChildren({ id: "subtask-1" }),
        createMockTaskWithChildren({ id: "subtask-2" }),
      ];
      const mockResult = createMockPaginatedResult(mockSubtasks);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFTaskWithChildren>>);

      const result = await querySubtasks("parent-123");

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(2);
    });

    it("should filter by completed status", async () => {
      const mockSubtasks = [createMockTaskWithChildren({ completed: true })];
      const mockResult = createMockPaginatedResult(mockSubtasks);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFTaskWithChildren>>);

      const result = await querySubtasks("parent-123", { completed: true });

      expect(result.success).toBe(true);
    });

    it("should filter by flagged status", async () => {
      const mockSubtasks = [createMockTaskWithChildren({ flagged: true })];
      const mockResult = createMockPaginatedResult(mockSubtasks);

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFTaskWithChildren>>);

      const result = await querySubtasks("parent-123", { flagged: true });

      expect(result.success).toBe(true);
    });

    it("should handle pagination with offset and limit", async () => {
      const mockSubtasks = [createMockTaskWithChildren()];
      const mockResult = createMockPaginatedResult(mockSubtasks, {
        totalCount: 50,
        hasMore: true,
        offset: 10,
        limit: 5,
      });

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<PaginatedResult<OFTaskWithChildren>>);

      const result = await querySubtasks("parent-123", {
        offset: 10,
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data?.offset).toBe(10);
      expect(result.data?.hasMore).toBe(true);
    });

    it("should return default empty result on undefined data", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<PaginatedResult<OFTaskWithChildren>>);

      const result = await querySubtasks("parent-123");

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
      expect(result.data?.totalCount).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should handle parent task not found", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Parent task not found",
        },
      } as AppleScriptResult<PaginatedResult<OFTaskWithChildren>>);

      const result = await querySubtasks("nonexistent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });
  });
});

describe("moveTaskToParent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty task ID", async () => {
      const result = await moveTaskToParent("", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject empty parent task ID", async () => {
      const result = await moveTaskToParent("task-123", "");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject invalid task ID format", async () => {
      const result = await moveTaskToParent('task"id', "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("should reject invalid parent task ID format", async () => {
      const result = await moveTaskToParent("task-123", 'parent"id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });

  describe("successful move", () => {
    it("should move task to new parent", async () => {
      const mockTask = createMockTaskWithChildren({
        id: "task-123",
        parentTaskId: "new-parent-456",
      });

      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: mockTask,
      } as AppleScriptResult<OFTaskWithChildren>);

      const result = await moveTaskToParent("task-123", "new-parent-456");

      expect(result.success).toBe(true);
      expect(result.data?.parentTaskId).toBe("new-parent-456");
    });
  });

  describe("error handling", () => {
    it("should handle task not found", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Task not found",
        },
      } as AppleScriptResult<OFTaskWithChildren>);

      const result = await moveTaskToParent("nonexistent", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("should handle undefined data response", async () => {
      mockRunComposedScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFTaskWithChildren>);

      const result = await moveTaskToParent("task-123", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

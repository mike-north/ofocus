import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { OFPerspective, OFTask } from "../../../src/types.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import {
  listPerspectives,
  queryPerspective,
} from "../../../src/commands/perspectives.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

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

describe("listPerspectives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful listing", () => {
    it("should return all perspectives", async () => {
      const mockPerspectives: OFPerspective[] = [
        { id: "persp-1", name: "Inbox" },
        { id: "persp-2", name: "Projects" },
        { id: "persp-3", name: "Flagged" },
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockPerspectives,
      } as AppleScriptResult<OFPerspective[]>);

      const result = await listPerspectives();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should return empty array when no perspectives exist", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFPerspective[]>);

      const result = await listPerspectives();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return empty array on undefined data", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFPerspective[]>);

      const result = await listPerspectives();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
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
      } as AppleScriptResult<OFPerspective[]>);

      const result = await listPerspectives();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFPerspective[]>);

      const result = await listPerspectives();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("queryPerspective", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty perspective name", async () => {
      const result = await queryPerspective("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("cannot be empty");
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("should reject whitespace-only perspective name", async () => {
      const result = await queryPerspective("   ");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("should accept valid perspective name", async () => {
      const mockTasks = [createMockTask({ flagged: true })];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful queries", () => {
    it("should query Flagged perspective", async () => {
      const mockTasks = [
        createMockTask({ id: "task-1", flagged: true }),
        createMockTask({ id: "task-2", flagged: true }),
      ];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should query Inbox perspective", async () => {
      const mockTasks = [createMockTask({ projectId: null })];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Inbox");

      expect(result.success).toBe(true);
    });

    it("should query Forecast perspective", async () => {
      const mockTasks = [createMockTask({ dueDate: "2024-12-31" })];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Forecast");

      expect(result.success).toBe(true);
    });

    it("should query custom perspective", async () => {
      const mockTasks = [createMockTask()];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("My Custom Perspective");

      expect(result.success).toBe(true);
    });

    it("should respect limit option", async () => {
      const mockTasks = [createMockTask()];

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockTasks,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Flagged", { limit: 10 });

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        expect.stringContaining("set maxResults to 10")
      );
    });

    it("should use default limit of 100", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        expect.stringContaining("set maxResults to 100")
      );
    });

    it("should return empty array when no tasks match", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: [],
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return empty array on undefined data", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should handle perspective not found", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.APPLESCRIPT_ERROR,
          message: "Perspective not found: Nonexistent",
        },
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Nonexistent");

      expect(result.success).toBe(false);
    });

    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<OFTask[]>);

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

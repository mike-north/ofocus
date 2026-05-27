/**
 * Tests for the OmniJS-based perspectives commands.
 *
 * @see https://omni-automation.com/omnifocus/perspective.html
 * @see https://omni-automation.com/omnifocus/window.html
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFPerspective, OFTask } from "../../../src/types.js";
import type {
  CreatePerspectiveOptions,
  DeletePerspectiveResult,
} from "../../../src/commands/perspectives.js";

// Mock the omnijs module — same pattern as projects-crud.test.ts
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
  toOmniJSDate: vi.fn((s: string) => `new Date("${s}")`),
}));

// Import after mocking
import {
  listPerspectives,
  queryPerspective,
  createPerspective,
  renamePerspective,
  deletePerspective,
} from "../../../src/commands/perspectives.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const createMockPerspective = (
  overrides: Partial<OFPerspective> = {}
): OFPerspective => ({
  id: "persp-abc123",
  name: "Test Perspective",
  kind: "custom",
  ...overrides,
});

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

function omniSuccess<T>(data: T): OmniJSResult<T> {
  return { success: true, data };
}

function omniFailure(
  code: (typeof ErrorCode)[keyof typeof ErrorCode],
  message: string
): OmniJSResult<never> {
  return { success: false, error: { code, message } };
}

// ---------------------------------------------------------------------------
// listPerspectives
// ---------------------------------------------------------------------------

describe("listPerspectives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful listing", () => {
    it("should return all perspectives with kind field", async () => {
      const mockPerspectives: OFPerspective[] = [
        { id: "Inbox", name: "Inbox", kind: "builtin" },
        { id: "Projects", name: "Projects", kind: "builtin" },
        { id: "abc123", name: "My Work", kind: "custom" },
      ];

      mockRunOmniJS.mockResolvedValue(omniSuccess(mockPerspectives));

      const result = await listPerspectives();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should return builtin perspectives with id=name", async () => {
      const mockPerspectives: OFPerspective[] = [
        { id: "Inbox", name: "Inbox", kind: "builtin" },
        { id: "Flagged", name: "Flagged", kind: "builtin" },
      ];

      mockRunOmniJS.mockResolvedValue(omniSuccess(mockPerspectives));

      const result = await listPerspectives();

      expect(result.success).toBe(true);
      expect(result.data?.[0]).toEqual({
        id: "Inbox",
        name: "Inbox",
        kind: "builtin",
      });
    });

    it("should return custom perspectives with uuid id", async () => {
      const mockPerspectives: OFPerspective[] = [
        { id: "aS3jYumRtrm", name: "Work Tasks", kind: "custom" },
      ];

      mockRunOmniJS.mockResolvedValue(omniSuccess(mockPerspectives));

      const result = await listPerspectives();

      expect(result.success).toBe(true);
      expect(result.data?.[0]).toEqual({
        id: "aS3jYumRtrm",
        name: "Work Tasks",
        kind: "custom",
      });
    });

    it("should return empty array when no perspectives exist", async () => {
      mockRunOmniJS.mockResolvedValue(omniSuccess([]));

      const result = await listPerspectives();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return empty array on undefined data", async () => {
      mockRunOmniJS.mockResolvedValue({ success: true, data: undefined });

      const result = await listPerspectives();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue(
        omniFailure(
          ErrorCode.OMNIFOCUS_NOT_RUNNING,
          "OmniFocus is not running"
        )
      );

      const result = await listPerspectives();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle OmniJS script error", async () => {
      mockRunOmniJS.mockResolvedValue(
        omniFailure(ErrorCode.SCRIPT_ERROR, "OmniJS script error")
      );

      const result = await listPerspectives();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });

    it("should handle null error in failure response with UNKNOWN_ERROR", async () => {
      mockRunOmniJS.mockResolvedValue({ success: false });

      const result = await listPerspectives();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

// ---------------------------------------------------------------------------
// queryPerspective
// ---------------------------------------------------------------------------

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
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject whitespace-only perspective name", async () => {
      const result = await queryPerspective("   ");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });
  });

  describe("successful queries", () => {
    it("should query a built-in perspective and return tasks", async () => {
      const mockTasks: OFTask[] = [
        createMockTask({ id: "task-1", flagged: true }),
        createMockTask({ id: "task-2", flagged: true }),
      ];

      mockRunOmniJS.mockResolvedValue(omniSuccess(mockTasks));

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should query Inbox perspective", async () => {
      const mockTasks: OFTask[] = [createMockTask({ projectId: null })];

      mockRunOmniJS.mockResolvedValue(omniSuccess(mockTasks));

      const result = await queryPerspective("Inbox");

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it("should query a custom perspective", async () => {
      const mockTasks: OFTask[] = [createMockTask()];

      mockRunOmniJS.mockResolvedValue(omniSuccess(mockTasks));

      const result = await queryPerspective("My Custom Perspective");

      expect(result.success).toBe(true);
    });

    it("should return empty array when no tasks match", async () => {
      mockRunOmniJS.mockResolvedValue(omniSuccess([]));

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return empty array on undefined data", async () => {
      mockRunOmniJS.mockResolvedValue({ success: true, data: undefined });

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should pass the limit option into the OmniJS body", async () => {
      mockRunOmniJS.mockResolvedValue(omniSuccess([]));

      await queryPerspective("Flagged", { limit: 10 });

      expect(mockRunOmniJS).toHaveBeenCalledWith(
        expect.stringContaining("var maxResults = 10")
      );
    });

    it("should use default limit of 100", async () => {
      mockRunOmniJS.mockResolvedValue(omniSuccess([]));

      await queryPerspective("Flagged");

      expect(mockRunOmniJS).toHaveBeenCalledWith(
        expect.stringContaining("var maxResults = 100")
      );
    });

    it("should include try/finally to restore prior perspective", async () => {
      mockRunOmniJS.mockResolvedValue(omniSuccess([]));

      await queryPerspective("Flagged");

      const scriptArg = mockRunOmniJS.mock.calls[0]?.[0] ?? "";
      expect(scriptArg).toContain("priorPerspective");
      expect(scriptArg).toContain("finally");
      expect(scriptArg).toContain("win.perspective = priorPerspective");
    });
  });

  describe("not found handling", () => {
    it("should return PERSPECTIVE_NOT_FOUND when OmniJS signals not found", async () => {
      mockRunOmniJS.mockResolvedValue(
        omniSuccess({ __not_found: true, name: "Nonexistent" })
      );

      const result = await queryPerspective("Nonexistent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.PERSPECTIVE_NOT_FOUND);
      expect(result.error?.message).toContain("Nonexistent");
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue(
        omniFailure(
          ErrorCode.OMNIFOCUS_NOT_RUNNING,
          "OmniFocus is not running"
        )
      );

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response with UNKNOWN_ERROR", async () => {
      mockRunOmniJS.mockResolvedValue({ success: false });

      const result = await queryPerspective("Flagged");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

// ---------------------------------------------------------------------------
// createPerspective
// ---------------------------------------------------------------------------

describe("createPerspective", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return a structured failure (OmniJS does not expose fromArchive)", async () => {
    const opts: CreatePerspectiveOptions = { archivePayload: "base64data==" };

    const result = await createPerspective("My Perspective", opts);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toContain("not supported");
    // OmniJS does not need to be called — this is a compile-time known limitation
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("should not call OmniJS at all", async () => {
    await createPerspective("X", { archivePayload: "payload" });
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// renamePerspective
// ---------------------------------------------------------------------------

describe("renamePerspective", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject empty idOrName", async () => {
    const result = await renamePerspective("", "New Name");

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toContain("cannot be empty");
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("should reject whitespace-only idOrName", async () => {
    const result = await renamePerspective("   ", "New Name");

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("should return a structured failure (Perspective.Custom.name is read-only)", async () => {
    const result = await renamePerspective("My Perspective", "New Name");

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.error?.message).toContain("not supported");
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("should not call OmniJS regardless of input", async () => {
    await renamePerspective("Some Perspective", "New Name");
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deletePerspective
// ---------------------------------------------------------------------------

describe("deletePerspective", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("should reject empty idOrName without calling OmniJS", async () => {
      const result = await deletePerspective("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("cannot be empty");
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("should reject whitespace-only idOrName", async () => {
      const result = await deletePerspective("   ");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });
  });

  describe("not found", () => {
    it("should return PERSPECTIVE_NOT_FOUND when perspective does not exist", async () => {
      mockRunOmniJS.mockResolvedValue(
        omniSuccess({
          found: false,
          isBuiltIn: false,
          name: null,
          id: null,
        })
      );

      const result = await deletePerspective("Nonexistent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.PERSPECTIVE_NOT_FOUND);
      expect(result.error?.message).toContain("Nonexistent");
    });
  });

  describe("built-in rejection", () => {
    it("should reject deletion of a built-in perspective", async () => {
      mockRunOmniJS.mockResolvedValue(
        omniSuccess({
          found: true,
          isBuiltIn: true,
          name: "Inbox",
          id: "Inbox",
        })
      );

      const result = await deletePerspective("Inbox");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("built-in");
    });
  });

  describe("unsupported operation for custom perspectives", () => {
    it("should return a structured failure for custom perspectives (OmniJS limitation)", async () => {
      mockRunOmniJS.mockResolvedValue(
        omniSuccess({
          found: true,
          isBuiltIn: false,
          name: "My Work",
          id: "aS3jYumRtrm",
        })
      );

      const result = await deletePerspective("My Work");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("not supported");
    });

    it("should be callable by identifier as well as name", async () => {
      mockRunOmniJS.mockResolvedValue(
        omniSuccess({
          found: true,
          isBuiltIn: false,
          name: "My Work",
          id: "aS3jYumRtrm",
        })
      );

      const result = await deletePerspective("aS3jYumRtrm");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe("OmniJS error handling", () => {
    it("should handle OmniFocus not running during lookup", async () => {
      mockRunOmniJS.mockResolvedValue(
        omniFailure(
          ErrorCode.OMNIFOCUS_NOT_RUNNING,
          "OmniFocus is not running"
        )
      );

      const result = await deletePerspective("My Work");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle null error in failure response with UNKNOWN_ERROR", async () => {
      mockRunOmniJS.mockResolvedValue({ success: false });

      const result = await deletePerspective("My Work");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

// ---------------------------------------------------------------------------
// Type-shape regression guard for OFPerspective.kind
// ---------------------------------------------------------------------------

describe("OFPerspective.kind field", () => {
  it("should accept builtin kind", () => {
    const p = createMockPerspective({ kind: "builtin" });
    expect(p.kind).toBe("builtin");
  });

  it("should accept custom kind", () => {
    const p = createMockPerspective({ kind: "custom" });
    expect(p.kind).toBe("custom");
  });

  it("listPerspectives result should include kind on each perspective", async () => {
    const mockData: OFPerspective[] = [
      { id: "Inbox", name: "Inbox", kind: "builtin" },
      { id: "abc", name: "My Work", kind: "custom" },
    ];
    mockRunOmniJS.mockResolvedValue(omniSuccess(mockData));

    const result = await listPerspectives();

    expect(result.data?.every((p) => p.kind === "builtin" || p.kind === "custom")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DeletePerspectiveResult type guard
// ---------------------------------------------------------------------------

describe("DeletePerspectiveResult shape", () => {
  it("should have the expected shape when success", () => {
    // This test guards the exported type shape via runtime usage
    const shape: DeletePerspectiveResult = {
      deleted: true,
      id: "abc",
      name: "My Work",
    };
    expect(shape.deleted).toBe(true);
    expect(shape.id).toBe("abc");
    expect(shape.name).toBe("My Work");
  });
});

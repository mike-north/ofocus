import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask, OFTaskWithChildren } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

// Use the partial-real mock pattern so that escapeJSString and other helpers
// run for real (the query layer uses them), while runOmniJSWrapped is
// intercepted.
vi.mock("../../../src/omnijs.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/omnijs.js")>(
    "../../../src/omnijs.js"
  );
  return {
    ...actual,
    runOmniJSWrapped: vi.fn(),
    toOmniJSDate: vi.fn((s: string) => `new Date("${s}")`),
  };
});

// Import after mocking
import {
  createSubtask,
  querySubtasks,
  moveTaskToParent,
  createSubtaskDescriptor,
  moveTaskToParentDescriptor,
  querySubtasksDescriptor,
} from "../../../src/commands/subtasks.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

// ── helpers ──────────────────────────────────────────────────────────────────

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

const createMockTaskWithChildren = (
  overrides: Partial<OFTaskWithChildren> = {}
): OFTaskWithChildren => ({
  ...createMockTask(),
  parentTaskId: "parent-123",
  parentTaskName: "Parent Task",
  childTaskCount: 0,
  isActionGroup: false,
  ...overrides,
});

const createMockListResult = (
  items: OFTask[],
  overrides: Partial<Extract<QueryResult<OFTask>, { kind: "list" }>> = {}
): Extract<QueryResult<OFTask>, { kind: "list" }> => ({
  kind: "list",
  items,
  totalCount: items.length,
  returnedCount: items.length,
  hasMore: false,
  offset: 0,
  limit: 100,
  ...overrides,
});

function expectList(
  result: QueryResult<OFTask> | null | undefined
): Extract<QueryResult<OFTask>, { kind: "list" }> {
  expect(result).toBeDefined();
  expect(result?.kind).toBe("list");
  if (!result || result.kind !== "list") throw new Error("Expected list shape");
  return result;
}

function getScriptBody(): string {
  const call = mockRunOmniJS.mock.calls[0];
  if (!call) throw new Error("runOmniJSWrapped was not called");
  return call[0] as string;
}

// ── createSubtask ─────────────────────────────────────────────────────────────

describe("createSubtask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("rejects empty parent task ID", async () => {
      const result = await createSubtask("New Subtask", "");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects invalid parent task ID format", async () => {
      const result = await createSubtask("New Subtask", 'parent"id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("rejects empty title", async () => {
      const result = await createSubtask("", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("title cannot be empty");
    });

    it("rejects whitespace-only title", async () => {
      const result = await createSubtask("   ", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects invalid due date", async () => {
      const result = await createSubtask("New Subtask", "parent-123", {
        due: 'bad"date',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("rejects invalid defer date", async () => {
      const result = await createSubtask("New Subtask", "parent-123", {
        defer: 'bad"date',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("rejects empty tags", async () => {
      const result = await createSubtask("New Subtask", "parent-123", {
        tags: ["valid", ""],
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects negative estimated minutes", async () => {
      const result = await createSubtask("New Subtask", "parent-123", {
        estimatedMinutes: -10,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("accepts valid subtask creation", async () => {
      const mockTask = createMockTaskWithChildren({ name: "New Subtask" });
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTask,
      } as OmniJSResult<OFTaskWithChildren>);

      const result = await createSubtask("New Subtask", "parent-123");

      expect(result.success).toBe(true);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful creation", () => {
    it("creates subtask with all options", async () => {
      const mockTask = createMockTaskWithChildren({
        name: "New Subtask",
        note: "Test note",
        flagged: true,
        tags: ["work"],
        estimatedMinutes: 30,
      });
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTask,
      } as OmniJSResult<OFTaskWithChildren>);

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
    it("handles parent task not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Parent task not found",
        },
      } as OmniJSResult<OFTaskWithChildren>);

      const result = await createSubtask("New Subtask", "nonexistent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("handles undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<OFTaskWithChildren>);

      const result = await createSubtask("New Subtask", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

// ── querySubtasks ─────────────────────────────────────────────────────────────

describe("querySubtasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("rejects empty parent task ID", async () => {
      const result = await querySubtasks("");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("rejects invalid parent task ID format", async () => {
      const result = await querySubtasks('parent"id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("rejects invalid limit", async () => {
      const result = await querySubtasks("parent-123", { limit: -1 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe("parentTaskId predicate", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("emits parentTaskId predicate scoped to the given parent ID", async () => {
      await querySubtasks("parent-abc");

      const body = getScriptBody();
      // parentTaskId predicate: (t.parent instanceof Task) && t.parent.id.primaryKey === "parent-abc"
      expect(body).toContain("(t.parent instanceof Task)");
      expect(body).toContain("parent-abc");
    });
  });

  describe("completed and flagged filters", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("completed: true → t.completed predicate", async () => {
      await querySubtasks("parent-123", { completed: true });

      expect(getScriptBody()).toContain("t.completed");
    });

    it("completed: false → !t.completed predicate", async () => {
      await querySubtasks("parent-123", { completed: false });

      expect(getScriptBody()).toContain("!t.completed");
    });

    it("flagged: true → t.flagged predicate", async () => {
      await querySubtasks("parent-123", { flagged: true });

      expect(getScriptBody()).toContain("t.flagged");
    });

    it("flagged: false → !t.flagged predicate", async () => {
      await querySubtasks("parent-123", { flagged: false });

      expect(getScriptBody()).toContain("!t.flagged");
    });
  });

  describe("return shape — QueryResult", () => {
    it("returns subtasks as a list result", async () => {
      const mockSubtasks = [
        createMockTask({ id: "subtask-1" }),
        createMockTask({ id: "subtask-2" }),
      ];
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult(mockSubtasks),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await querySubtasks("parent-123");

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toHaveLength(2);
    });

    it("returns empty list on undefined data", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await querySubtasks("parent-123");

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.items).toEqual([]);
    });

    it("supports count shape via count: true", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: { kind: "count", count: 5 },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await querySubtasks("parent-123", { count: true });

      expect(result.success).toBe(true);
      expect(result.data?.kind).toBe("count");
    });

    it("supports hasMore pagination in list result", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([createMockTask()], {
          totalCount: 50,
          hasMore: true,
          offset: 10,
          limit: 5,
          returnedCount: 1,
        }),
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await querySubtasks("parent-123", {
        offset: 10,
        limit: 5,
      });

      expect(result.success).toBe(true);
      const list = expectList(result.data);
      expect(list.offset).toBe(10);
      expect(list.hasMore).toBe(true);
    });
  });

  describe("sort and pagination are forwarded", () => {
    beforeEach(() => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: createMockListResult([]),
      } as OmniJSResult<QueryResult<OFTask>>);
    });

    it("respects limit option", async () => {
      await querySubtasks("parent-123", { limit: 25 });

      expect(getScriptBody()).toContain("var __limit = 25");
    });

    it("includes sort comparator when sort option is set", async () => {
      await querySubtasks("parent-123", { sort: ["name"] });

      expect(getScriptBody()).toContain("rows.sort(");
    });
  });

  describe("error handling", () => {
    it("propagates parent task not found error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Parent task not found",
        },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await querySubtasks("nonexistent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("falls back to UNKNOWN_ERROR when failure has no error object", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await querySubtasks("parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe("--all flag", () => {
    it("rejects all=true combined with limit", async () => {
      const result = await querySubtasks("parent-abc", { all: true, limit: 5 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error?.message).toContain("Cannot combine --all");
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("rejects all=true combined with offset", async () => {
      const result = await querySubtasks("parent-abc", {
        all: true,
        offset: 10,
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockRunOmniJS).not.toHaveBeenCalled();
    });

    it("accepts all=true with no limit or offset and emits full-scan body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: {
          kind: "list",
          items: [],
          totalCount: 0,
          returnedCount: 0,
          hasMore: false,
          offset: 0,
          limit: 0,
        },
      } as OmniJSResult<QueryResult<OFTask>>);

      const result = await querySubtasks("parent-abc", { all: true });

      expect(result.success).toBe(true);
      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("rows.map(__mapFn)");
      expect(body).not.toContain("__paged");
    });
  });
});

// ── querySubtasksDescriptor ───────────────────────────────────────────────────

describe("querySubtasksDescriptor — schema includes all flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schema accepts all: true", () => {
    const parsed = querySubtasksDescriptor.inputSchema.safeParse({
      parentTaskId: "abc123",
      all: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.all).toBe(true);
    }
  });

  it("handler rejects all=true combined with limit", async () => {
    const result = await querySubtasksDescriptor.handler({
      parentTaskId: "abc123",
      all: true,
      limit: 5,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("handler rejects all=true combined with offset", async () => {
    const result = await querySubtasksDescriptor.handler({
      parentTaskId: "abc123",
      all: true,
      offset: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });
});

// ── moveTaskToParent ──────────────────────────────────────────────────────────

describe("moveTaskToParent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("rejects empty task ID", async () => {
      const result = await moveTaskToParent("", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("rejects empty parent task ID", async () => {
      const result = await moveTaskToParent("task-123", "");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("rejects invalid task ID format", async () => {
      const result = await moveTaskToParent('task"id', "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });

    it("rejects invalid parent task ID format", async () => {
      const result = await moveTaskToParent("task-123", 'parent"id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    });
  });

  describe("successful move", () => {
    it("moves task to new parent", async () => {
      const mockTask = createMockTaskWithChildren({
        id: "task-123",
        parentTaskId: "new-parent-456",
      });
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockTask,
      } as OmniJSResult<OFTaskWithChildren>);

      const result = await moveTaskToParent("task-123", "new-parent-456");

      expect(result.success).toBe(true);
      expect(result.data?.parentTaskId).toBe("new-parent-456");
    });
  });

  describe("error handling", () => {
    it("handles task not found", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.TASK_NOT_FOUND,
          message: "Task not found",
        },
      } as OmniJSResult<OFTaskWithChildren>);

      const result = await moveTaskToParent("nonexistent", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it("handles undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<OFTaskWithChildren>);

      const result = await moveTaskToParent("task-123", "parent-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

// ── descriptor handlers ───────────────────────────────────────────────────────

// Regression: the MCP wrapper previously called
// createSubtask(params.parentTaskId, params.title, ...) — arguments swapped vs
// the SDK signature createSubtask(title, parentTaskId, ...). The centralized
// descriptor handler must map title → task name and parentTaskId → parent
// lookup, not the reverse. These tests assert the generated OmniJS body so a
// future re-introduction of the swap fails loudly.
describe("createSubtaskDescriptor.handler — argument order regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps title to the new Task name and parentTaskId to the parent lookup", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: createMockTaskWithChildren({ name: "My Subtask" }),
    } as OmniJSResult<OFTaskWithChildren>);

    await createSubtaskDescriptor.handler({
      title: "My Subtask",
      parentTaskId: "parent-xyz",
    });

    const body = getScriptBody();
    // title becomes the task name
    expect(body).toContain('new Task("My Subtask"');
    // parentTaskId is the lookup, not the title
    expect(body).toContain('Task.byIdentifier("parent-xyz")');
    // and crucially NOT the swapped form
    expect(body).not.toContain('new Task("parent-xyz"');
    expect(body).not.toContain('Task.byIdentifier("My Subtask")');
  });

  it("forwards optional fields to the SDK function", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: createMockTaskWithChildren({ name: "My Subtask", flagged: true }),
    } as OmniJSResult<OFTaskWithChildren>);

    await createSubtaskDescriptor.handler({
      title: "My Subtask",
      parentTaskId: "parent-xyz",
      note: "a note",
      flag: true,
      estimatedMinutes: 15,
    });

    const body = getScriptBody();
    expect(body).toContain('task.note = "a note"');
    expect(body).toContain("task.flagged = true");
    expect(body).toContain("task.estimatedMinutes = 15");
  });
});

describe("moveTaskToParentDescriptor.handler — argument order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps taskId to the moved task and parentTaskId to the destination", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: createMockTaskWithChildren({
        id: "task-abc",
        parentTaskId: "parent-def",
      }),
    } as OmniJSResult<OFTaskWithChildren>);

    await moveTaskToParentDescriptor.handler({
      taskId: "task-abc",
      parentTaskId: "parent-def",
    });

    const body = getScriptBody();
    // First byId lookup is the task being moved; second is the destination parent
    const taskIdx = body.indexOf('Task.byIdentifier("task-abc")');
    const parentIdx = body.indexOf('Task.byIdentifier("parent-def")');
    expect(taskIdx).toBeGreaterThanOrEqual(0);
    expect(parentIdx).toBeGreaterThanOrEqual(0);
    expect(taskIdx).toBeLessThan(parentIdx);
  });
});

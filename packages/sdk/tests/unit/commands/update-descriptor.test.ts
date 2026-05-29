import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask } from "../../../src/types.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/omnijs.js")>(
    "../../../src/omnijs.js"
  );
  return {
    ...actual,
    runOmniJSWrapped: vi.fn(),
  };
});

import { updateTaskDescriptor } from "../../../src/commands/update.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const TASK_ID = "abc123ABC-xyz789XYZ-12345678";

function getScriptBody(): string {
  const call = mockRunOmniJS.mock.calls[0];
  if (!call) throw new Error("runOmniJSWrapped was not called");
  return call[0] as string;
}

function makeTask(overrides: Partial<OFTask> = {}): OFTask {
  return {
    id: TASK_ID,
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
  };
}

function makeTaskResult(task: OFTask): OmniJSResult<OFTask> {
  return { success: true, data: task };
}

// ---------------------------------------------------------------------------
// updateTaskDescriptor — metadata
// ---------------------------------------------------------------------------

describe("updateTaskDescriptor — metadata", () => {
  it("has correct name, cliName, and mcpName", () => {
    expect(updateTaskDescriptor.name).toBe("updateTask");
    expect(updateTaskDescriptor.cliName).toBe("update");
    expect(updateTaskDescriptor.mcpName).toBe("task_update");
  });

  it("taskId is the only required cliPositional", () => {
    expect(updateTaskDescriptor.cliPositional).toEqual(["taskId"]);
  });

  it("schema requires taskId", () => {
    const parsed = updateTaskDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("schema accepts minimal input (taskId only)", () => {
    const parsed = updateTaskDescriptor.inputSchema.safeParse({
      taskId: TASK_ID,
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts all update fields", () => {
    const parsed = updateTaskDescriptor.inputSchema.safeParse({
      taskId: TASK_ID,
      title: "New title",
      note: "New note",
      due: "2024-12-31",
      defer: "2024-12-01",
      flag: true,
      project: "Work",
      tags: ["urgent", "waiting"],
      estimatedMinutes: 30,
      clearEstimate: false,
      clearRepeat: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts a repetition rule object", () => {
    const parsed = updateTaskDescriptor.inputSchema.safeParse({
      taskId: TASK_ID,
      repeat: {
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
        daysOfWeek: [1, 3, 5],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("schema rejects invalid repeat frequency", () => {
    const parsed = updateTaskDescriptor.inputSchema.safeParse({
      taskId: TASK_ID,
      repeat: {
        frequency: "hourly",
        interval: 1,
        repeatMethod: "due-again",
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("schema rejects invalid repeatMethod", () => {
    const parsed = updateTaskDescriptor.inputSchema.safeParse({
      taskId: TASK_ID,
      repeat: {
        frequency: "daily",
        interval: 1,
        repeatMethod: "invalid-method",
      },
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateTaskDescriptor — handler forwarding
// ---------------------------------------------------------------------------

describe("updateTaskDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes taskId into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(makeTaskResult(makeTask()));

    await updateTaskDescriptor.handler({ taskId: TASK_ID });

    const body = getScriptBody();
    expect(body).toContain(TASK_ID);
    expect(body).toContain("flattenedTasks");
  });

  it("passes title update into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(
      makeTaskResult(makeTask({ name: "New title" }))
    );

    await updateTaskDescriptor.handler({ taskId: TASK_ID, title: "New title" });

    const body = getScriptBody();
    expect(body).toContain("New title");
    expect(body).toContain("task.name");
  });

  it("passes note update into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(makeTaskResult(makeTask()));

    await updateTaskDescriptor.handler({
      taskId: TASK_ID,
      note: "Important note",
    });

    const body = getScriptBody();
    expect(body).toContain("Important note");
    expect(body).toContain("task.note");
  });

  it("passes flag=true into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(
      makeTaskResult(makeTask({ flagged: true }))
    );

    await updateTaskDescriptor.handler({ taskId: TASK_ID, flag: true });

    const body = getScriptBody();
    expect(body).toContain("task.flagged = true");
  });

  it("passes flag=false into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(
      makeTaskResult(makeTask({ flagged: false }))
    );

    await updateTaskDescriptor.handler({ taskId: TASK_ID, flag: false });

    const body = getScriptBody();
    expect(body).toContain("task.flagged = false");
  });

  it("passes project name into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(makeTaskResult(makeTask()));

    await updateTaskDescriptor.handler({
      taskId: TASK_ID,
      project: "Work Project",
    });

    const body = getScriptBody();
    expect(body).toContain("Work Project");
    expect(body).toContain("moveTasks");
  });

  it("passes tags array into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(
      makeTaskResult(makeTask({ tags: ["urgent"] }))
    );

    await updateTaskDescriptor.handler({
      taskId: TASK_ID,
      tags: ["urgent"],
    });

    const body = getScriptBody();
    expect(body).toContain("clearTags");
    expect(body).toContain("urgent");
  });

  it("passes estimatedMinutes into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(
      makeTaskResult(makeTask({ estimatedMinutes: 45 }))
    );

    await updateTaskDescriptor.handler({
      taskId: TASK_ID,
      estimatedMinutes: 45,
    });

    const body = getScriptBody();
    expect(body).toContain("45");
    expect(body).toContain("estimatedMinutes");
  });

  it("passes clearEstimate into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(makeTaskResult(makeTask()));

    await updateTaskDescriptor.handler({
      taskId: TASK_ID,
      clearEstimate: true,
    });

    const body = getScriptBody();
    expect(body).toContain("estimatedMinutes = null");
  });

  it("passes repeat rule into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(makeTaskResult(makeTask()));

    await updateTaskDescriptor.handler({
      taskId: TASK_ID,
      repeat: {
        frequency: "weekly",
        interval: 1,
        repeatMethod: "due-again",
      },
    });

    const body = getScriptBody();
    expect(body).toContain("RepetitionRule");
    expect(body).toContain("FREQ=WEEKLY");
  });

  it("passes clearRepeat into OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue(makeTaskResult(makeTask()));

    await updateTaskDescriptor.handler({
      taskId: TASK_ID,
      clearRepeat: true,
    });

    const body = getScriptBody();
    expect(body).toContain("repetitionRule = null");
  });

  it("returns the updated task on success", async () => {
    mockRunOmniJS.mockResolvedValue(
      makeTaskResult(makeTask({ name: "Updated" }))
    );

    const result = await updateTaskDescriptor.handler({
      taskId: TASK_ID,
      title: "Updated",
    });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Updated");
  });

  it("returns failure for invalid task ID", async () => {
    const result = await updateTaskDescriptor.handler({
      taskId: 'bad"id',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("returns failure when OmniJS fails", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: false,
      error: { code: ErrorCode.OMNIFOCUS_NOT_RUNNING, message: "Not running" },
    });

    const result = await updateTaskDescriptor.handler({ taskId: TASK_ID });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
  });
});

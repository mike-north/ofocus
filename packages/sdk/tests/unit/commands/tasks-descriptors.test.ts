import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

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

import { queryTasksDescriptor } from "../../../src/commands/tasks.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

function getScriptBody(): string {
  const call = mockRunOmniJS.mock.calls[0];
  if (!call) throw new Error("runOmniJSWrapped was not called");
  return call[0] as string;
}

function makeListResult(items: OFTask[]): OmniJSResult<QueryResult<OFTask>> {
  return {
    success: true,
    data: {
      kind: "list",
      items,
      totalCount: items.length,
      returnedCount: items.length,
      hasMore: false,
      offset: 0,
      limit: 100,
    },
  };
}

function makeTask(overrides: Partial<OFTask> = {}): OFTask {
  return {
    id: "abc123ABC-xyz789XYZ-12345678",
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

// ---------------------------------------------------------------------------
// queryTasksDescriptor — metadata
// ---------------------------------------------------------------------------

describe("queryTasksDescriptor — metadata", () => {
  it("has correct name, cliName, and mcpName", () => {
    expect(queryTasksDescriptor.name).toBe("queryTasks");
    expect(queryTasksDescriptor.cliName).toBe("tasks");
    expect(queryTasksDescriptor.mcpName).toBe("tasks_list");
  });

  it("has no cliPositional fields (all options are flags)", () => {
    expect(queryTasksDescriptor.cliPositional).toEqual([]);
  });

  it("schema accepts empty input (all fields optional)", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("schema accepts core filter fields", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      project: "Work",
      tag: "urgent",
      flagged: true,
      completed: false,
      available: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts extended boolean predicates", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      inInbox: true,
      hasDue: true,
      noDue: false,
      hasDefer: true,
      hasNote: false,
      hasAttachments: true,
      hasSubtasks: false,
      hasRepetition: true,
      effectivelyCompleted: false,
      effectivelyDropped: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts status enum values", () => {
    for (const s of ["active", "completed", "dropped", "deferred"] as const) {
      expect(
        queryTasksDescriptor.inputSchema.safeParse({ status: s }).success
      ).toBe(true);
    }
  });

  it("schema rejects invalid status value", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      status: "invalid",
    });
    expect(parsed.success).toBe(false);
  });

  it("schema accepts tagMode enum values", () => {
    for (const m of ["any", "all", "none"] as const) {
      expect(
        queryTasksDescriptor.inputSchema.safeParse({ tagMode: m }).success
      ).toBe(true);
    }
  });

  it("schema accepts date predicates", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      dueBefore: "2024-12-31",
      dueAfter: "2024-01-01",
      dueOn: "2024-06-15",
      dueWithin: "7d",
      deferBefore: "2024-12-31",
      deferAfter: "2024-01-01",
      completedBefore: "2024-12-31",
      completedAfter: "2024-01-01",
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts numeric predicates", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      estimateLt: 60,
      estimateGt: 15,
      estimateEq: 30,
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts string matching predicates", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      nameContains: "meeting",
      nameStarts: "Call",
      nameEquals: "Weekly review",
      nameRegex: "^Call.*",
      noteContains: "important",
      noteRegex: "urgent",
      caseSensitive: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts projection fields", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      fields: ["id", "name", "dueDate"],
      excludeFields: ["note"],
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts sort fields", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      sort: ["dueDate", "name"],
      reverse: true,
      nullsFirst: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts shape modifier: count", () => {
    expect(
      queryTasksDescriptor.inputSchema.safeParse({ count: true }).success
    ).toBe(true);
  });

  it("schema accepts shape modifier: first/last", () => {
    expect(
      queryTasksDescriptor.inputSchema.safeParse({ first: true }).success
    ).toBe(true);
    expect(
      queryTasksDescriptor.inputSchema.safeParse({ last: true }).success
    ).toBe(true);
  });

  it("schema accepts shape modifier: idsOnly and groupBy", () => {
    expect(
      queryTasksDescriptor.inputSchema.safeParse({ idsOnly: true }).success
    ).toBe(true);
    expect(
      queryTasksDescriptor.inputSchema.safeParse({ groupBy: "projectName" })
        .success
    ).toBe(true);
  });

  it("schema accepts pagination fields: limit, offset, all", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      limit: 50,
      offset: 10,
    });
    expect(parsed.success).toBe(true);

    const parsedAll = queryTasksDescriptor.inputSchema.safeParse({ all: true });
    expect(parsedAll.success).toBe(true);
  });

  it("schema accepts project as an array (multi-value)", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      project: ["Work", "Personal"],
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts tag as an array (multi-value)", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      tag: ["urgent", "waiting"],
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts folder filter", () => {
    const parsed = queryTasksDescriptor.inputSchema.safeParse({
      folder: "Work Area",
    });
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// queryTasksDescriptor — handler forwarding
// ---------------------------------------------------------------------------

describe("queryTasksDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards project filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeTask()]));

    await queryTasksDescriptor.handler({ project: "Work" });

    const body = getScriptBody();
    expect(body).toContain("flattenedTasks");
    expect(body).toContain('"Work"');
  });

  it("forwards tag filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([]));

    await queryTasksDescriptor.handler({ tag: "urgent" });

    const body = getScriptBody();
    expect(body).toContain('"urgent"');
  });

  it("forwards flagged filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([]));

    await queryTasksDescriptor.handler({ flagged: true });

    const body = getScriptBody();
    expect(body).toContain("t.flagged");
  });

  it("forwards available filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([]));

    await queryTasksDescriptor.handler({ available: true });

    const body = getScriptBody();
    // available: true compiles to "!t.completed && !t.effectivelyDropped && !t.blocked"
    expect(body).toContain("!t.completed");
    expect(body).toContain("!t.blocked");
  });

  it("forwards dueBefore filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([]));

    await queryTasksDescriptor.handler({ dueBefore: "2024-12-31" });

    const body = getScriptBody();
    expect(body).toContain("dueDate");
  });

  it("forwards dueAfter filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([]));

    await queryTasksDescriptor.handler({ dueAfter: "2024-01-01" });

    const body = getScriptBody();
    expect(body).toContain("dueDate");
  });

  it("forwards nameContains filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([]));

    await queryTasksDescriptor.handler({ nameContains: "meeting" });

    const body = getScriptBody();
    expect(body).toContain("meeting");
  });

  it("forwards count shape modifier", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { kind: "count", count: 5 },
    });

    const result = await queryTasksDescriptor.handler({ count: true });

    const body = getScriptBody();
    expect(body).toContain("count");
    expect(result.success).toBe(true);
    expect(result.data?.kind).toBe("count");
  });

  it("forwards groupBy into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { kind: "groups", groups: [], totalCount: 0 },
    });

    // "project" is a valid groupBy key (maps to containingProject.name)
    await queryTasksDescriptor.handler({ groupBy: "project" });

    const body = getScriptBody();
    expect(body).toContain("containingProject");
  });

  it("forwards sort fields into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([]));

    await queryTasksDescriptor.handler({ sort: ["dueDate"] });

    const body = getScriptBody();
    expect(body).toContain("dueDate");
  });

  it("returns list result on success", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeTask()]));

    const result = await queryTasksDescriptor.handler({});

    expect(result.success).toBe(true);
    expect(result.data?.kind).toBe("list");
  });

  it("returns failure when OmniJS fails", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: false,
      error: { code: ErrorCode.OMNIFOCUS_NOT_RUNNING, message: "Not running" },
    });

    const result = await queryTasksDescriptor.handler({});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
  });

  it("rejects all=true combined with limit", async () => {
    const result = await queryTasksDescriptor.handler({ all: true, limit: 5 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("rejects all=true combined with offset", async () => {
    const result = await queryTasksDescriptor.handler({
      all: true,
      offset: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("accepts all=true and emits full-scan body without slice", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeTask()]));

    await queryTasksDescriptor.handler({ all: true });

    const body = getScriptBody();
    expect(body).toContain("rows.map(__mapFn)");
    expect(body).not.toContain("__paged");
  });
});

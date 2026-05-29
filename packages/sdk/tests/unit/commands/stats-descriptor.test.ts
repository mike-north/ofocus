import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTask, OFProject } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";

// Mock the omnijs module (getStats calls queryTasks and queryProjects internally)
vi.mock("../../../src/omnijs.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/omnijs.js")>(
    "../../../src/omnijs.js"
  );
  return {
    ...actual,
    runOmniJSWrapped: vi.fn(),
  };
});

import { getStatsDescriptor } from "../../../src/commands/stats.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

function makeTaskListResult(
  items: OFTask[]
): OmniJSResult<QueryResult<OFTask>> {
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

function makeProjectListResult(
  items: OFProject[]
): OmniJSResult<QueryResult<OFProject>> {
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
    id: "task-id-1",
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

function makeProject(overrides: Partial<OFProject> = {}): OFProject {
  return {
    id: "proj-id-1",
    name: "Test Project",
    note: null,
    status: "active",
    sequential: false,
    folderId: null,
    folderName: null,
    taskCount: 0,
    remainingTaskCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getStatsDescriptor — metadata
// ---------------------------------------------------------------------------

describe("getStatsDescriptor — metadata", () => {
  it("has correct name, cliName, and mcpName", () => {
    expect(getStatsDescriptor.name).toBe("getStats");
    expect(getStatsDescriptor.cliName).toBe("stats");
    expect(getStatsDescriptor.mcpName).toBe("stats");
  });

  it("has no cliPositional fields (all options are flags)", () => {
    expect(getStatsDescriptor.cliPositional).toEqual([]);
  });

  it("schema accepts empty input (all fields optional)", () => {
    const parsed = getStatsDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("schema accepts all valid period values", () => {
    for (const p of ["day", "week", "month", "year"] as const) {
      expect(
        getStatsDescriptor.inputSchema.safeParse({ period: p }).success
      ).toBe(true);
    }
  });

  it("schema rejects invalid period value", () => {
    const parsed = getStatsDescriptor.inputSchema.safeParse({
      period: "decade",
    });
    expect(parsed.success).toBe(false);
  });

  it("schema accepts project filter", () => {
    const parsed = getStatsDescriptor.inputSchema.safeParse({
      project: "Work",
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts date range (since/until)", () => {
    const parsed = getStatsDescriptor.inputSchema.safeParse({
      since: "2024-01-01",
      until: "2024-12-31",
    });
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getStatsDescriptor — handler forwarding
// ---------------------------------------------------------------------------

describe("getStatsDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a stats result with the expected shape on success", async () => {
    // getStats calls queryTasks twice and queryProjects once
    mockRunOmniJS
      .mockResolvedValueOnce(
        makeTaskListResult([makeTask({ completed: true })])
      )
      .mockResolvedValueOnce(
        makeTaskListResult([makeTask({ available: true })])
      )
      .mockResolvedValueOnce(
        makeProjectListResult([makeProject({ status: "active" })])
      );

    const result = await getStatsDescriptor.handler({});

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("periodStart");
    expect(result.data).toHaveProperty("periodEnd");
    expect(result.data).toHaveProperty("tasksCompleted");
    expect(result.data).toHaveProperty("tasksOverdue");
    expect(result.data).toHaveProperty("tasksAvailable");
    expect(result.data).toHaveProperty("projectsActive");
    expect(result.data).toHaveProperty("projectsOnHold");
  });

  it("accepts and forwards the period option", async () => {
    mockRunOmniJS
      .mockResolvedValueOnce(makeTaskListResult([]))
      .mockResolvedValueOnce(makeTaskListResult([]))
      .mockResolvedValueOnce(makeProjectListResult([]));

    const result = await getStatsDescriptor.handler({ period: "week" });

    expect(result.success).toBe(true);
    // period affects periodStart calculation but the result structure remains the same
    expect(result.data?.periodStart).toBeDefined();
  });

  it("accepts and forwards the project filter", async () => {
    mockRunOmniJS
      .mockResolvedValueOnce(makeTaskListResult([]))
      .mockResolvedValueOnce(makeTaskListResult([]))
      .mockResolvedValueOnce(makeProjectListResult([]));

    const result = await getStatsDescriptor.handler({ project: "Work" });

    expect(result.success).toBe(true);
    expect(result.data?.projectFilter).toBe("Work");
  });

  it("returns projectFilter as null when no project is set", async () => {
    mockRunOmniJS
      .mockResolvedValueOnce(makeTaskListResult([]))
      .mockResolvedValueOnce(makeTaskListResult([]))
      .mockResolvedValueOnce(makeProjectListResult([]));

    const result = await getStatsDescriptor.handler({});

    expect(result.success).toBe(true);
    expect(result.data?.projectFilter).toBeNull();
  });

  it("returns failure for since date containing injection characters", async () => {
    // validateDateString rejects strings with quotes (injection prevention)
    const result = await getStatsDescriptor.handler({
      since: '2024-01-01"',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("returns failure for until date containing injection characters", async () => {
    const result = await getStatsDescriptor.handler({
      until: '2024-12-31"',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });
});

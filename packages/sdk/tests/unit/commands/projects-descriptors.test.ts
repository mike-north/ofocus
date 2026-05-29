import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFProject } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";
import type {
  DeleteProjectResult,
  DropProjectResult,
} from "../../../src/commands/projects-crud.js";

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

import { listProjectsDescriptor } from "../../../src/commands/projects.js";
import { createProjectDescriptor as cpDesc } from "../../../src/commands/create-project.js";
import {
  updateProjectDescriptor as upDesc,
  deleteProjectDescriptor as dpDesc,
  dropProjectDescriptor as drpDesc,
} from "../../../src/commands/projects-crud.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const PROJ_ID = "abc123ABC-xyz789XYZ-12345678";

function getScriptBody(): string {
  const call = mockRunOmniJS.mock.calls[0];
  if (!call) throw new Error("runOmniJSWrapped was not called");
  return call[0] as string;
}

function makeListResult(
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

function makeProject(overrides: Partial<OFProject> = {}): OFProject {
  return {
    id: PROJ_ID,
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
// listProjectsDescriptor
// ---------------------------------------------------------------------------

describe("listProjectsDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(listProjectsDescriptor.name).toBe("listProjects");
    expect(listProjectsDescriptor.cliName).toBe("projects");
    expect(listProjectsDescriptor.mcpName).toBe("projects_list");
  });

  it("has no cliPositional fields", () => {
    expect(listProjectsDescriptor.cliPositional).toEqual([]);
  });

  it("schema accepts empty input (all fields optional)", () => {
    const parsed = listProjectsDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("schema rejects invalid status value", () => {
    const parsed = listProjectsDescriptor.inputSchema.safeParse({
      status: "invalid-status",
    });
    expect(parsed.success).toBe(false);
  });

  it("schema accepts all: true", () => {
    const parsed = listProjectsDescriptor.inputSchema.safeParse({ all: true });
    expect(parsed.success).toBe(true);
  });

  it("'all' is in the input schema shape", () => {
    const schema = listProjectsDescriptor.inputSchema;
    const parsed = schema.safeParse({ all: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.all).toBe(true);
    }
  });
});

describe("listProjectsDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards folder filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeProject()]));

    await listProjectsDescriptor.handler({ folder: "Work" });

    const body = getScriptBody();
    expect(body).toContain("flattenedProjects");
    expect(body).toContain('"Work"');
  });

  it("forwards status filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([]));

    await listProjectsDescriptor.handler({ status: "on-hold" });

    const body = getScriptBody();
    expect(body).toContain("Project.Status.OnHold");
  });

  it("forwards sequential filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([]));

    await listProjectsDescriptor.handler({ sequential: true });

    const body = getScriptBody();
    expect(body).toContain("t.sequential");
  });

  it("returns list result on success", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeProject()]));

    const result = await listProjectsDescriptor.handler({});

    expect(result.success).toBe(true);
    expect(result.data?.kind).toBe("list");
  });

  it("returns failure when OmniJS fails", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: false,
      error: { code: ErrorCode.OMNIFOCUS_NOT_RUNNING, message: "Not running" },
    });

    const result = await listProjectsDescriptor.handler({});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
  });

  it("rejects all=true combined with limit", async () => {
    const result = await listProjectsDescriptor.handler({
      all: true,
      limit: 5,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("rejects all=true combined with offset", async () => {
    const result = await listProjectsDescriptor.handler({
      all: true,
      offset: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("accepts all=true and emits full-scan body without slice", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeProject()]));

    await listProjectsDescriptor.handler({ all: true });

    const body = getScriptBody();
    expect(body).toContain("rows.map(__mapFn)");
    expect(body).not.toContain("__paged");
  });
});

// ---------------------------------------------------------------------------
// createProjectDescriptor
// ---------------------------------------------------------------------------

describe("createProjectDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(cpDesc.name).toBe("createProject");
    expect(cpDesc.cliName).toBe("create-project");
    expect(cpDesc.mcpName).toBe("project_create");
  });

  it("name is a required cliPositional", () => {
    expect(cpDesc.cliPositional).toEqual(["name"]);
  });

  it("schema rejects empty name", () => {
    // name is required (not optional)
    const parsed = cpDesc.inputSchema.safeParse({ name: undefined });
    expect(parsed.success).toBe(false);
  });

  it("schema accepts minimal input (name only)", () => {
    const parsed = cpDesc.inputSchema.safeParse({ name: "My Project" });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts active and on-hold status only", () => {
    expect(
      cpDesc.inputSchema.safeParse({ name: "p", status: "active" }).success
    ).toBe(true);
    expect(
      cpDesc.inputSchema.safeParse({ name: "p", status: "on-hold" }).success
    ).toBe(true);
    expect(
      cpDesc.inputSchema.safeParse({ name: "p", status: "dropped" }).success
    ).toBe(false);
  });
});

describe("createProjectDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes name to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: makeProject({ name: "My Project" }),
    });

    await cpDesc.handler({ name: "My Project" });

    const body = getScriptBody();
    expect(body).toContain("My Project");
  });

  it("passes folderName and sequential to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: makeProject(),
    });

    await cpDesc.handler({ name: "P", folderName: "Work", sequential: true });

    const body = getScriptBody();
    expect(body).toContain("Work");
    expect(body).toContain("true");
  });

  it("returns failure for empty name", async () => {
    const result = await cpDesc.handler({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
  });
});

// ---------------------------------------------------------------------------
// updateProjectDescriptor
// ---------------------------------------------------------------------------

describe("updateProjectDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(upDesc.name).toBe("updateProject");
    expect(upDesc.cliName).toBe("update-project");
    expect(upDesc.mcpName).toBe("project_update");
  });

  it("projectId is a required cliPositional", () => {
    expect(upDesc.cliPositional).toEqual(["projectId"]);
  });

  it("schema requires projectId", () => {
    const parsed = upDesc.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("schema accepts all status values", () => {
    for (const s of ["active", "on-hold", "completed", "dropped"] as const) {
      expect(
        upDesc.inputSchema.safeParse({ projectId: PROJ_ID, status: s }).success
      ).toBe(true);
    }
  });
});

describe("updateProjectDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes projectId and name to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: makeProject() });

    await upDesc.handler({ projectId: PROJ_ID, name: "Renamed" });

    const body = getScriptBody();
    expect(body).toContain(PROJ_ID);
    expect(body).toContain("Renamed");
  });

  it("passes status change to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: makeProject() });

    await upDesc.handler({ projectId: PROJ_ID, status: "on-hold" });

    const body = getScriptBody();
    expect(body).toContain("Project.Status.OnHold");
  });

  it("returns failure for invalid project ID", async () => {
    const result = await upDesc.handler({ projectId: 'bad"id' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// deleteProjectDescriptor
// ---------------------------------------------------------------------------

describe("deleteProjectDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(dpDesc.name).toBe("deleteProject");
    expect(dpDesc.cliName).toBe("delete-project");
    expect(dpDesc.mcpName).toBe("project_delete");
  });

  it("projectId is a required cliPositional", () => {
    expect(dpDesc.cliPositional).toEqual(["projectId"]);
  });
});

describe("deleteProjectDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes projectId to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { projectId: PROJ_ID, deleted: true } as DeleteProjectResult,
    });

    await dpDesc.handler({ projectId: PROJ_ID });

    const body = getScriptBody();
    expect(body).toContain(PROJ_ID);
    expect(body).toContain("deleteObject");
  });

  it("returns failure for invalid project ID", async () => {
    const result = await dpDesc.handler({ projectId: 'bad"id' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// dropProjectDescriptor
// ---------------------------------------------------------------------------

describe("dropProjectDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(drpDesc.name).toBe("dropProject");
    expect(drpDesc.cliName).toBe("drop-project");
    expect(drpDesc.mcpName).toBe("project_drop");
  });

  it("projectId is a required cliPositional", () => {
    expect(drpDesc.cliPositional).toEqual(["projectId"]);
  });

  it("schema requires projectId", () => {
    const parsed = drpDesc.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("schema accepts valid projectId", () => {
    const parsed = drpDesc.inputSchema.safeParse({ projectId: PROJ_ID });
    expect(parsed.success).toBe(true);
  });
});

describe("dropProjectDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes projectId to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: {
        projectId: PROJ_ID,
        projectName: "Test Project",
        dropped: true,
      } as DropProjectResult,
    });

    await drpDesc.handler({ projectId: PROJ_ID });

    const body = getScriptBody();
    expect(body).toContain(PROJ_ID);
    expect(body).toContain("markDropped");
  });

  it("returns success with drop result", async () => {
    const dropResult: DropProjectResult = {
      projectId: PROJ_ID,
      projectName: "Test Project",
      dropped: true,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: dropResult });

    const result = await drpDesc.handler({ projectId: PROJ_ID });

    expect(result.success).toBe(true);
    expect(result.data?.dropped).toBe(true);
  });

  it("returns failure for invalid project ID", async () => {
    const result = await drpDesc.handler({ projectId: 'bad"id' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });
});

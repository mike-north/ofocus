import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFFolder } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";
import type { DeleteFolderResult } from "../../../src/commands/folders-crud.js";

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

import {
  listFoldersDescriptor,
  createFolderDescriptor,
} from "../../../src/commands/folders.js";
import {
  updateFolderDescriptor,
  deleteFolderDescriptor,
} from "../../../src/commands/folders-crud.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const FOLDER_ID = "abc123ABC-xyz789XYZ-12345678";

function getScriptBody(): string {
  const call = mockRunOmniJS.mock.calls[0];
  if (!call) throw new Error("runOmniJSWrapped was not called");
  return call[0] as string;
}

function makeFolder(overrides: Partial<OFFolder> = {}): OFFolder {
  return {
    id: FOLDER_ID,
    name: "Test Folder",
    parentId: null,
    parentName: null,
    projectCount: 0,
    folderCount: 0,
    ...overrides,
  };
}

function makeListResult(
  items: OFFolder[]
): OmniJSResult<QueryResult<OFFolder>> {
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

// ---------------------------------------------------------------------------
// listFoldersDescriptor
// ---------------------------------------------------------------------------

describe("listFoldersDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(listFoldersDescriptor.name).toBe("listFolders");
    expect(listFoldersDescriptor.cliName).toBe("folders");
    expect(listFoldersDescriptor.mcpName).toBe("folders_list");
  });

  it("has no cliPositional fields", () => {
    expect(listFoldersDescriptor.cliPositional).toEqual([]);
  });

  it("schema accepts empty input (all fields optional)", () => {
    const parsed = listFoldersDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("schema accepts all: true", () => {
    const parsed = listFoldersDescriptor.inputSchema.safeParse({ all: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.all).toBe(true);
    }
  });
});

describe("listFoldersDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards parent filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeFolder()]));

    await listFoldersDescriptor.handler({ parent: "Work" });

    const body = getScriptBody();
    expect(body).toContain("flattenedFolders");
    expect(body).toContain('"Work"');
  });

  it("returns list result on success", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeFolder()]));

    const result = await listFoldersDescriptor.handler({});

    expect(result.success).toBe(true);
    expect(result.data?.kind).toBe("list");
  });

  it("returns failure when OmniJS fails", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: false,
      error: { code: ErrorCode.OMNIFOCUS_NOT_RUNNING, message: "Not running" },
    });

    const result = await listFoldersDescriptor.handler({});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
  });

  it("rejects all=true combined with limit", async () => {
    const result = await listFoldersDescriptor.handler({ all: true, limit: 5 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("rejects all=true combined with offset", async () => {
    const result = await listFoldersDescriptor.handler({
      all: true,
      offset: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockRunOmniJS).not.toHaveBeenCalled();
  });

  it("accepts all=true and emits full-scan body without slice", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeFolder()]));

    await listFoldersDescriptor.handler({ all: true });

    const body = getScriptBody();
    expect(body).toContain("rows.map(__mapFn)");
    expect(body).not.toContain("__paged");
  });
});

// ---------------------------------------------------------------------------
// createFolderDescriptor
// ---------------------------------------------------------------------------

describe("createFolderDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(createFolderDescriptor.name).toBe("createFolder");
    expect(createFolderDescriptor.cliName).toBe("create-folder");
    expect(createFolderDescriptor.mcpName).toBe("folder_create");
  });

  it("name is a required cliPositional", () => {
    expect(createFolderDescriptor.cliPositional).toEqual(["name"]);
  });

  it("schema requires name", () => {
    const parsed = createFolderDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("schema accepts name with optional parent fields", () => {
    const parsed = createFolderDescriptor.inputSchema.safeParse({
      name: "Work",
      parentFolderName: "Root",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("createFolderDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes name to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: makeFolder() });

    await createFolderDescriptor.handler({ name: "Work" });

    const body = getScriptBody();
    expect(body).toContain("Work");
    expect(body).toContain("new Folder");
  });

  it("passes parentFolderName to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: makeFolder() });

    await createFolderDescriptor.handler({
      name: "Sub",
      parentFolderName: "Parent",
    });

    const body = getScriptBody();
    expect(body).toContain("Parent");
  });

  it("returns failure for empty name", async () => {
    const result = await createFolderDescriptor.handler({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
  });
});

// ---------------------------------------------------------------------------
// updateFolderDescriptor
// ---------------------------------------------------------------------------

describe("updateFolderDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(updateFolderDescriptor.name).toBe("updateFolder");
    expect(updateFolderDescriptor.cliName).toBe("update-folder");
    expect(updateFolderDescriptor.mcpName).toBe("folder_update");
  });

  it("folderId is a required cliPositional", () => {
    expect(updateFolderDescriptor.cliPositional).toEqual(["folderId"]);
  });

  it("schema requires folderId", () => {
    const parsed = updateFolderDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});

describe("updateFolderDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes folderId and name to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: makeFolder() });

    await updateFolderDescriptor.handler({
      folderId: FOLDER_ID,
      name: "Renamed",
    });

    const body = getScriptBody();
    expect(body).toContain(FOLDER_ID);
    expect(body).toContain("Renamed");
  });

  it("returns failure for invalid folder ID", async () => {
    const result = await updateFolderDescriptor.handler({ folderId: 'bad"id' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// deleteFolderDescriptor
// ---------------------------------------------------------------------------

describe("deleteFolderDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(deleteFolderDescriptor.name).toBe("deleteFolder");
    expect(deleteFolderDescriptor.cliName).toBe("delete-folder");
    expect(deleteFolderDescriptor.mcpName).toBe("folder_delete");
  });

  it("folderId is a required cliPositional", () => {
    expect(deleteFolderDescriptor.cliPositional).toEqual(["folderId"]);
  });
});

describe("deleteFolderDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes folderId to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { folderId: FOLDER_ID, deleted: true } as DeleteFolderResult,
    });

    await deleteFolderDescriptor.handler({ folderId: FOLDER_ID });

    const body = getScriptBody();
    expect(body).toContain(FOLDER_ID);
    expect(body).toContain("deleteObject");
  });

  it("returns failure for invalid folder ID", async () => {
    const result = await deleteFolderDescriptor.handler({ folderId: 'bad"id' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

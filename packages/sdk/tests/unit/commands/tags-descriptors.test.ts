import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { OFTag } from "../../../src/types.js";
import type { QueryResult } from "../../../src/query/index.js";
import type { DeleteTagResult } from "../../../src/commands/tags-crud.js";

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

import { listTagsDescriptor } from "../../../src/commands/tags.js";
import {
  createTagDescriptor,
  updateTagDescriptor,
  deleteTagDescriptor,
} from "../../../src/commands/tags-crud.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const TAG_ID = "abc123ABC-xyz789XYZ-12345678";

function getScriptBody(): string {
  const call = mockRunOmniJS.mock.calls[0];
  if (!call) throw new Error("runOmniJSWrapped was not called");
  return call[0] as string;
}

function makeTag(overrides: Partial<OFTag> = {}): OFTag {
  return {
    id: TAG_ID,
    name: "Test Tag",
    parentId: null,
    parentName: null,
    availableTaskCount: 0,
    ...overrides,
  };
}

function makeListResult(items: OFTag[]): OmniJSResult<QueryResult<OFTag>> {
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
// listTagsDescriptor
// ---------------------------------------------------------------------------

describe("listTagsDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(listTagsDescriptor.name).toBe("listTags");
    expect(listTagsDescriptor.cliName).toBe("tags");
    expect(listTagsDescriptor.mcpName).toBe("tags_list");
  });

  it("has no cliPositional fields", () => {
    expect(listTagsDescriptor.cliPositional).toEqual([]);
  });

  it("schema accepts empty input (all fields optional)", () => {
    const parsed = listTagsDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });
});

describe("listTagsDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards parent filter into OmniJS query body", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeTag()]));

    await listTagsDescriptor.handler({ parent: "Work" });

    const body = getScriptBody();
    expect(body).toContain("flattenedTags");
    expect(body).toContain('"Work"');
  });

  it("returns list result on success", async () => {
    mockRunOmniJS.mockResolvedValue(makeListResult([makeTag()]));

    const result = await listTagsDescriptor.handler({});

    expect(result.success).toBe(true);
    expect(result.data?.kind).toBe("list");
  });

  it("returns failure when OmniJS fails", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: false,
      error: { code: ErrorCode.OMNIFOCUS_NOT_RUNNING, message: "Not running" },
    });

    const result = await listTagsDescriptor.handler({});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
  });
});

// ---------------------------------------------------------------------------
// createTagDescriptor
// ---------------------------------------------------------------------------

describe("createTagDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(createTagDescriptor.name).toBe("createTag");
    expect(createTagDescriptor.cliName).toBe("create-tag");
    expect(createTagDescriptor.mcpName).toBe("tag_create");
  });

  it("name is a required cliPositional", () => {
    expect(createTagDescriptor.cliPositional).toEqual(["name"]);
  });

  it("schema requires name", () => {
    const parsed = createTagDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("schema accepts name with optional parent fields", () => {
    const parsed = createTagDescriptor.inputSchema.safeParse({
      name: "Work",
      parentTagName: "Root",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("createTagDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes name to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: makeTag() });

    await createTagDescriptor.handler({ name: "Work" });

    const body = getScriptBody();
    expect(body).toContain("Work");
    expect(body).toContain("new Tag");
  });

  it("passes parentTagName to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: makeTag() });

    await createTagDescriptor.handler({ name: "Sub", parentTagName: "Parent" });

    const body = getScriptBody();
    expect(body).toContain("Parent");
  });

  it("returns failure for invalid tag name", async () => {
    // Empty name triggers validation error
    const result = await createTagDescriptor.handler({ name: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateTagDescriptor
// ---------------------------------------------------------------------------

describe("updateTagDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(updateTagDescriptor.name).toBe("updateTag");
    expect(updateTagDescriptor.cliName).toBe("update-tag");
    expect(updateTagDescriptor.mcpName).toBe("tag_update");
  });

  it("tagId is a required cliPositional", () => {
    expect(updateTagDescriptor.cliPositional).toEqual(["tagId"]);
  });

  it("schema requires tagId", () => {
    const parsed = updateTagDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});

describe("updateTagDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes tagId and name to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: makeTag() });

    await updateTagDescriptor.handler({ tagId: TAG_ID, name: "Renamed" });

    const body = getScriptBody();
    expect(body).toContain(TAG_ID);
    expect(body).toContain("Renamed");
  });

  it("returns failure for invalid tag ID", async () => {
    const result = await updateTagDescriptor.handler({ tagId: 'bad"id' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// deleteTagDescriptor
// ---------------------------------------------------------------------------

describe("deleteTagDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(deleteTagDescriptor.name).toBe("deleteTag");
    expect(deleteTagDescriptor.cliName).toBe("delete-tag");
    expect(deleteTagDescriptor.mcpName).toBe("tag_delete");
  });

  it("tagId is a required cliPositional", () => {
    expect(deleteTagDescriptor.cliPositional).toEqual(["tagId"]);
  });
});

describe("deleteTagDescriptor — handler forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes tagId to OmniJS script body", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { tagId: TAG_ID, deleted: true } as DeleteTagResult,
    });

    await deleteTagDescriptor.handler({ tagId: TAG_ID });

    const body = getScriptBody();
    expect(body).toContain(TAG_ID);
    expect(body).toContain("deleteObject");
  });

  it("returns failure for invalid tag ID", async () => {
    const result = await deleteTagDescriptor.handler({ tagId: 'bad"id' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

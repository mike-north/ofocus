import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type {
  OFPerspective,
  OFTask,
  OFProject,
  ReviewResult,
} from "../../../src/types.js";
import type { ReviewIntervalResult } from "../../../src/commands/review.js";
import type { FocusResult } from "../../../src/commands/focus.js";
import type { SyncStatus, SyncResult } from "../../../src/commands/sync.js";
import type {
  ArchiveResult,
  CompactResult,
} from "../../../src/commands/archive.js";
import type {
  AddAttachmentResult,
  ListAttachmentsResult,
  RemoveAttachmentResult,
} from "../../../src/commands/attachments.js";
import type {
  TaskPaperExportResult,
  TaskPaperImportResult,
} from "../../../src/commands/taskpaper.js";
import type { OpenResult } from "../../../src/commands/open.js";
import type { UrlResult } from "../../../src/commands/url.js";

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

// Mock node:fs for attachments / templates
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isFile: () => true })),
  readFileSync: vi.fn(() => Buffer.from("filedata")),
}));

import {
  listPerspectivesDescriptor,
  queryPerspectiveDescriptor,
} from "../../../src/commands/perspectives.js";
import {
  reviewProjectDescriptor,
  queryProjectsForReviewDescriptor,
  getReviewIntervalDescriptor,
  setReviewIntervalDescriptor,
} from "../../../src/commands/review.js";
import {
  focusOnDescriptor,
  unfocusDescriptor,
  getFocusedDescriptor,
} from "../../../src/commands/focus.js";
import {
  getSyncStatusDescriptor,
  triggerSyncDescriptor,
} from "../../../src/commands/sync.js";
import {
  archiveTasksDescriptor,
  compactDatabaseDescriptor,
} from "../../../src/commands/archive.js";
import {
  addAttachmentDescriptor,
  listAttachmentsDescriptor,
  removeAttachmentDescriptor,
} from "../../../src/commands/attachments.js";
import {
  exportTaskPaperDescriptor,
  importTaskPaperDescriptor,
} from "../../../src/commands/taskpaper.js";
import { openItemDescriptor } from "../../../src/commands/open.js";
import { generateUrlDescriptor } from "../../../src/commands/url.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

const PROJ_ID = "abc123ABC-xyz789XYZ-12345678";
const TASK_ID = "tsk123ABC-xyz789XYZ-12345678";

function getScriptBody(): string {
  const call = mockRunOmniJS.mock.calls[0];
  if (!call) throw new Error("runOmniJSWrapped was not called");
  return call[0] as string;
}

// ---------------------------------------------------------------------------
// listPerspectivesDescriptor
// ---------------------------------------------------------------------------

describe("listPerspectivesDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(listPerspectivesDescriptor.name).toBe("listPerspectives");
    expect(listPerspectivesDescriptor.cliName).toBe("perspectives");
    expect(listPerspectivesDescriptor.mcpName).toBe("perspectives_list");
  });

  it("has no cliPositional fields", () => {
    expect(listPerspectivesDescriptor.cliPositional).toEqual([]);
  });

  it("schema accepts empty input", () => {
    const parsed = listPerspectivesDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });
});

describe("listPerspectivesDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries built-in and custom perspectives", async () => {
    const perspectives: OFPerspective[] = [
      { id: "Inbox", name: "Inbox", kind: "builtin" },
      { id: "custom-uuid", name: "Work", kind: "custom" },
    ];
    mockRunOmniJS.mockResolvedValue({ success: true, data: perspectives });

    const result = await listPerspectivesDescriptor.handler({});

    expect(result.success).toBe(true);
    const body = getScriptBody();
    expect(body).toContain("Perspective.BuiltIn.all");
    expect(body).toContain("Perspective.Custom.all");
  });

  it("returns empty array when no perspectives", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: [] });
    const result = await listPerspectivesDescriptor.handler({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns failure when OmniJS fails", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: false,
      error: { code: ErrorCode.OMNIFOCUS_NOT_RUNNING, message: "Not running" },
    });
    const result = await listPerspectivesDescriptor.handler({});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
  });
});

// ---------------------------------------------------------------------------
// queryPerspectiveDescriptor
// ---------------------------------------------------------------------------

describe("queryPerspectiveDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(queryPerspectiveDescriptor.name).toBe("queryPerspective");
    expect(queryPerspectiveDescriptor.cliName).toBe("perspective");
    expect(queryPerspectiveDescriptor.mcpName).toBe("perspective_query");
  });

  it("name is a required cliPositional", () => {
    expect(queryPerspectiveDescriptor.cliPositional).toEqual(["name"]);
  });

  it("schema requires name", () => {
    const parsed = queryPerspectiveDescriptor.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("schema accepts name with optional limit", () => {
    const parsed = queryPerspectiveDescriptor.inputSchema.safeParse({
      name: "Inbox",
      limit: 50,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("queryPerspectiveDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes perspective name to OmniJS script", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: [] as OFTask[] });
    await queryPerspectiveDescriptor.handler({ name: "Work" });
    const body = getScriptBody();
    expect(body).toContain('"Work"');
  });

  it("passes limit to OmniJS script", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: [] as OFTask[] });
    await queryPerspectiveDescriptor.handler({ name: "Inbox", limit: 20 });
    const body = getScriptBody();
    expect(body).toContain("20");
  });

  it("returns failure for unknown perspective", async () => {
    mockRunOmniJS.mockResolvedValue({
      success: true,
      data: { __not_found: true, name: "Unknown" },
    } as unknown as OmniJSResult<OFTask[]>);
    const result = await queryPerspectiveDescriptor.handler({
      name: "Unknown",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.PERSPECTIVE_NOT_FOUND);
  });
});

// ---------------------------------------------------------------------------
// reviewProjectDescriptor
// ---------------------------------------------------------------------------

describe("reviewProjectDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(reviewProjectDescriptor.name).toBe("reviewProject");
    expect(reviewProjectDescriptor.cliName).toBe("review");
    expect(reviewProjectDescriptor.mcpName).toBe("project_review");
  });

  it("projectId is a required cliPositional", () => {
    expect(reviewProjectDescriptor.cliPositional).toEqual(["projectId"]);
  });

  it("schema requires projectId", () => {
    expect(reviewProjectDescriptor.inputSchema.safeParse({}).success).toBe(
      false
    );
  });
});

describe("reviewProjectDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes projectId to OmniJS script", async () => {
    const reviewResult: ReviewResult = {
      projectId: PROJ_ID,
      projectName: "My Project",
      lastReviewed: "2024-01-01T00:00:00.000Z",
      nextReviewDate: null,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: reviewResult });
    await reviewProjectDescriptor.handler({ projectId: PROJ_ID });
    const body = getScriptBody();
    expect(body).toContain(PROJ_ID);
    expect(body).toContain("lastReviewDate");
  });

  it("returns failure for invalid project ID", async () => {
    const result = await reviewProjectDescriptor.handler({
      projectId: 'bad"id',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// queryProjectsForReviewDescriptor
// ---------------------------------------------------------------------------

describe("queryProjectsForReviewDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(queryProjectsForReviewDescriptor.name).toBe(
      "queryProjectsForReview"
    );
    expect(queryProjectsForReviewDescriptor.cliName).toBe(
      "projects-for-review"
    );
    expect(queryProjectsForReviewDescriptor.mcpName).toBe(
      "projects_for_review"
    );
  });

  it("has no cliPositional fields", () => {
    expect(queryProjectsForReviewDescriptor.cliPositional).toEqual([]);
  });
});

describe("queryProjectsForReviewDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries flattenedProjects for overdue review dates", async () => {
    mockRunOmniJS.mockResolvedValue({ success: true, data: [] as OFProject[] });
    await queryProjectsForReviewDescriptor.handler({});
    const body = getScriptBody();
    expect(body).toContain("flattenedProjects");
    expect(body).toContain("nextReviewDate");
  });
});

// ---------------------------------------------------------------------------
// getReviewIntervalDescriptor
// ---------------------------------------------------------------------------

describe("getReviewIntervalDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(getReviewIntervalDescriptor.name).toBe("getReviewInterval");
    expect(getReviewIntervalDescriptor.cliName).toBe("review-interval-get");
    expect(getReviewIntervalDescriptor.mcpName).toBe(
      "project_review_interval_get"
    );
  });

  it("projectId is a required cliPositional", () => {
    expect(getReviewIntervalDescriptor.cliPositional).toEqual(["projectId"]);
  });
});

describe("getReviewIntervalDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes projectId to OmniJS script", async () => {
    const intervalResult: ReviewIntervalResult = {
      projectId: PROJ_ID,
      projectName: "My Project",
      reviewIntervalDays: 7,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: intervalResult });
    await getReviewIntervalDescriptor.handler({ projectId: PROJ_ID });
    const body = getScriptBody();
    expect(body).toContain(PROJ_ID);
    expect(body).toContain("reviewInterval");
  });
});

// ---------------------------------------------------------------------------
// setReviewIntervalDescriptor
// ---------------------------------------------------------------------------

describe("setReviewIntervalDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(setReviewIntervalDescriptor.name).toBe("setReviewInterval");
    expect(setReviewIntervalDescriptor.cliName).toBe("review-interval-set");
    expect(setReviewIntervalDescriptor.mcpName).toBe(
      "project_review_interval_set"
    );
  });

  it("projectId and intervalDays are in schema", () => {
    expect(
      setReviewIntervalDescriptor.inputSchema.safeParse({
        projectId: PROJ_ID,
        intervalDays: 14,
      }).success
    ).toBe(true);
  });

  it("schema rejects intervalDays < 1", () => {
    expect(
      setReviewIntervalDescriptor.inputSchema.safeParse({
        projectId: PROJ_ID,
        intervalDays: 0,
      }).success
    ).toBe(false);
  });
});

describe("setReviewIntervalDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes projectId and days to OmniJS script", async () => {
    const intervalResult: ReviewIntervalResult = {
      projectId: PROJ_ID,
      projectName: "My Project",
      reviewIntervalDays: 14,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: intervalResult });
    await setReviewIntervalDescriptor.handler({
      projectId: PROJ_ID,
      intervalDays: 14,
    });
    const body = getScriptBody();
    expect(body).toContain(PROJ_ID);
    expect(body).toContain("14");
  });

  it("returns failure for invalid project ID", async () => {
    const result = await setReviewIntervalDescriptor.handler({
      projectId: 'bad"id',
      intervalDays: 7,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// focusOnDescriptor
// ---------------------------------------------------------------------------

describe("focusOnDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(focusOnDescriptor.name).toBe("focusOn");
    expect(focusOnDescriptor.cliName).toBe("focus");
    expect(focusOnDescriptor.mcpName).toBe("focus_set");
  });

  it("target is a required cliPositional", () => {
    expect(focusOnDescriptor.cliPositional).toEqual(["target"]);
  });

  it("schema requires target", () => {
    expect(focusOnDescriptor.inputSchema.safeParse({}).success).toBe(false);
  });
});

describe("focusOnDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes target name to OmniJS script", async () => {
    const focusResult: FocusResult = {
      focused: true,
      targetId: PROJ_ID,
      targetName: "Work",
      targetType: "project",
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: focusResult });
    await focusOnDescriptor.handler({ target: "Work" });
    const body = getScriptBody();
    expect(body).toContain('"Work"');
    expect(body).toContain("flattenedProjects");
  });

  it("passes byId=true flag to OmniJS script", async () => {
    const focusResult: FocusResult = {
      focused: true,
      targetId: PROJ_ID,
      targetName: "Work",
      targetType: "project",
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: focusResult });
    await focusOnDescriptor.handler({ target: PROJ_ID, byId: true });
    const body = getScriptBody();
    expect(body).toContain("byIdentifier");
  });
});

// ---------------------------------------------------------------------------
// unfocusDescriptor
// ---------------------------------------------------------------------------

describe("unfocusDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(unfocusDescriptor.name).toBe("unfocus");
    expect(unfocusDescriptor.cliName).toBe("unfocus");
    expect(unfocusDescriptor.mcpName).toBe("focus_clear");
  });

  it("has no cliPositional fields", () => {
    expect(unfocusDescriptor.cliPositional).toEqual([]);
  });
});

describe("unfocusDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears the focus in OmniJS", async () => {
    const focusResult: FocusResult = {
      focused: false,
      targetId: null,
      targetName: null,
      targetType: null,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: focusResult });
    const result = await unfocusDescriptor.handler({});
    expect(result.success).toBe(true);
    const body = getScriptBody();
    expect(body).toContain("win.focus = []");
  });
});

// ---------------------------------------------------------------------------
// getFocusedDescriptor
// ---------------------------------------------------------------------------

describe("getFocusedDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(getFocusedDescriptor.name).toBe("getFocused");
    expect(getFocusedDescriptor.cliName).toBe("focused");
    expect(getFocusedDescriptor.mcpName).toBe("focus_get");
  });

  it("has no cliPositional fields", () => {
    expect(getFocusedDescriptor.cliPositional).toEqual([]);
  });
});

describe("getFocusedDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads current focus from OmniJS", async () => {
    const focusResult: FocusResult = {
      focused: true,
      targetId: PROJ_ID,
      targetName: "Work",
      targetType: "project",
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: focusResult });
    const result = await getFocusedDescriptor.handler({});
    expect(result.success).toBe(true);
    expect(result.data?.focused).toBe(true);
    const body = getScriptBody();
    expect(body).toContain("win.focus");
  });
});

// ---------------------------------------------------------------------------
// getSyncStatusDescriptor
// ---------------------------------------------------------------------------

describe("getSyncStatusDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(getSyncStatusDescriptor.name).toBe("getSyncStatus");
    expect(getSyncStatusDescriptor.cliName).toBe("sync-status");
    expect(getSyncStatusDescriptor.mcpName).toBe("sync_status");
  });

  it("has no cliPositional fields", () => {
    expect(getSyncStatusDescriptor.cliPositional).toEqual([]);
  });
});

describe("getSyncStatusDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries lastSyncDate from OmniJS", async () => {
    const syncStatus: SyncStatus = {
      syncing: false,
      lastSync: "2024-01-01T00:00:00.000Z",
      accountName: null,
      syncEnabled: false,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: syncStatus });
    const result = await getSyncStatusDescriptor.handler({});
    expect(result.success).toBe(true);
    const body = getScriptBody();
    expect(body).toContain("lastSyncDate");
  });
});

// ---------------------------------------------------------------------------
// triggerSyncDescriptor
// ---------------------------------------------------------------------------

describe("triggerSyncDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(triggerSyncDescriptor.name).toBe("triggerSync");
    expect(triggerSyncDescriptor.cliName).toBe("sync");
    expect(triggerSyncDescriptor.mcpName).toBe("sync_trigger");
  });
});

describe("triggerSyncDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls document.sync() in OmniJS", async () => {
    const syncResult: SyncResult = {
      triggered: true,
      message: "Synchronization started",
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: syncResult });
    const result = await triggerSyncDescriptor.handler({});
    expect(result.success).toBe(true);
    const body = getScriptBody();
    expect(body).toContain("document.sync()");
  });
});

// ---------------------------------------------------------------------------
// archiveTasksDescriptor
// ---------------------------------------------------------------------------

describe("archiveTasksDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(archiveTasksDescriptor.name).toBe("archiveTasks");
    expect(archiveTasksDescriptor.cliName).toBe("archive");
    expect(archiveTasksDescriptor.mcpName).toBe("archive");
  });

  it("has no cliPositional fields", () => {
    expect(archiveTasksDescriptor.cliPositional).toEqual([]);
  });

  it("schema accepts all optional archive fields", () => {
    const parsed = archiveTasksDescriptor.inputSchema.safeParse({
      completedBefore: "2024-01-01",
      droppedBefore: "2024-01-01",
      project: "Work",
      dryRun: true,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("archiveTasksDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes completedBefore filter to OmniJS script", async () => {
    const archiveResult: ArchiveResult = {
      tasksArchived: 5,
      projectsArchived: 1,
      dryRun: false,
      archivePath: null,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: archiveResult });
    await archiveTasksDescriptor.handler({ completedBefore: "2024-01-01" });
    const body = getScriptBody();
    expect(body).toContain("flattenedTasks");
    expect(body).toContain("2024");
  });

  it("returns failure when neither completedBefore nor droppedBefore provided", async () => {
    const result = await archiveTasksDescriptor.handler({});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.VALIDATION_ERROR);
  });
});

// ---------------------------------------------------------------------------
// compactDatabaseDescriptor
// ---------------------------------------------------------------------------

describe("compactDatabaseDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(compactDatabaseDescriptor.name).toBe("compactDatabase");
    expect(compactDatabaseDescriptor.cliName).toBe("compact");
    expect(compactDatabaseDescriptor.mcpName).toBe("compact_database");
  });
});

describe("compactDatabaseDescriptor — handler forwarding", () => {
  it("returns structured not-supported result (no OmniJS call)", async () => {
    const result = await compactDatabaseDescriptor.handler({});
    expect(result.success).toBe(true);
    const data = result.data as CompactResult;
    expect(data.compacted).toBe(false);
    expect(data.message).toContain("not supported");
  });
});

// ---------------------------------------------------------------------------
// addAttachmentDescriptor
// ---------------------------------------------------------------------------

describe("addAttachmentDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(addAttachmentDescriptor.name).toBe("addAttachment");
    expect(addAttachmentDescriptor.cliName).toBe("attach");
    expect(addAttachmentDescriptor.mcpName).toBe("attachment_add");
  });

  it("taskId and filePath are required cliPositionals", () => {
    expect(addAttachmentDescriptor.cliPositional).toEqual([
      "taskId",
      "filePath",
    ]);
  });

  it("schema requires taskId and filePath", () => {
    expect(
      addAttachmentDescriptor.inputSchema.safeParse({ taskId: TASK_ID }).success
    ).toBe(false);
  });
});

describe("addAttachmentDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes taskId to OmniJS script", async () => {
    const addResult: AddAttachmentResult = {
      taskId: TASK_ID,
      taskName: "My Task",
      fileName: "doc.pdf",
      attached: true,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: addResult });
    await addAttachmentDescriptor.handler({
      taskId: TASK_ID,
      filePath: "/tmp/doc.pdf",
    });
    const body = getScriptBody();
    expect(body).toContain(TASK_ID);
    expect(body).toContain("addAttachment");
  });

  it("returns failure for invalid task ID", async () => {
    const result = await addAttachmentDescriptor.handler({
      taskId: 'bad"id',
      filePath: "/tmp/doc.pdf",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// listAttachmentsDescriptor
// ---------------------------------------------------------------------------

describe("listAttachmentsDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(listAttachmentsDescriptor.name).toBe("listAttachments");
    expect(listAttachmentsDescriptor.cliName).toBe("attachments");
    expect(listAttachmentsDescriptor.mcpName).toBe("attachments_list");
  });

  it("taskId is a required cliPositional", () => {
    expect(listAttachmentsDescriptor.cliPositional).toEqual(["taskId"]);
  });
});

describe("listAttachmentsDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes taskId to OmniJS script", async () => {
    const listResult: ListAttachmentsResult = {
      taskId: TASK_ID,
      taskName: "My Task",
      attachments: [],
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: listResult });
    await listAttachmentsDescriptor.handler({ taskId: TASK_ID });
    const body = getScriptBody();
    expect(body).toContain(TASK_ID);
    expect(body).toContain("attachments");
  });
});

// ---------------------------------------------------------------------------
// removeAttachmentDescriptor
// ---------------------------------------------------------------------------

describe("removeAttachmentDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(removeAttachmentDescriptor.name).toBe("removeAttachment");
    expect(removeAttachmentDescriptor.cliName).toBe("detach");
    expect(removeAttachmentDescriptor.mcpName).toBe("attachment_remove");
  });

  it("taskId and attachmentName are required cliPositionals", () => {
    expect(removeAttachmentDescriptor.cliPositional).toEqual([
      "taskId",
      "attachmentName",
    ]);
  });
});

describe("removeAttachmentDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes taskId and attachment name to OmniJS script", async () => {
    const removeResult: RemoveAttachmentResult = {
      taskId: TASK_ID,
      attachmentName: "doc.pdf",
      removed: true,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: removeResult });
    await removeAttachmentDescriptor.handler({
      taskId: TASK_ID,
      attachmentName: "doc.pdf",
    });
    const body = getScriptBody();
    expect(body).toContain(TASK_ID);
    expect(body).toContain("doc.pdf");
    expect(body).toContain("removeAttachmentAtIndex");
  });
});

// ---------------------------------------------------------------------------
// exportTaskPaperDescriptor
// ---------------------------------------------------------------------------

describe("exportTaskPaperDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(exportTaskPaperDescriptor.name).toBe("exportTaskPaper");
    expect(exportTaskPaperDescriptor.cliName).toBe("export");
    expect(exportTaskPaperDescriptor.mcpName).toBe("export_taskpaper");
  });

  it("has no cliPositional fields", () => {
    expect(exportTaskPaperDescriptor.cliPositional).toEqual([]);
  });

  it("schema accepts all optional fields", () => {
    const parsed = exportTaskPaperDescriptor.inputSchema.safeParse({
      project: "Work",
      includeCompleted: true,
      includeDropped: false,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("exportTaskPaperDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls OmniJS to build TaskPaper output", async () => {
    const exportResult: TaskPaperExportResult = {
      content: "Work:\n\t- Task 1",
      taskCount: 1,
      projectCount: 1,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: exportResult });
    await exportTaskPaperDescriptor.handler({ project: "Work" });
    const body = getScriptBody();
    expect(body).toContain("flattenedProjects");
  });
});

// ---------------------------------------------------------------------------
// importTaskPaperDescriptor
// ---------------------------------------------------------------------------

describe("importTaskPaperDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(importTaskPaperDescriptor.name).toBe("importTaskPaper");
    expect(importTaskPaperDescriptor.cliName).toBe("import-taskpaper");
    expect(importTaskPaperDescriptor.mcpName).toBe("import_taskpaper");
  });

  it("content is NOT a cliPositional (it's an option)", () => {
    // The CLI 'import' command is hand-wired and reads content from a file.
    // The descriptor-routed surface takes content as a flag/option.
    expect(importTaskPaperDescriptor.cliPositional).toEqual([]);
  });

  it("schema requires content", () => {
    expect(importTaskPaperDescriptor.inputSchema.safeParse({}).success).toBe(
      false
    );
  });
});

describe("importTaskPaperDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes content to OmniJS script", async () => {
    const importResult: TaskPaperImportResult = {
      tasksCreated: 1,
      projectsCreated: 0,
      errors: [],
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: importResult });
    await importTaskPaperDescriptor.handler({
      content: "- My Task",
    });
    // OmniJS is called for the inbox task
    expect(mockRunOmniJS).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// openItemDescriptor
// ---------------------------------------------------------------------------

describe("openItemDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(openItemDescriptor.name).toBe("openItem");
    expect(openItemDescriptor.cliName).toBe("open");
    expect(openItemDescriptor.mcpName).toBe("open");
  });

  it("id is a required cliPositional", () => {
    expect(openItemDescriptor.cliPositional).toEqual(["id"]);
  });

  it("schema requires id", () => {
    expect(openItemDescriptor.inputSchema.safeParse({}).success).toBe(false);
  });
});

describe("openItemDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes id to OmniJS script and opens URL", async () => {
    const openResult: OpenResult = {
      id: TASK_ID,
      type: "task",
      name: "My Task",
      opened: true,
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: openResult });
    await openItemDescriptor.handler({ id: TASK_ID });
    const body = getScriptBody();
    expect(body).toContain(TASK_ID);
    expect(body).toContain("url.open()");
  });

  it("returns failure for invalid ID", async () => {
    const result = await openItemDescriptor.handler({ id: 'bad"id' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// generateUrlDescriptor
// ---------------------------------------------------------------------------

describe("generateUrlDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(generateUrlDescriptor.name).toBe("generateUrl");
    expect(generateUrlDescriptor.cliName).toBe("url");
    expect(generateUrlDescriptor.mcpName).toBe("generate_url");
  });

  it("id is a required cliPositional", () => {
    expect(generateUrlDescriptor.cliPositional).toEqual(["id"]);
  });

  it("schema requires id", () => {
    expect(generateUrlDescriptor.inputSchema.safeParse({}).success).toBe(false);
  });
});

describe("generateUrlDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes id to OmniJS script and builds omnifocus:// URL", async () => {
    const urlResult: UrlResult = {
      id: TASK_ID,
      type: "task",
      url: `omnifocus:///task/${TASK_ID}`,
      name: "My Task",
    };
    mockRunOmniJS.mockResolvedValue({ success: true, data: urlResult });
    await generateUrlDescriptor.handler({ id: TASK_ID });
    const body = getScriptBody();
    expect(body).toContain(TASK_ID);
    expect(body).toContain("omnifocus:///");
  });

  it("returns failure for invalid ID format", async () => {
    const result = await generateUrlDescriptor.handler({ id: 'bad"id' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_ID_FORMAT);
  });
});

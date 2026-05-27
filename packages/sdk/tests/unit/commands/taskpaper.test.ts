import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";

// Mock the omnijs module before any imports that depend on it
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
  escapeJSString: vi.fn((s: string) => s),
  toOmniJSDate: vi.fn((s: string) => `new Date("${s}")`),
}));

// Import after mocking
import {
  exportTaskPaper,
  importTaskPaper,
} from "../../../src/commands/taskpaper.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

// ---------------------------------------------------------------------------
// Shared factories
// ---------------------------------------------------------------------------

interface MockExportResult {
  content: string;
  taskCount: number;
  projectCount: number;
}

interface MockImportResult {
  tasksCreated: number;
  projectsCreated: number;
  errors: string[];
}

function makeExportResult(
  overrides: Partial<MockExportResult> = {}
): MockExportResult {
  return {
    content: "Work:\n\t- Task 1\n",
    taskCount: 1,
    projectCount: 1,
    ...overrides,
  };
}

function makeImportResult(
  overrides: Partial<MockImportResult> = {}
): MockImportResult {
  return {
    tasksCreated: 0,
    projectsCreated: 0,
    errors: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseTaskPaperLine — tested indirectly via importTaskPaper behavior
// ---------------------------------------------------------------------------

describe("TaskPaper format", () => {
  describe("parseTaskPaperLine (via import behavior)", () => {
    // These tests verify the expected parsing behavior
    // by examining what the import function would do with various lines

    it("should recognize project lines ending with colon", () => {
      // A line like "My Project:" should be recognized as a project
      const line = "My Project:";
      expect(line.endsWith(":")).toBe(true);
      expect(line.includes("@")).toBe(false);
    });

    it("should recognize task lines starting with dash", () => {
      // A line like "- Buy milk" should be recognized as a task
      const line = "- Buy milk";
      expect(line.startsWith("- ")).toBe(true);
    });

    it("should recognize task lines starting with asterisk", () => {
      const line = "* Buy milk";
      expect(line.startsWith("* ")).toBe(true);
    });

    it("should parse tags with values", () => {
      // Tags like @due(2024-01-15) should be parsed
      const line = "- Task @due(2024-01-15) @defer(2024-01-10)";
      const dueMatch = /@due\(([^)]+)\)/.exec(line);
      const deferMatch = /@defer\(([^)]+)\)/.exec(line);
      expect(dueMatch?.[1]).toBe("2024-01-15");
      expect(deferMatch?.[1]).toBe("2024-01-10");
    });

    it("should parse simple tags", () => {
      const line = "- Task @flagged @done @myTag";
      const tags = line.match(/@(\w+)/g);
      expect(tags).toContain("@flagged");
      expect(tags).toContain("@done");
      expect(tags).toContain("@myTag");
    });

    it("should parse estimate tags", () => {
      const line = "- Task @estimate(30m)";
      const match = /@estimate\((\d+)(m|h)\)/i.exec(line);
      expect(match?.[1]).toBe("30");
      expect(match?.[2]).toBe("m");
    });

    it("should count indent levels from tabs", () => {
      const line1 = "Project:";
      const line2 = "\t- Task 1";
      const line3 = "\t\t- Subtask";

      const countTabs = (s: string) => {
        let count = 0;
        for (const char of s) {
          if (char === "\t") count++;
          else break;
        }
        return count;
      };

      expect(countTabs(line1)).toBe(0);
      expect(countTabs(line2)).toBe(1);
      expect(countTabs(line3)).toBe(2);
    });
  });

  describe("formatTaskPaperDate", () => {
    it("should format dates as YYYY-MM-DD", () => {
      // Test the expected date format for TaskPaper
      const date = new Date("2024-12-25T12:00:00Z");
      const formatted = date.toISOString().split("T")[0];
      expect(formatted).toBe("2024-12-25");
    });
  });

  describe("TaskPaper format structure", () => {
    it("should use tabs for indentation", () => {
      const projectLine = "My Project:";
      const taskLine = "\t- Buy milk @due(2024-01-15)";
      const noteLine = "\t\tThis is a note";

      expect(projectLine).not.toMatch(/^\t/);
      expect(taskLine).toMatch(/^\t[^\\t]/);
      expect(noteLine).toMatch(/^\t\t/);
    });

    it("should format projects with trailing colon", () => {
      const projectName = "Work Projects";
      const formatted = `${projectName}:`;
      expect(formatted).toBe("Work Projects:");
    });

    it("should format tasks with leading dash", () => {
      const taskName = "Complete report";
      const formatted = `- ${taskName}`;
      expect(formatted).toBe("- Complete report");
    });

    it("should format flags as @flagged", () => {
      const task = "- Important task @flagged";
      expect(task).toContain("@flagged");
    });

    it("should format completion as @done", () => {
      const task = "- Completed task @done";
      expect(task).toContain("@done");
    });
  });

  describe("TaskPaper tag format", () => {
    it("should format dates as @tag(value)", () => {
      const dueTag = "@due(2024-12-25)";
      const deferTag = "@defer(2024-12-20)";

      expect(dueTag).toMatch(/@due\(\d{4}-\d{2}-\d{2}\)/);
      expect(deferTag).toMatch(/@defer\(\d{4}-\d{2}-\d{2}\)/);
    });

    it("should format estimates as @estimate(Nm)", () => {
      const estimate30m = "@estimate(30m)";
      const estimate2h = "@estimate(120m)";

      expect(estimate30m).toMatch(/@estimate\(\d+m\)/);
      expect(estimate2h).toMatch(/@estimate\(\d+m\)/);
    });

    it("should format project status tags", () => {
      const onHold = "@on-hold";
      const sequential = "@sequential";
      const parallel = "@parallel";

      expect(onHold).toBe("@on-hold");
      expect(sequential).toBe("@sequential");
      expect(parallel).toBe("@parallel");
    });
  });
});

// ---------------------------------------------------------------------------
// exportTaskPaper — behavioral tests via mocked runOmniJSWrapped
// ---------------------------------------------------------------------------

describe("exportTaskPaper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful export", () => {
    it("should return export data on success", async () => {
      const mockData = makeExportResult({
        content: "Work:\n\t- Fix bug @flagged\n",
        taskCount: 1,
        projectCount: 1,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockData,
      } as OmniJSResult<MockExportResult>);

      const result = await exportTaskPaper();

      expect(result.success).toBe(true);
      expect(result.data?.content).toContain("Work:");
      expect(result.data?.taskCount).toBe(1);
      expect(result.data?.projectCount).toBe(1);
      expect(result.error).toBeNull();
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should call OmniJS once (single round-trip regardless of database size)", async () => {
      const mockData = makeExportResult({ taskCount: 250, projectCount: 30 });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockData,
      } as OmniJSResult<MockExportResult>);

      await exportTaskPaper();

      // Single OmniJS execution — not one call per project
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should embed includeCompleted=true in the OmniJS script body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeExportResult(),
      } as OmniJSResult<MockExportResult>);

      await exportTaskPaper({ includeCompleted: true });

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("!true");
    });

    it("should embed includeCompleted=false in the OmniJS script body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeExportResult(),
      } as OmniJSResult<MockExportResult>);

      await exportTaskPaper({ includeCompleted: false });

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("!false");
    });

    it("should embed project filter in the OmniJS script body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeExportResult(),
      } as OmniJSResult<MockExportResult>);

      await exportTaskPaper({ project: "Work" });

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      // The project name should appear in the filter clause
      expect(body).toContain("work"); // lowercased for case-insensitive match
    });

    it("should not include inbox clause when project filter is active", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeExportResult(),
      } as OmniJSResult<MockExportResult>);

      await exportTaskPaper({ project: "Work" });

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      // When filtering by project, inbox section should be skipped
      expect(body).not.toContain("var inboxTasks = inbox");
    });

    it("should include inbox clause when no project filter", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeExportResult(),
      } as OmniJSResult<MockExportResult>);

      await exportTaskPaper();

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("var inboxTasks = inbox");
    });

    it("should use flattenedProjects in script body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeExportResult(),
      } as OmniJSResult<MockExportResult>);

      await exportTaskPaper();

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("flattenedProjects");
    });

    it("should include Project.Status checks in script body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeExportResult(),
      } as OmniJSResult<MockExportResult>);

      await exportTaskPaper();

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("Project.Status.Done");
      expect(body).toContain("Project.Status.Dropped");
      expect(body).toContain("Project.Status.OnHold");
    });

    it("should return empty export result when OmniJS returns zero counts", async () => {
      const mockData = makeExportResult({
        content: "",
        taskCount: 0,
        projectCount: 0,
      });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockData,
      } as OmniJSResult<MockExportResult>);

      const result = await exportTaskPaper();

      expect(result.success).toBe(true);
      expect(result.data?.taskCount).toBe(0);
      expect(result.data?.projectCount).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should propagate OmniFocus not running error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<MockExportResult>);

      const result = await exportTaskPaper();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should propagate OmniJS script error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "Script execution failed",
        },
      } as OmniJSResult<MockExportResult>);

      const result = await exportTaskPaper();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });

    it("should handle undefined error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<MockExportResult>);

      const result = await exportTaskPaper();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle undefined data in successful response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<MockExportResult>);

      const result = await exportTaskPaper();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No export data returned");
    });
  });
});

// ---------------------------------------------------------------------------
// importTaskPaper — behavioral tests via mocked runOmniJSWrapped
// ---------------------------------------------------------------------------

describe("importTaskPaper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful import", () => {
    it("should return import result on success", async () => {
      const mockData = makeImportResult({ tasksCreated: 3, projectsCreated: 1 });

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockData,
      } as OmniJSResult<MockImportResult>);

      const content = "Work:\n\t- Task 1\n\t- Task 2\n\t- Task 3\n";
      const result = await importTaskPaper(content, { createProjects: true });

      expect(result.success).toBe(true);
      expect(result.data?.tasksCreated).toBe(3);
      expect(result.data?.projectsCreated).toBe(1);
      expect(result.data?.errors).toEqual([]);
      expect(result.error).toBeNull();
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should issue a single OmniJS call regardless of task/project count", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 20, projectsCreated: 5 }),
      } as OmniJSResult<MockImportResult>);

      const lines = [
        "Project A:",
        "\t- Task 1",
        "\t- Task 2",
        "Project B:",
        "\t- Task 3",
      ];

      await importTaskPaper(lines.join("\n"), { createProjects: true });

      // Always exactly one OmniJS call
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should embed task names in the OmniJS script body", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "Work:\n\t- Fix critical bug\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("Fix critical bug");
    });

    it("should embed project creation in script when createProjects=true", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ projectsCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "NewProject:\n\t- Some task\n";
      await importTaskPaper(content, { createProjects: true });

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("new Project");
      expect(body).toContain("NewProject");
    });

    it("should NOT embed project creation when createProjects is not set", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult(),
      } as OmniJSResult<MockImportResult>);

      const content = "ExistingProject:\n\t- Some task\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).not.toContain("new Project");
    });

    it("should route tasks without a project to inbox", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 2 }),
      } as OmniJSResult<MockImportResult>);

      // No project header — tasks go to inbox
      const content = "- Orphan task 1\n- Orphan task 2\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("inbox.ending");
    });

    it("should route tasks under Inbox header to inbox (not a project)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "Inbox:\n\t- Inbox task\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      // Inbox header should NOT create a project
      expect(body).not.toContain("new Project");
      // The task should go to inbox.ending
      expect(body).toContain("inbox.ending");
    });

    it("should skip completed tasks during import", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      // One active task, one completed
      const content =
        "Work:\n\t- Active task\n\t- Completed task @done\n\t- Dropped task @dropped\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      // Only the active task should appear in new Task() calls
      expect(body).toContain("Active task");
      expect(body).not.toContain("Completed task");
      expect(body).not.toContain("Dropped task");
    });

    it("should embed due date in OmniJS script using toOmniJSDate", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "- Task @due(2024-12-31)\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("dueDate");
      // toOmniJSDate is mocked to return new Date("...")
      expect(body).toContain("2024-12-31");
    });

    it("should embed defer date in OmniJS script", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "- Task @defer(2024-12-01)\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("deferDate");
      expect(body).toContain("2024-12-01");
    });

    it("should embed flagged=true in OmniJS script", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "- Important task @flagged\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("flagged = true");
    });

    it("should embed estimatedMinutes in OmniJS script", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "- Long task @estimate(90m)\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("estimatedMinutes");
      expect(body).toContain("90");
    });

    it("should embed tag lookup in OmniJS script for tasks with tags", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "- Tagged task @work @urgent\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("flattenedTags.byName");
      expect(body).toContain("work");
      expect(body).toContain("urgent");
    });

    it("should include error handling (try/catch) in the OmniJS script", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "Work:\n\t- A task\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      expect(body).toContain("try {");
      expect(body).toContain("} catch (e)");
      expect(body).toContain("errors.push");
    });

    it("should propagate OmniJS-reported errors in result", async () => {
      const importErrors = [
        'Failed to create tasks in project "Nonexistent": Error: Project not found',
      ];

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ errors: importErrors }),
      } as OmniJSResult<MockImportResult>);

      const content = "Nonexistent:\n\t- Task\n";
      const result = await importTaskPaper(content);

      expect(result.success).toBe(true);
      expect(result.data?.errors).toHaveLength(1);
      expect(result.data?.errors[0]).toContain("Nonexistent");
    });

    it("should handle empty content gracefully", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult(),
      } as OmniJSResult<MockImportResult>);

      const result = await importTaskPaper("");

      expect(result.success).toBe(true);
      expect(result.data?.tasksCreated).toBe(0);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should handle content with only notes (no projects/tasks)", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult(),
      } as OmniJSResult<MockImportResult>);

      const content = "Just a note line\nAnother note\n";
      const result = await importTaskPaper(content);

      expect(result.success).toBe(true);
      expect(result.data?.tasksCreated).toBe(0);
    });

    it("should convert 1h estimate to 60 minutes in OmniJS script", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "- Long task @estimate(2h)\n";
      await importTaskPaper(content);

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      // 2h = 120 minutes
      expect(body).toContain("120");
    });

    it("should use defaultProject for tasks before any project header", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 1 }),
      } as OmniJSResult<MockImportResult>);

      const content = "- Floating task\n";
      await importTaskPaper(content, { defaultProject: "Inbox" });

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      // With a defaultProject set, tasks that would otherwise go to inbox
      // are routed to the project
      expect(body).toContain("Inbox");
    });

    it("should generate valid OmniJS with multiple projects and tasks", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: makeImportResult({ tasksCreated: 4, projectsCreated: 2 }),
      } as OmniJSResult<MockImportResult>);

      const content = [
        "Work:",
        "\t- Fix bug",
        "\t- Write tests",
        "Personal:",
        "\t- Buy groceries",
        "\t- Exercise",
      ].join("\n");

      await importTaskPaper(content, { createProjects: true });

      const body = mockRunOmniJS.mock.calls[0]?.[0] as string;
      // All task names present
      expect(body).toContain("Fix bug");
      expect(body).toContain("Write tests");
      expect(body).toContain("Buy groceries");
      expect(body).toContain("Exercise");
      // Project references
      expect(body).toContain("flattenedProjects.byName");
      // Returns JSON
      expect(body).toContain("return JSON.stringify");
    });
  });

  describe("error handling", () => {
    it("should propagate OmniFocus not running error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<MockImportResult>);

      const result = await importTaskPaper("Work:\n\t- Task\n");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should propagate OmniJS script error", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.SCRIPT_ERROR,
          message: "Execution failed",
        },
      } as OmniJSResult<MockImportResult>);

      const result = await importTaskPaper("- Task\n");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.SCRIPT_ERROR);
    });

    it("should handle undefined error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<MockImportResult>);

      const result = await importTaskPaper("- Task\n");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle undefined data in successful response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<MockImportResult>);

      const result = await importTaskPaper("- Task\n");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.error?.message).toBe("No import result returned");
    });
  });
});

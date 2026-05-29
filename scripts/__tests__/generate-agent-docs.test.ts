/**
 * Tests for the agent-docs generator helper functions.
 *
 * These tests exercise the pure transformation utilities:
 *   - kebabFromSchemaField  — field name → --kebab-flag
 *   - usageLineForDescriptor — descriptor → usage line string
 *   - mcpToolParamTable     — descriptor → markdown table
 *   - cliFlagTable          — descriptor → markdown flag table
 *   - getDomain             — canonical name → domain label
 *   - renderAgentInstructions, renderCliInstructions, renderSkillMd
 *
 * None of these functions invoke a descriptor handler or touch OmniFocus.
 *
 * @see packages/sdk/src/registry/define.ts — ResolvedCommandDescriptor shape
 * @see packages/sdk/src/registry/types.ts  — CommandDescriptor interface
 */

import { describe, it, expect } from "vitest";

import {
  kebabFromSchemaField,
  usageLineForDescriptor,
  mcpToolParamTable,
  cliFlagTable,
  getDomain,
  extractFields,
  zodTypeLabel,
  renderAgentInstructions,
  renderCliInstructions,
  renderSkillMd,
  type DescriptorView,
} from "../generate-agent-docs.js";

// ─── ZodNode factories (duck-typed, no real zod needed) ──────────────────────

/** Build a minimal duck-typed ZodString node. */
function zodString(desc?: string): object {
  return { _def: { typeName: "ZodString", description: desc } };
}

/** Build a minimal duck-typed ZodNumber node. */
function zodNumber(desc?: string): object {
  return { _def: { typeName: "ZodNumber", description: desc } };
}

/** Build a minimal duck-typed ZodBoolean node. */
function zodBoolean(desc?: string): object {
  return { _def: { typeName: "ZodBoolean", description: desc } };
}

/** Wrap a node in ZodOptional. */
function zodOptional(inner: object, desc?: string): object {
  return {
    _def: { typeName: "ZodOptional", innerType: inner, description: desc },
  };
}

/** Build a ZodArray wrapping element. */
function zodArray(element: object, desc?: string): object {
  return { _def: { typeName: "ZodArray", type: element, description: desc } };
}

/** Build a ZodEnum node. */
function zodEnum(values: string[], desc?: string): object {
  return { _def: { typeName: "ZodEnum", values, description: desc } };
}

// ─── test helpers ────────────────────────────────────────────────────────────

/** Build a minimal DescriptorView for testing. Handler is never called. */
function makeDescriptor(
  spec: Pick<
    DescriptorView,
    | "name"
    | "cliName"
    | "mcpName"
    | "description"
    | "inputSchema"
    | "cliPositional"
  >
): DescriptorView {
  return { ...spec };
}

const simpleDescriptor = makeDescriptor({
  name: "completeTask",
  cliName: "complete",
  mcpName: "task_complete",
  description: "Mark a task as complete.",
  cliPositional: ["taskId"],
  inputSchema: {
    shape: {
      taskId: zodString("The task ID") as never,
    },
  },
});

const fullDescriptor = makeDescriptor({
  name: "addToInbox",
  cliName: "inbox",
  mcpName: "inbox_add",
  description: "Add a new task to the OmniFocus inbox.",
  cliPositional: ["title"],
  inputSchema: {
    shape: {
      title: zodString("Task title") as never,
      note: zodOptional(zodString(), "Task note") as never,
      due: zodOptional(zodString(), "Due date") as never,
      flag: zodOptional(zodBoolean(), "Flag the task") as never,
      tags: zodOptional(zodArray(zodString()), "Tags to apply") as never,
      estimatedMinutes: zodOptional(zodNumber(), "Estimated minutes") as never,
    },
  },
});

const noPositionalDescriptor = makeDescriptor({
  name: "queryForecast",
  cliName: "forecast",
  mcpName: "forecast",
  description: "Query tasks due within N days.",
  cliPositional: [],
  inputSchema: {
    shape: {
      days: zodOptional(zodNumber(), "Number of days ahead") as never,
      includeDeferred: zodOptional(
        zodBoolean(),
        "Include deferred tasks"
      ) as never,
    },
  },
});

const batchDescriptor = makeDescriptor({
  name: "completeTasks",
  cliName: "complete-batch",
  mcpName: "tasks_complete_batch",
  description: "Complete multiple tasks.",
  cliPositional: ["taskIds"],
  inputSchema: {
    shape: {
      taskIds: zodArray(zodString(), "Task IDs") as never,
    },
  },
});

// ─── kebabFromSchemaField ────────────────────────────────────────────────────

describe("kebabFromSchemaField", () => {
  it("prefixes a single-word field with --", () => {
    expect(kebabFromSchemaField("due")).toBe("--due");
  });

  it("converts camelCase to kebab-case with -- prefix", () => {
    expect(kebabFromSchemaField("repeatFrequency")).toBe("--repeat-frequency");
  });

  it("handles multi-word camelCase", () => {
    expect(kebabFromSchemaField("estimatedMinutes")).toBe(
      "--estimated-minutes"
    );
  });

  it("handles 'taskId'", () => {
    expect(kebabFromSchemaField("taskId")).toBe("--task-id");
  });

  it("handles 'parentFolderName'", () => {
    expect(kebabFromSchemaField("parentFolderName")).toBe(
      "--parent-folder-name"
    );
  });

  it("handles 'includeDeferred'", () => {
    expect(kebabFromSchemaField("includeDeferred")).toBe("--include-deferred");
  });
});

// ─── zodTypeLabel ────────────────────────────────────────────────────────────

describe("zodTypeLabel", () => {
  it("returns 'string' for a string node", () => {
    expect(zodTypeLabel(zodString() as never)).toBe("string");
  });

  it("returns 'number' for a number node", () => {
    expect(zodTypeLabel(zodNumber() as never)).toBe("number");
  });

  it("returns 'boolean' for a boolean node", () => {
    expect(zodTypeLabel(zodBoolean() as never)).toBe("boolean");
  });

  it("unwraps optional to the inner type", () => {
    expect(zodTypeLabel(zodOptional(zodString()) as never)).toBe("string");
  });

  it("returns 'string[]' for an array of strings", () => {
    expect(zodTypeLabel(zodArray(zodString()) as never)).toBe("string[]");
  });

  it("returns 'string[]' for optional array", () => {
    expect(zodTypeLabel(zodOptional(zodArray(zodString())) as never)).toBe(
      "string[]"
    );
  });

  it("returns pipe-separated enum values", () => {
    const result = zodTypeLabel(
      zodEnum(["active", "on-hold", "completed"]) as never
    );
    expect(result).toBe("active | on-hold | completed");
  });
});

// ─── extractFields ───────────────────────────────────────────────────────────

describe("extractFields", () => {
  it("extracts the correct field count", () => {
    const fields = extractFields(fullDescriptor);
    expect(fields).toHaveLength(6);
  });

  it("marks required fields as required", () => {
    const fields = extractFields(simpleDescriptor);
    const taskId = fields.find((f) => f.name === "taskId");
    expect(taskId?.required).toBe(true);
  });

  it("marks optional fields as not required", () => {
    const fields = extractFields(fullDescriptor);
    const note = fields.find((f) => f.name === "note");
    expect(note?.required).toBe(false);
  });

  it("detects boolean fields", () => {
    const fields = extractFields(fullDescriptor);
    const flag = fields.find((f) => f.name === "flag");
    expect(flag?.isBoolean).toBe(true);
  });

  it("detects array fields", () => {
    const fields = extractFields(fullDescriptor);
    const tags = fields.find((f) => f.name === "tags");
    expect(tags?.isArray).toBe(true);
  });

  it("captures description from the node", () => {
    const fields = extractFields(simpleDescriptor);
    const taskId = fields.find((f) => f.name === "taskId");
    expect(taskId?.description).toBe("The task ID");
  });
});

// ─── usageLineForDescriptor ───────────────────────────────────────────────────

describe("usageLineForDescriptor", () => {
  it("starts with 'ofocus' and the cliName", () => {
    const line = usageLineForDescriptor(simpleDescriptor);
    expect(line.startsWith("ofocus complete")).toBe(true);
  });

  it("places required positionals in <angle> brackets", () => {
    const line = usageLineForDescriptor(simpleDescriptor);
    expect(line).toContain("<taskId>");
  });

  it("does not include positional in the flags section", () => {
    const line = usageLineForDescriptor(simpleDescriptor);
    // Should NOT have --task-id because taskId is positional
    expect(line).not.toContain("--task-id");
  });

  it("wraps optional flags in square brackets", () => {
    const line = usageLineForDescriptor(fullDescriptor);
    expect(line).toContain("[--note <note>]");
  });

  it("renders boolean flags without <value> placeholder", () => {
    const line = usageLineForDescriptor(fullDescriptor);
    expect(line).toContain("[--flag]");
  });

  it("renders array flags with <val...> placeholder", () => {
    const line = usageLineForDescriptor(fullDescriptor);
    expect(line).toContain("[--tags <val...>]");
  });

  it("handles no positionals — all fields become flags", () => {
    const line = usageLineForDescriptor(noPositionalDescriptor);
    expect(line.startsWith("ofocus forecast")).toBe(true);
    // With no cliPositional, no bare positional tokens should appear
    const tokens = line.split(" ").slice(2); // skip "ofocus forecast"
    const barePositionals = tokens.filter((t) => /^<\w+>$/.test(t));
    expect(barePositionals).toHaveLength(0);
    // days is exposed as a flag, not absent
    expect(line).toContain("--days");
  });

  it("renders variadic positional for array positional", () => {
    const line = usageLineForDescriptor(batchDescriptor);
    expect(line).toContain("<taskIds...>");
  });

  it("produces a deterministic output across two calls", () => {
    const a = usageLineForDescriptor(fullDescriptor);
    const b = usageLineForDescriptor(fullDescriptor);
    expect(a).toBe(b);
  });
});

// ─── mcpToolParamTable ────────────────────────────────────────────────────────

describe("mcpToolParamTable", () => {
  it("includes the field name in the table", () => {
    const table = mcpToolParamTable(simpleDescriptor);
    expect(table).toContain("taskId");
  });

  it("marks required fields as 'yes'", () => {
    const table = mcpToolParamTable(simpleDescriptor);
    expect(table).toContain("yes");
  });

  it("marks optional fields as 'no'", () => {
    const table = mcpToolParamTable(fullDescriptor);
    expect(table).toContain("no");
  });

  it("includes field description", () => {
    const table = mcpToolParamTable(simpleDescriptor);
    expect(table).toContain("The task ID");
  });

  it("returns '_No parameters._' for an empty schema", () => {
    const emptyDescriptor = makeDescriptor({
      name: "noopCommand",
      cliName: "noop",
      mcpName: "noop",
      description: "Does nothing.",
      cliPositional: [],
      inputSchema: { shape: {} },
    });
    expect(mcpToolParamTable(emptyDescriptor)).toBe("_No parameters._");
  });

  it("produces a deterministic table across two calls", () => {
    const a = mcpToolParamTable(fullDescriptor);
    const b = mcpToolParamTable(fullDescriptor);
    expect(a).toBe(b);
  });
});

// ─── cliFlagTable ─────────────────────────────────────────────────────────────

describe("cliFlagTable", () => {
  it("excludes positional fields from the flag table", () => {
    const table = cliFlagTable(simpleDescriptor);
    // taskId is positional — should not appear as --task-id
    expect(table).toBe("_No flags._");
  });

  it("includes non-positional fields as --flags", () => {
    const table = cliFlagTable(fullDescriptor);
    expect(table).toContain("--note");
  });

  it("renders boolean flag type", () => {
    const table = cliFlagTable(fullDescriptor);
    expect(table).toContain("boolean");
  });

  it("renders array flag type", () => {
    const table = cliFlagTable(fullDescriptor);
    expect(table).toContain("string[]");
  });

  it("includes description for each flag", () => {
    const table = cliFlagTable(fullDescriptor);
    expect(table).toContain("Task note");
  });
});

// ─── getDomain ────────────────────────────────────────────────────────────────

describe("getDomain", () => {
  // Explicit map entries
  it("maps 'addToInbox' → Tasks via explicit map", () => {
    expect(getDomain("addToInbox")).toBe("Tasks");
  });

  it("maps 'completeTasks' → Batch via explicit map", () => {
    expect(getDomain("completeTasks")).toBe("Batch");
  });

  it("maps 'updateTasks' → Batch via explicit map", () => {
    expect(getDomain("updateTasks")).toBe("Batch");
  });

  it("maps 'deferTasks' → Batch via explicit map", () => {
    expect(getDomain("deferTasks")).toBe("Batch");
  });

  it("maps 'deleteTasks' → Batch via explicit map", () => {
    expect(getDomain("deleteTasks")).toBe("Batch");
  });

  it("maps 'queryForecast' → Forecast via explicit map", () => {
    expect(getDomain("queryForecast")).toBe("Forecast");
  });

  it("maps 'quickCapture' → Tasks via explicit map", () => {
    expect(getDomain("quickCapture")).toBe("Tasks");
  });

  it("maps 'focusOn' → Focus via explicit map", () => {
    expect(getDomain("focusOn")).toBe("Focus");
  });

  it("maps 'unfocus' → Focus via explicit map", () => {
    expect(getDomain("unfocus")).toBe("Focus");
  });

  it("maps 'getFocused' → Focus via explicit map", () => {
    expect(getDomain("getFocused")).toBe("Focus");
  });

  // Prefix rule entries
  it("maps 'completeTask' → Tasks via prefix rule", () => {
    expect(getDomain("completeTask")).toBe("Tasks");
  });

  it("maps 'listProjects' → Projects via prefix rule", () => {
    expect(getDomain("listProjects")).toBe("Projects");
  });

  it("maps 'createProject' → Projects via prefix rule", () => {
    expect(getDomain("createProject")).toBe("Projects");
  });

  it("maps 'listFolders' → Folders via prefix rule", () => {
    expect(getDomain("listFolders")).toBe("Folders");
  });

  it("maps 'createFolder' → Folders via prefix rule", () => {
    expect(getDomain("createFolder")).toBe("Folders");
  });

  it("maps 'listTags' → Tags via prefix rule", () => {
    expect(getDomain("listTags")).toBe("Tags");
  });

  it("maps 'createTag' → Tags via prefix rule", () => {
    expect(getDomain("createTag")).toBe("Tags");
  });

  it("maps 'dropTask' → Tasks via prefix rule", () => {
    expect(getDomain("dropTask")).toBe("Tasks");
  });

  it("maps 'duplicateTask' → Tasks via prefix rule", () => {
    expect(getDomain("duplicateTask")).toBe("Tasks");
  });

  it("maps 'deferTask' → Tasks via prefix rule", () => {
    expect(getDomain("deferTask")).toBe("Tasks");
  });

  it("maps 'searchTasks' → Tasks via explicit map", () => {
    expect(getDomain("searchTasks")).toBe("Tasks");
  });

  it("maps 'createSubtask' → Tasks via prefix rule", () => {
    expect(getDomain("createSubtask")).toBe("Tasks");
  });

  it("maps 'moveTaskToParent' → Tasks via prefix rule", () => {
    expect(getDomain("moveTaskToParent")).toBe("Tasks");
  });

  it("maps unknown name → Other", () => {
    expect(getDomain("xyzUnknownOperation")).toBe("Other");
  });

  it("maps 'getSyncStatus' → Sync via prefix rule", () => {
    expect(getDomain("getSyncStatus")).toBe("Sync");
  });
});

// ─── renderAgentInstructions ──────────────────────────────────────────────────

describe("renderAgentInstructions", () => {
  it("includes the document header", () => {
    const out = renderAgentInstructions([simpleDescriptor]);
    expect(out).toContain("OmniFocus MCP Tools");
  });

  it("includes the generated marker comment", () => {
    const out = renderAgentInstructions([simpleDescriptor]);
    expect(out).toContain("DO NOT EDIT BY HAND");
  });

  it("includes the descriptor's mcpName", () => {
    const out = renderAgentInstructions([simpleDescriptor]);
    expect(out).toContain("task_complete");
  });

  it("includes the descriptor's description", () => {
    const out = renderAgentInstructions([simpleDescriptor]);
    expect(out).toContain("Mark a task as complete.");
  });

  it("produces a deterministic output (byte-identical across two calls)", () => {
    const descriptors = [simpleDescriptor, fullDescriptor];
    expect(renderAgentInstructions(descriptors)).toBe(
      renderAgentInstructions(descriptors)
    );
  });

  it("returns an empty-ish doc for an empty descriptor list", () => {
    const out = renderAgentInstructions([]);
    expect(out).toContain("OmniFocus MCP Tools");
    // No tool sections
    expect(out).not.toContain("####");
  });
});

// ─── renderCliInstructions ────────────────────────────────────────────────────

describe("renderCliInstructions", () => {
  it("includes the document header", () => {
    const out = renderCliInstructions([simpleDescriptor]);
    expect(out).toContain("OmniFocus CLI");
  });

  it("includes the generated marker comment", () => {
    const out = renderCliInstructions([simpleDescriptor]);
    expect(out).toContain("DO NOT EDIT BY HAND");
  });

  it("includes the descriptor's cliName in usage", () => {
    const out = renderCliInstructions([simpleDescriptor]);
    expect(out).toContain("ofocus complete");
  });

  it("produces a deterministic output", () => {
    const descriptors = [simpleDescriptor, fullDescriptor];
    expect(renderCliInstructions(descriptors)).toBe(
      renderCliInstructions(descriptors)
    );
  });
});

// ─── renderSkillMd ────────────────────────────────────────────────────────────

describe("renderSkillMd", () => {
  it("includes YAML frontmatter", () => {
    const out = renderSkillMd([simpleDescriptor]);
    expect(out).toContain("---");
    expect(out).toContain("name: ofocus");
  });

  it("includes the generated marker comment", () => {
    const out = renderSkillMd([simpleDescriptor]);
    expect(out).toContain("DO NOT EDIT BY HAND");
  });

  it("includes a usage line for each descriptor", () => {
    const out = renderSkillMd([simpleDescriptor]);
    expect(out).toContain("ofocus complete");
  });

  it("produces a deterministic output", () => {
    const descriptors = [simpleDescriptor, fullDescriptor];
    expect(renderSkillMd(descriptors)).toBe(renderSkillMd(descriptors));
  });
});

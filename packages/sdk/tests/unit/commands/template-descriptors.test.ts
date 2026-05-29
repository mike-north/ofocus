import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs for all template tests
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock the omnijs module (needed by queryProjects/queryTasks imports)
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
  saveTemplateDescriptor,
  listTemplatesDescriptor,
  getTemplateDescriptor,
  createFromTemplateDescriptor,
  deleteTemplateDescriptor,
} from "../../../src/commands/templates.js";

describe("saveTemplateDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(saveTemplateDescriptor.name).toBe("saveTemplate");
    expect(saveTemplateDescriptor.cliName).toBe("template-save");
    expect(saveTemplateDescriptor.mcpName).toBe("template_save");
  });

  it("name and sourceProject are required cliPositionals", () => {
    expect(saveTemplateDescriptor.cliPositional).toEqual([
      "name",
      "sourceProject",
    ]);
  });

  it("schema requires name and sourceProject", () => {
    expect(
      saveTemplateDescriptor.inputSchema.safeParse({ name: "My Template" })
        .success
    ).toBe(false);
    expect(
      saveTemplateDescriptor.inputSchema.safeParse({
        name: "My Template",
        sourceProject: "Work",
      }).success
    ).toBe(true);
  });

  it("schema accepts optional description", () => {
    const parsed = saveTemplateDescriptor.inputSchema.safeParse({
      name: "T",
      sourceProject: "P",
      description: "A template",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("listTemplatesDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(listTemplatesDescriptor.name).toBe("listTemplates");
    expect(listTemplatesDescriptor.cliName).toBe("template-list");
    expect(listTemplatesDescriptor.mcpName).toBe("templates_list");
  });

  it("has no cliPositional fields", () => {
    expect(listTemplatesDescriptor.cliPositional).toEqual([]);
  });
});

describe("listTemplatesDescriptor — handler forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns list result (even when directory is empty)", async () => {
    const result = await listTemplatesDescriptor.handler({});
    expect(result.success).toBe(true);
    const data = result.data as { templates: unknown[] };
    expect(Array.isArray(data.templates)).toBe(true);
  });
});

describe("getTemplateDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(getTemplateDescriptor.name).toBe("getTemplate");
    expect(getTemplateDescriptor.cliName).toBe("template-get");
    expect(getTemplateDescriptor.mcpName).toBe("template_get");
  });

  it("templateName is a required cliPositional", () => {
    expect(getTemplateDescriptor.cliPositional).toEqual(["templateName"]);
  });

  it("schema requires templateName", () => {
    expect(getTemplateDescriptor.inputSchema.safeParse({}).success).toBe(false);
  });
});

describe("getTemplateDescriptor — handler forwarding", () => {
  it("returns failure when template file does not exist", async () => {
    const result = await getTemplateDescriptor.handler({
      templateName: "NonExistent",
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("Template not found");
  });
});

describe("createFromTemplateDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(createFromTemplateDescriptor.name).toBe("createFromTemplate");
    expect(createFromTemplateDescriptor.cliName).toBe("template-create");
    expect(createFromTemplateDescriptor.mcpName).toBe(
      "template_create_project"
    );
  });

  it("templateName is a required cliPositional", () => {
    expect(createFromTemplateDescriptor.cliPositional).toEqual([
      "templateName",
    ]);
  });

  it("schema accepts all optional fields", () => {
    const parsed = createFromTemplateDescriptor.inputSchema.safeParse({
      templateName: "My Template",
      projectName: "New Project",
      folder: "Work",
      baseDate: "2024-01-01",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("createFromTemplateDescriptor — handler forwarding", () => {
  it("returns failure when template file does not exist", async () => {
    const result = await createFromTemplateDescriptor.handler({
      templateName: "NonExistent",
    });
    expect(result.success).toBe(false);
  });
});

describe("deleteTemplateDescriptor — metadata", () => {
  it("has correct name/cliName/mcpName", () => {
    expect(deleteTemplateDescriptor.name).toBe("deleteTemplate");
    expect(deleteTemplateDescriptor.cliName).toBe("template-delete");
    expect(deleteTemplateDescriptor.mcpName).toBe("template_delete");
  });

  it("templateName is a required cliPositional", () => {
    expect(deleteTemplateDescriptor.cliPositional).toEqual(["templateName"]);
  });
});

describe("deleteTemplateDescriptor — handler forwarding", () => {
  it("returns failure when template does not exist", async () => {
    const result = await deleteTemplateDescriptor.handler({
      templateName: "NonExistent",
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("Template not found");
  });
});

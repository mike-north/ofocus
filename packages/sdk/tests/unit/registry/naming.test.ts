import { describe, it, expect } from "vitest";
import {
  toKebabCase,
  toSnakeCase,
  validateCanonicalName,
} from "../../../src/registry/naming.js";

describe("toKebabCase", () => {
  it("returns a single word unchanged", () => {
    expect(toKebabCase("inbox")).toBe("inbox");
  });

  it("converts a two-word camelCase identifier", () => {
    expect(toKebabCase("createProject")).toBe("create-project");
  });

  it("converts a multi-word camelCase identifier", () => {
    expect(toKebabCase("addToInbox")).toBe("add-to-inbox");
  });

  it("handles capital letters in the middle of words individually", () => {
    expect(toKebabCase("getURL")).toBe("get-u-r-l");
  });

  it("does not prepend a leading dash for a name that already starts lowercase", () => {
    expect(toKebabCase("focusOn")).toBe("focus-on");
    expect(toKebabCase("focusOn").startsWith("-")).toBe(false);
  });

  it("returns an empty string for an empty input", () => {
    expect(toKebabCase("")).toBe("");
  });
});

describe("toSnakeCase", () => {
  it("returns a single word unchanged", () => {
    expect(toSnakeCase("inbox")).toBe("inbox");
  });

  it("converts a two-word camelCase identifier", () => {
    expect(toSnakeCase("createProject")).toBe("create_project");
  });

  it("converts a multi-word camelCase identifier", () => {
    expect(toSnakeCase("addToInbox")).toBe("add_to_inbox");
  });

  it("does not prepend a leading underscore", () => {
    expect(toSnakeCase("focusOn")).toBe("focus_on");
    expect(toSnakeCase("focusOn").startsWith("_")).toBe(false);
  });

  it("returns an empty string for an empty input", () => {
    expect(toSnakeCase("")).toBe("");
  });
});

describe("validateCanonicalName", () => {
  it("accepts a single lowercase word", () => {
    expect(validateCanonicalName("inbox")).toBeNull();
  });

  it("accepts a multi-word camelCase identifier", () => {
    expect(validateCanonicalName("createProject")).toBeNull();
    expect(validateCanonicalName("addToInbox")).toBeNull();
  });

  it("accepts names containing digits after the first letter", () => {
    expect(validateCanonicalName("openV2")).toBeNull();
  });

  it("rejects an empty name", () => {
    expect(validateCanonicalName("")).toBe("Command name cannot be empty");
  });

  it("rejects a name that starts with an uppercase letter", () => {
    expect(validateCanonicalName("CreateProject")).toMatch(
      /must start with a lowercase letter/
    );
  });

  it("rejects a name that starts with a digit", () => {
    expect(validateCanonicalName("2create")).toMatch(
      /must start with a lowercase letter/
    );
  });

  it("rejects a kebab-case name", () => {
    expect(validateCanonicalName("create-project")).toMatch(/camelCase/);
  });

  it("rejects a snake_case name", () => {
    expect(validateCanonicalName("create_project")).toMatch(/camelCase/);
  });

  it("rejects a name with whitespace", () => {
    expect(validateCanonicalName("create project")).toMatch(/camelCase/);
  });
});

/**
 * Tests for compileActionToPlugin — single-file .omnijs emission.
 *
 * @see https://omni-automation.com/plugins/api.html
 * @see https://omni-automation.com/plugins/simple.html
 * @see spec §4.2 (docs/specs/2026-06-08-ofocus-typed-omniautomation-design.md)
 */
import { describe, it, expect } from "vitest";
import { defineOmniAction } from "../../../src/authoring/define.js";
import { compileActionToPlugin } from "../../../src/authoring/plugin-emit.js";

describe("compileActionToPlugin", () => {
  const action = defineOmniAction(() => {}, { validate: () => true });
  const meta = {
    identifier: "com.ofocus.test.sample",
    version: "1.0",
    label: "Sample",
  };

  it("emits a metadata comment header with required keys (spec §4.2)", () => {
    const file = compileActionToPlugin(action, meta);
    expect(file.startsWith("/*{")).toBe(true);
    const header = JSON.parse(file.slice(2, file.indexOf("}*/") + 1)) as Record<
      string,
      unknown
    >;
    expect(header.type).toBe("action");
    expect(header.targets).toEqual(["omnifocus"]);
    expect(header.identifier).toBe("com.ofocus.test.sample");
    expect(header.version).toBe("1.0");
  });

  it("wraps the action in the PlugIn.Action self-invoking template", () => {
    const file = compileActionToPlugin(action, meta);
    expect(file).toContain("new PlugIn.Action(");
    expect(file).toContain("action.validate =");
    expect(file).toContain("return action;");
  });

  it("defaults validate to `() => true` when the action has none", () => {
    const noValidate = defineOmniAction(() => {});
    const file = compileActionToPlugin(noValidate, meta);
    expect(file).toContain("action.validate = (() => true);");
  });

  it("includes label in the metadata header", () => {
    const file = compileActionToPlugin(action, meta);
    const header = JSON.parse(file.slice(2, file.indexOf("}*/") + 1)) as Record<
      string,
      unknown
    >;
    expect(header.label).toBe("Sample");
  });

  it("omits optional metadata keys when not provided", () => {
    const file = compileActionToPlugin(action, meta);
    const header = JSON.parse(file.slice(2, file.indexOf("}*/") + 1)) as Record<
      string,
      unknown
    >;
    expect(Object.prototype.hasOwnProperty.call(header, "shortLabel")).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(header, "paletteLabel")).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(header, "description")).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(header, "author")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(header, "image")).toBe(false);
  });

  it("includes optional metadata keys when provided", () => {
    const fullMeta = {
      identifier: "com.ofocus.test.full",
      version: "2.0",
      label: "Full",
      shortLabel: "F",
      paletteLabel: "Full Action",
      description: "A full action",
      author: "Test Author",
      image: "star.fill",
    };
    const file = compileActionToPlugin(action, fullMeta);
    const header = JSON.parse(file.slice(2, file.indexOf("}*/") + 1)) as Record<
      string,
      unknown
    >;
    expect(header.shortLabel).toBe("F");
    expect(header.paletteLabel).toBe("Full Action");
    expect(header.description).toBe("A full action");
    expect(header.author).toBe("Test Author");
    expect(header.image).toBe("star.fill");
  });

  it("uses action's validateSource when present", () => {
    const file = compileActionToPlugin(action, meta);
    // The action was defined with `validate: () => true`, so the validateSource
    // should be the serialized function — not the fallback `(() => true)` literal.
    // We verify the validate line contains the function assignment from the action.
    expect(file).toContain("action.validate =");
    // The validate source from defineOmniAction must be present (not the fallback)
    const validateLine = file
      .split("\n")
      .find((line) => line.includes("action.validate ="));
    expect(validateLine).toBeDefined();
    // The validate source is the serialized `() => true` arrow function from defineOmniAction,
    // which should differ from the literal fallback string `(() => true)`.
    // Both contain "true" so we verify the perform source is from the action:
    expect(action.validateSource).not.toBeNull();
    expect(file).toContain(`action.validate = ${action.validateSource ?? ""};`);
  });
});

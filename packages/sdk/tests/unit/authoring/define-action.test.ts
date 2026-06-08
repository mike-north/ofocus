import { describe, it, expect } from "vitest";
import { defineOmniAction } from "../../../src/authoring/define.js";

describe("defineOmniAction", () => {
  it("captures perform and validate sources", () => {
    const action = defineOmniAction(
      (selection) => {
        void selection;
      },
      { validate: (selection) => selection.tasks.length > 0 }
    );
    expect(action.kind).toBe("action");
    expect(action.performSource).toContain("selection");
    expect(action.validateSource).toContain("tasks.length");
  });

  it("defaults validateSource to null when no validate is given", () => {
    const action = defineOmniAction(() => {});
    expect(action.validateSource).toBeNull();
  });

  it("rejects a non-function argument", () => {
    // @ts-expect-error - exercising the runtime guard
    expect(() => defineOmniAction("not a function")).toThrow(
      /defineOmniAction expects a function/
    );
  });
});

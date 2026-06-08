import { describe, it, expect } from "vitest";
import { defineOmniScript } from "../../../src/authoring/define.js";

describe("defineOmniScript", () => {
  it("captures the function source for later serialization", () => {
    const script = defineOmniScript((args: { taskId: string }) => {
      return args.taskId.length;
    });
    expect(script.kind).toBe("script");
    expect(script.source).toContain("args.taskId.length");
  });

  it("rejects a non-function argument", () => {
    // @ts-expect-error - exercising the runtime guard
    expect(() => defineOmniScript("not a function")).toThrow(
      /defineOmniScript expects a function/
    );
  });
});

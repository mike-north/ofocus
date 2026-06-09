import { describe, it, expect } from "vitest";
import { composeScriptBody } from "../../../src/authoring/serialize.js";

describe("composeScriptBody", () => {
  it("injects JSON args and returns a JSON-stringified call of the source", () => {
    const body = composeScriptBody("(a) => a.n + 1", { n: 41 });
    expect(body).toContain("JSON.parse");
    expect(body).toContain("return JSON.stringify(((a) => a.n + 1)(");
  });

  it("double-stringifies args so quotes cannot break out of the literal", () => {
    const body = composeScriptBody("(a) => a", { evil: '"});alert(1);//' });
    expect(body).not.toContain('"});alert(1);//"');
    expect(body).toContain("JSON.parse(");
  });
});

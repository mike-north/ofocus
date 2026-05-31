import { describe, it, expect } from "vitest";
import { PLUGIN_NAME } from "../hooks/lib.mjs";

describe("plugin scaffold", () => {
  it("exposes the plugin name", () => {
    expect(PLUGIN_NAME).toBe("ofocus-assistant");
  });
});

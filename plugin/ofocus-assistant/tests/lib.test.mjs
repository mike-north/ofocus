import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PLUGIN_NAME } from "../hooks/lib.mjs";
import { sessionKey } from "../hooks/lib.mjs";

describe("plugin scaffold", () => {
  it("exposes the plugin name", () => {
    expect(PLUGIN_NAME).toBe("ofocus-assistant");
  });
});

describe("sessionKey", () => {
  it("prefers session_id", () => {
    expect(sessionKey({ session_id: "s1", transcript_path: "/t" })).toBe("s1");
  });
  it("falls back to transcript_path", () => {
    expect(sessionKey({ transcript_path: "/path/x.jsonl" })).toBe("/path/x.jsonl");
  });
  it("falls back to _shared when neither present", () => {
    expect(sessionKey({})).toBe("_shared");
    expect(sessionKey({ session_id: "" })).toBe("_shared");
  });
});

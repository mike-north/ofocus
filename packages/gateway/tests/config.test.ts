import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

const base = {
  OFOCUS_GATEWAY_ISSUER_URL: "https://ofocus.huangnorth.com",
  OFOCUS_GATEWAY_PORT: "8722",
  OFOCUS_GATEWAY_GOOGLE_CLIENT_ID: "gid",
  OFOCUS_GATEWAY_GOOGLE_CLIENT_SECRET: "gsecret",
  OFOCUS_GATEWAY_ALLOWED_EMAILS: "michael.l.north@gmail.com",
  OFOCUS_GATEWAY_STATE_DIR: "/tmp/ofocus-gw",
};

describe("loadConfig", () => {
  it("parses a valid environment", () => {
    const cfg = loadConfig(base);
    expect(cfg.issuerUrl.toString()).toBe("https://ofocus.huangnorth.com/");
    expect(cfg.port).toBe(8722);
    expect(cfg.allowedEmails).toEqual(["michael.l.north@gmail.com"]);
    expect(cfg.exposedTools).toBe("all"); // default
  });

  it("splits and lowercases multiple allowed emails", () => {
    const cfg = loadConfig({
      ...base,
      OFOCUS_GATEWAY_ALLOWED_EMAILS: "A@x.com, B@y.com",
    });
    expect(cfg.allowedEmails).toEqual(["a@x.com", "b@y.com"]);
  });

  it("parses an explicit exposedTools allowlist", () => {
    const cfg = loadConfig({
      ...base,
      OFOCUS_GATEWAY_EXPOSED_TOOLS: "tasks_list, search, forecast",
    });
    expect(cfg.exposedTools).toEqual(
      new Set(["tasks_list", "search", "forecast"])
    );
  });

  it("rejects a missing required var", () => {
    const { OFOCUS_GATEWAY_GOOGLE_CLIENT_ID: _omit, ...rest } = base;
    expect(() => loadConfig(rest)).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("rejects a non-https issuer url", () => {
    expect(() =>
      loadConfig({ ...base, OFOCUS_GATEWAY_ISSUER_URL: "http://insecure" })
    ).toThrow(/https/);
  });

  it("rejects an empty allowlist", () => {
    expect(() =>
      loadConfig({ ...base, OFOCUS_GATEWAY_ALLOWED_EMAILS: "" })
    ).toThrow(/allow/i);
  });
});

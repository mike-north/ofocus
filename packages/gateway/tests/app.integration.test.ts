import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { FileStore } from "../src/store/fileStore.js";
import { FakeIdentityProvider } from "./identity/fakeIdentity.js";
import type { GatewayConfig } from "../src/config.js";

function makeConfig(dir: string): GatewayConfig {
  return {
    issuerUrl: new URL("https://ofocus.huangnorth.com"),
    port: 8722,
    googleClientId: "gid",
    googleClientSecret: "gsecret",
    allowedEmails: ["michael.l.north@gmail.com"],
    stateDir: dir,
    exposedTools: "all",
    accessTokenTtlSeconds: 3600,
  };
}

describe("gateway HTTP app", () => {
  let app: ReturnType<typeof buildApp>;
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "ofocus-gw-"));
    app = buildApp({
      config: makeConfig(dir),
      store: new FileStore(dir),
      identity: new FakeIdentityProvider({
        goodcode: "michael.l.north@gmail.com",
      }),
      version: "0.0.0-test",
    });
  });

  it("serves protected-resource metadata pointing at the AS", async () => {
    const res = await request(app).get("/.well-known/oauth-protected-resource");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.authorization_servers)).toBe(true);
  });

  it("serves AS metadata advertising S256 PKCE and refresh_token", async () => {
    const res = await request(app).get(
      "/.well-known/oauth-authorization-server"
    );
    expect(res.status).toBe(200);
    expect(res.body.code_challenge_methods_supported).toContain("S256");
    expect(res.body.grant_types_supported).toContain("refresh_token");
  });

  it("rejects /mcp with no bearer token (401 + WWW-Authenticate -> resource metadata)", async () => {
    const res = await request(app)
      .post("/mcp")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toMatch(/resource_metadata=/);
  });

  it("rejects /mcp with a bogus bearer token", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("authorization", "Bearer not-a-real-token")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(res.status).toBe(401);
  });

  it("healthz is open and reports version", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.version).toBe("0.0.0-test");
  });
});

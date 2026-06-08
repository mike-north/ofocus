/**
 * UAT: exercises the gateway exactly as a remote MCP client would — DCR, the
 * authorization_code + PKCE flow (with Google stubbed), token exchange, and an
 * authenticated MCP call over real HTTP.
 *
 * The SDK's mcpAuthRouter permits http://127.0.0.1 as an issuer URL (it has an
 * explicit localhost/127.0.0.1 exemption in checkIssuerUrl), so we can run this
 * against an ephemeral port without TLS.
 *
 * @see https://modelcontextprotocol.io/specification/draft/basic/authorization
 * @see RFC 7636 (PKCE), RFC 7591 (DCR)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { buildApp } from "../../src/app.js";
import { FileStore } from "../../src/store/fileStore.js";
import { FakeIdentityProvider } from "../identity/fakeIdentity.js";
import type { GatewayConfig } from "../../src/config.js";

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

const ALLOWED = "michael.l.north@gmail.com";
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ofocus-gw-uat-"));
  // Bind a bare HTTP server first so we learn the ephemeral port before
  // building the app.  The SDK's checkIssuerUrl exempts 127.0.0.1, so plain
  // HTTP is acceptable here.
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  const config: GatewayConfig = {
    issuerUrl: new URL(baseUrl),
    port,
    googleClientId: "gid",
    googleClientSecret: "gsecret",
    allowedEmails: [ALLOWED],
    stateDir: dir,
    exposedTools: "all",
    accessTokenTtlSeconds: 3600,
  };

  const app = buildApp({
    config,
    store: new FileStore(dir),
    identity: new FakeIdentityProvider({
      goodcode: ALLOWED,
      badcode: "stranger@evil.com",
    }),
    version: "uat",
  });

  // Attach the Express app as the request handler on the already-listening server.
  server.on("request", app);
});

afterEach(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    })
);

describe("UAT: end-to-end OAuth + MCP", () => {
  it("completes DCR -> authorize -> callback -> token -> authenticated initialize", async () => {
    // 1) Dynamic client registration
    const reg = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [`${baseUrl}/test-client-callback`],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    });
    expect(reg.status).toBe(201);
    const client = (await reg.json()) as { client_id: string };
    expect(client.client_id).toBeTruthy();

    // 2) /authorize with PKCE -> redirect to (fake) Google
    const { verifier, challenge } = pkce();
    const authUrl = new URL(`${baseUrl}/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", client.client_id);
    authUrl.searchParams.set("redirect_uri", `${baseUrl}/test-client-callback`);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", "client-xyz");
    const authRes = await fetch(authUrl, { redirect: "manual" });
    expect(authRes.status).toBeGreaterThanOrEqual(300);
    const googleUrl = new URL(authRes.headers.get("location")!);
    const googleState = googleUrl.searchParams.get("state")!;
    expect(googleState).toBeTruthy();

    // 3) Simulate Google redirecting back with a good code
    const cbRes = await fetch(
      `${baseUrl}/auth/google/callback?code=goodcode&state=${googleState}`,
      { redirect: "manual" }
    );
    expect(cbRes.status).toBeGreaterThanOrEqual(300);
    const clientCb = new URL(cbRes.headers.get("location")!);
    expect(clientCb.searchParams.get("state")).toBe("client-xyz");
    const code = clientCb.searchParams.get("code")!;
    expect(code).toBeTruthy();

    // 4) Token exchange with the PKCE verifier
    const tokRes = await fetch(`${baseUrl}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: client.client_id,
        redirect_uri: `${baseUrl}/test-client-callback`,
        code_verifier: verifier,
      }),
    });
    expect(tokRes.status).toBe(200);
    const tokens = (await tokRes.json()) as { access_token: string };
    expect(tokens.access_token).toBeTruthy();

    // 5) Authenticated MCP initialize over HTTP
    const initRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "uat", version: "1" },
        },
      }),
    });
    expect(initRes.status).toBe(200);
    expect(initRes.headers.get("mcp-session-id")).toBeTruthy();
  });

  it("denies a non-allow-listed Google account (no token issued)", async () => {
    // Register a client
    const regRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [`${baseUrl}/cb`],
        token_endpoint_auth_method: "none",
      }),
    });
    const reg = (await regRes.json()) as { client_id: string };

    // Initiate authorization
    const { challenge } = pkce();
    const authUrl = new URL(`${baseUrl}/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", reg.client_id);
    authUrl.searchParams.set("redirect_uri", `${baseUrl}/cb`);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    const authRes = await fetch(authUrl, { redirect: "manual" });
    const googleState = new URL(
      authRes.headers.get("location")!
    ).searchParams.get("state")!;

    // Simulate Google callback with a non-allowlisted account code
    const cbRes = await fetch(
      `${baseUrl}/auth/google/callback?code=badcode&state=${googleState}`,
      { redirect: "manual" }
    );
    expect(cbRes.status).toBe(403);
  });
});

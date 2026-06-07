import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../../src/store/fileStore.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

const FIXED = 1_900_000_000_000; // fixed epoch ms for deterministic tests

function makeClient(id: string): OAuthClientInformationFull {
  return {
    client_id: id,
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    token_endpoint_auth_method: "none",
  } as OAuthClientInformationFull;
}

describe("FileStore", () => {
  let dir: string;
  let store: FileStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ofocus-gw-"));
    store = new FileStore(dir);
  });

  it("persists and reads a client", async () => {
    await store.putClient(makeClient("c1"));
    const got = await store.getClient("c1");
    expect(got?.client_id).toBe("c1");
  });

  it("returns undefined for an unknown client", async () => {
    expect(await store.getClient("nope")).toBeUndefined();
  });

  it("survives reload from disk (durability)", async () => {
    await store.putClient(makeClient("c2"));
    const reopened = new FileStore(dir);
    expect((await reopened.getClient("c2"))?.client_id).toBe("c2");
  });

  it("takeLoginState reads once then deletes", async () => {
    await store.putLoginState({
      state: "s1",
      clientId: "c1",
      clientRedirectUri: "https://claude.ai/cb",
      codeChallenge: "ch",
      scopes: [],
      expiresAt: FIXED + 60000,
    });
    expect((await store.takeLoginState("s1"))?.clientId).toBe("c1");
    expect(await store.takeLoginState("s1")).toBeUndefined(); // consumed
  });

  it("takePendingAuthorization is one-time", async () => {
    await store.putPendingAuthorization({
      code: "code1",
      clientId: "c1",
      redirectUri: "https://claude.ai/cb",
      codeChallenge: "ch",
      scopes: [],
      email: "a@b.com",
      expiresAt: FIXED + 60000,
    });
    expect((await store.takePendingAuthorization("code1"))?.email).toBe(
      "a@b.com"
    );
    expect(await store.takePendingAuthorization("code1")).toBeUndefined();
  });

  it("looks tokens up by access and refresh token, and deletes", async () => {
    await store.putToken({
      accessToken: "at",
      refreshToken: "rt",
      clientId: "c1",
      scopes: ["offline_access"],
      email: "a@b.com",
      accessTokenExpiresAt: FIXED + 3600000,
    });
    expect((await store.getTokenByAccessToken("at"))?.refreshToken).toBe("rt");
    expect((await store.getTokenByRefreshToken("rt"))?.accessToken).toBe("at");
    await store.deleteToken("at");
    expect(await store.getTokenByAccessToken("at")).toBeUndefined();
  });
});

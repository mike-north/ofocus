import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Response } from "express";
import { FileStore } from "../../src/store/fileStore.js";
import { FakeIdentityProvider } from "../identity/fakeIdentity.js";
import { OfocusOAuthProvider } from "../../src/oauth/provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

const CLIENT: OAuthClientInformationFull = {
  client_id: "claude",
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  token_endpoint_auth_method: "none",
} as OAuthClientInformationFull;

function makeProvider(emails: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "ofocus-gw-"));
  const store = new FileStore(dir);
  const idp = new FakeIdentityProvider({
    goodcode: "michael.l.north@gmail.com",
    badcode: "stranger@evil.com",
  });
  const provider = new OfocusOAuthProvider({
    store,
    identity: idp,
    allowedEmails: emails,
    callbackUrl: "https://ofocus.huangnorth.com/auth/google/callback",
    accessTokenTtlSeconds: 3600,
  });
  return { provider, store };
}

function fakeRes() {
  const calls: string[] = [];
  const res = {
    redirect: (url: string) => calls.push(url),
  } as unknown as Response;
  return { res, calls };
}

beforeEach(() =>
  vi.useFakeTimers().setSystemTime(new Date("2026-06-07T12:00:00Z"))
);
afterEach(() => vi.useRealTimers());

describe("OfocusOAuthProvider", () => {
  it("authorize() redirects to the upstream IdP carrying our state", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: ["offline_access"],
        state: "client-state",
      },
      res
    );
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(url.host).toBe("accounts.google.test");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("completeLogin() with an allow-listed email issues a code redirect to the client", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: [],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;

    const redirect = await provider.completeLogin({
      googleCode: "goodcode",
      state: googleState,
    });
    const back = new URL(redirect);
    expect(back.origin + back.pathname).toBe(CLIENT.redirect_uris[0]);
    expect(back.searchParams.get("code")).toBeTruthy();
    expect(back.searchParams.get("state")).toBe("cs");
  });

  it("completeLogin() REJECTS a non-allow-listed email", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: [],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    await expect(
      provider.completeLogin({ googleCode: "badcode", state: googleState })
    ).rejects.toThrow(/not authorized/i);
  });

  it("challengeForAuthorizationCode returns the original PKCE challenge", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: [],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(
      await provider.completeLogin({
        googleCode: "goodcode",
        state: googleState,
      })
    ).searchParams.get("code")!;
    expect(await provider.challengeForAuthorizationCode(CLIENT, code)).toBe(
      "CH"
    );
  });

  it("exchangeAuthorizationCode issues tokens once; the code is single-use", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: ["offline_access"],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(
      await provider.completeLogin({
        googleCode: "goodcode",
        state: googleState,
      })
    ).searchParams.get("code")!;

    const tokens = await provider.exchangeAuthorizationCode(CLIENT, code);
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    await expect(
      provider.exchangeAuthorizationCode(CLIENT, code)
    ).rejects.toThrow();
  });

  it("verifyAccessToken returns AuthInfo for a valid token and rejects expired", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: ["offline_access"],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(
      await provider.completeLogin({
        googleCode: "goodcode",
        state: googleState,
      })
    ).searchParams.get("code")!;
    const tokens = await provider.exchangeAuthorizationCode(CLIENT, code);

    const info = await provider.verifyAccessToken(tokens.access_token);
    expect(info.clientId).toBe("claude");
    expect(info.extra?.email).toBe("michael.l.north@gmail.com");

    vi.setSystemTime(new Date("2026-06-07T14:00:00Z"));
    await expect(
      provider.verifyAccessToken(tokens.access_token)
    ).rejects.toThrow();
  });

  it("exchangeRefreshToken rotates the refresh token", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: ["offline_access"],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(
      await provider.completeLogin({
        googleCode: "goodcode",
        state: googleState,
      })
    ).searchParams.get("code")!;
    const first = await provider.exchangeAuthorizationCode(CLIENT, code);

    const refreshed = await provider.exchangeRefreshToken(
      CLIENT,
      first.refresh_token!
    );
    expect(refreshed.access_token).not.toBe(first.access_token);
    expect(refreshed.refresh_token).not.toBe(first.refresh_token);
    await expect(
      provider.exchangeRefreshToken(CLIENT, first.refresh_token!)
    ).rejects.toThrow();
  });

  it("completeLogin() REJECTS replaying an already-consumed state", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: [],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    await provider.completeLogin({
      googleCode: "goodcode",
      state: googleState,
    });
    await expect(
      provider.completeLogin({ googleCode: "goodcode", state: googleState })
    ).rejects.toThrow(/expired or unknown/i);
  });

  it("exchangeRefreshToken() REJECTS a refresh token presented by a different client", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: ["offline_access"],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(
      await provider.completeLogin({
        googleCode: "goodcode",
        state: googleState,
      })
    ).searchParams.get("code")!;
    const first = await provider.exchangeAuthorizationCode(CLIENT, code);
    const otherClient = {
      ...CLIENT,
      client_id: "other-client",
    } as OAuthClientInformationFull;
    await expect(
      provider.exchangeRefreshToken(otherClient, first.refresh_token!)
    ).rejects.toThrow(/invalid refresh token/i);
  });

  it("exchangeRefreshToken does NOT broaden scope beyond the original grant", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    // original grant: only "offline_access"
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: ["offline_access"],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(
      await provider.completeLogin({
        googleCode: "goodcode",
        state: googleState,
      })
    ).searchParams.get("code")!;
    const first = await provider.exchangeAuthorizationCode(CLIENT, code);
    // refresh requesting a BROADER scope set
    const refreshed = await provider.exchangeRefreshToken(
      CLIENT,
      first.refresh_token!,
      ["offline_access", "email", "admin"]
    );
    const granted = (refreshed.scope ?? "").split(" ").filter(Boolean).sort();
    expect(granted).toEqual(["offline_access"]); // intersection only; no elevation
  });

  it("exchangeAuthorizationCode() REJECTS an expired code", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(
      CLIENT,
      {
        codeChallenge: "CH",
        redirectUri: CLIENT.redirect_uris[0],
        scopes: [],
        state: "cs",
      },
      res
    );
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(
      await provider.completeLogin({
        googleCode: "goodcode",
        state: googleState,
      })
    ).searchParams.get("code")!;
    vi.setSystemTime(new Date("2026-06-07T12:10:00Z")); // > CODE_TTL_MS (5 min)
    await expect(
      provider.exchangeAuthorizationCode(CLIENT, code)
    ).rejects.toThrow(/invalid authorization code/i);
  });
});

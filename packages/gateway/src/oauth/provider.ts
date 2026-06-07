import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Store } from "../store/types.js";
import type { IdentityProvider } from "../identity/types.js";

const LOGIN_TTL_MS = 10 * 60 * 1000; // 10 min
const CODE_TTL_MS = 5 * 60 * 1000; // 5 min

export interface OfocusOAuthProviderOptions {
  store: Store;
  identity: IdentityProvider;
  allowedEmails: string[];
  callbackUrl: string;
  accessTokenTtlSeconds: number;
}

export class OfocusOAuthProvider implements OAuthServerProvider {
  private readonly allowed: Set<string>;

  constructor(private readonly opts: OfocusOAuthProviderOptions) {
    this.allowed = new Set(opts.allowedEmails.map((e) => e.toLowerCase()));
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    const store = this.opts.store;
    return {
      getClient: (id) => store.getClient(id),
      registerClient: async (
        client: Omit<
          OAuthClientInformationFull,
          "client_id" | "client_id_issued_at"
        >
      ): Promise<OAuthClientInformationFull> => {
        const full: OAuthClientInformationFull = {
          ...client,
          client_id: randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        } as OAuthClientInformationFull;
        await store.putClient(full);
        return full;
      },
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const state = randomUUID();
    await this.opts.store.putLoginState({
      state,
      clientId: client.client_id,
      clientRedirectUri: params.redirectUri,
      clientState: params.state,
      codeChallenge: params.codeChallenge,
      scopes: params.scopes ?? [],
      resource: params.resource?.toString(),
      expiresAt: Date.now() + LOGIN_TTL_MS,
    });
    res.redirect(
      this.opts.identity.buildAuthorizationUrl({
        state,
        redirectUri: this.opts.callbackUrl,
      })
    );
  }

  /**
   * Called by the Google callback route (NOT part of the SDK OAuthServerProvider interface).
   * Verifies the user identity, enforces the email allowlist, mints a one-time authorization
   * code bound to the original PKCE challenge, and returns the redirect URL back to the MCP client.
   */
  async completeLogin(args: {
    googleCode: string;
    state: string;
  }): Promise<string> {
    const login = await this.opts.store.takeLoginState(args.state);
    if (!login || login.expiresAt < Date.now()) {
      throw new Error("login session expired or unknown");
    }
    const email = await this.opts.identity.exchangeCodeForEmail({
      code: args.googleCode,
      redirectUri: this.opts.callbackUrl,
    });
    if (!this.allowed.has(email.toLowerCase())) {
      throw new Error(`account ${email} is not authorized`);
    }
    const code = randomUUID();
    await this.opts.store.putPendingAuthorization({
      code,
      clientId: login.clientId,
      redirectUri: login.clientRedirectUri,
      codeChallenge: login.codeChallenge,
      scopes: login.scopes,
      resource: login.resource,
      email,
      expiresAt: Date.now() + CODE_TTL_MS,
    });
    const back = new URL(login.clientRedirectUri);
    back.searchParams.set("code", code);
    if (login.clientState !== undefined)
      back.searchParams.set("state", login.clientState);
    return back.toString();
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const pending =
      await this.opts.store.getPendingAuthorization(authorizationCode);
    if (!pending) throw new Error("unknown authorization code");
    return pending.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const pending =
      await this.opts.store.takePendingAuthorization(authorizationCode);
    if (!pending || pending.expiresAt < Date.now())
      throw new Error("invalid authorization code");
    if (pending.clientId !== client.client_id)
      throw new Error("client mismatch");
    return this.issueTokens(pending.clientId, pending.scopes, pending.email);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    const existing = await this.opts.store.getTokenByRefreshToken(refreshToken);
    if (existing?.clientId !== client.client_id)
      throw new Error("invalid refresh token");
    await this.opts.store.deleteToken(existing.accessToken);
    return this.issueTokens(
      existing.clientId,
      scopes ?? existing.scopes,
      existing.email
    );
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = await this.opts.store.getTokenByAccessToken(token);
    if (!stored) throw new Error("invalid token");
    if (stored.accessTokenExpiresAt < Date.now()) {
      await this.opts.store.deleteToken(token);
      throw new Error("token expired");
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.accessTokenExpiresAt / 1000),
      extra: { email: stored.email },
    };
  }

  private async issueTokens(
    clientId: string,
    scopes: string[],
    email: string
  ): Promise<OAuthTokens> {
    const accessToken = randomUUID() + randomUUID();
    const refreshToken = randomUUID() + randomUUID();
    const ttl = this.opts.accessTokenTtlSeconds;
    await this.opts.store.putToken({
      accessToken,
      refreshToken,
      clientId,
      scopes,
      email,
      accessTokenExpiresAt: Date.now() + ttl * 1000,
    });
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ttl,
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    };
  }
}

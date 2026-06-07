import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

export interface LoginState {
  state: string; // the `state` we send to Google
  clientId: string;
  clientRedirectUri: string;
  clientState?: string; // the MCP client's own `state`
  codeChallenge: string; // S256 challenge from the MCP client
  scopes: string[];
  resource?: string;
  expiresAt: number; // epoch ms
}

export interface PendingAuthorization {
  code: string; // our authorization code
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  email: string; // authenticated principal
  expiresAt: number; // epoch ms
}

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  scopes: string[];
  email: string;
  accessTokenExpiresAt: number; // epoch ms
}

export interface Store {
  // clients (DCR)
  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined>;
  putClient(client: OAuthClientInformationFull): Promise<void>;
  // login states
  putLoginState(s: LoginState): Promise<void>;
  takeLoginState(state: string): Promise<LoginState | undefined>; // one-time read+delete
  // pending authorizations
  putPendingAuthorization(p: PendingAuthorization): Promise<void>;
  getPendingAuthorization(
    code: string
  ): Promise<PendingAuthorization | undefined>;
  takePendingAuthorization(
    code: string
  ): Promise<PendingAuthorization | undefined>;
  // tokens
  putToken(t: StoredToken): Promise<void>;
  getTokenByAccessToken(token: string): Promise<StoredToken | undefined>;
  getTokenByRefreshToken(token: string): Promise<StoredToken | undefined>;
  deleteToken(accessToken: string): Promise<void>;
}

import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import type {
  Store,
  LoginState,
  PendingAuthorization,
  StoredToken,
} from "./types.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

interface Data {
  clients: Record<string, OAuthClientInformationFull>;
  loginStates: Record<string, LoginState>;
  pending: Record<string, PendingAuthorization>;
  tokensByAccess: Record<string, StoredToken>;
}

const EMPTY: Data = {
  clients: {},
  loginStates: {},
  pending: {},
  tokensByAccess: {},
};

/** Remove a key from a record, returning a new record without it. */
function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _dropped, ...rest } = record;
  return rest;
}

/**
 * Durable single-file JSON store. Single-user scale: the whole dataset is held
 * in memory and rewritten atomically on each mutation. The `Store` interface is
 * the seam for swapping in SQLite later without touching callers.
 */
export class FileStore implements Store {
  private readonly path: string;
  private data: Data;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, "gateway-state.json");
    this.data = existsSync(this.path)
      ? {
          ...EMPTY,
          ...(JSON.parse(readFileSync(this.path, "utf8")) as Data),
        }
      : structuredClone(EMPTY);
  }

  private flush(): void {
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), "utf8");
    renameSync(tmp, this.path); // atomic on same filesystem
  }

  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return Promise.resolve(this.data.clients[clientId]);
  }

  putClient(client: OAuthClientInformationFull): Promise<void> {
    this.data.clients[client.client_id] = client;
    this.flush();
    return Promise.resolve();
  }

  putLoginState(s: LoginState): Promise<void> {
    this.data.loginStates[s.state] = s;
    this.flush();
    return Promise.resolve();
  }

  takeLoginState(state: string): Promise<LoginState | undefined> {
    const s = this.data.loginStates[state];
    if (s !== undefined) {
      this.data.loginStates = omit(this.data.loginStates, state);
      this.flush();
    }
    return Promise.resolve(s);
  }

  putPendingAuthorization(p: PendingAuthorization): Promise<void> {
    this.data.pending[p.code] = p;
    this.flush();
    return Promise.resolve();
  }

  getPendingAuthorization(
    code: string
  ): Promise<PendingAuthorization | undefined> {
    return Promise.resolve(this.data.pending[code]);
  }

  takePendingAuthorization(
    code: string
  ): Promise<PendingAuthorization | undefined> {
    const p = this.data.pending[code];
    if (p !== undefined) {
      this.data.pending = omit(this.data.pending, code);
      this.flush();
    }
    return Promise.resolve(p);
  }

  putToken(t: StoredToken): Promise<void> {
    this.data.tokensByAccess[t.accessToken] = t;
    this.flush();
    return Promise.resolve();
  }

  getTokenByAccessToken(token: string): Promise<StoredToken | undefined> {
    return Promise.resolve(this.data.tokensByAccess[token]);
  }

  getTokenByRefreshToken(token: string): Promise<StoredToken | undefined> {
    return Promise.resolve(
      Object.values(this.data.tokensByAccess).find(
        (t) => t.refreshToken === token
      )
    );
  }

  deleteToken(accessToken: string): Promise<void> {
    if (this.data.tokensByAccess[accessToken] !== undefined) {
      this.data.tokensByAccess = omit(this.data.tokensByAccess, accessToken);
      this.flush();
    }
    return Promise.resolve();
  }
}

# `@ofocus/gateway` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new monorepo package `@ofocus/gateway` that exposes the OmniFocus MCP server to claude.ai and ChatGPT as a remote MCP connector over Streamable HTTP with OAuth 2.1, then deploy it on the Ventura macOS VM behind a Cloudflare Tunnel.

**Architecture:** A Node/Express server hosts (a) the MCP SDK's `StreamableHTTPServerTransport` at `/mcp`, backed by an in-process `@ofocus/mcp` server, and (b) a spec-compliant OAuth 2.1 layer built from the SDK's `mcpAuthRouter` + a custom `OAuthServerProvider`. The provider delegates the human login step to Google OIDC and only issues tokens to a single allow-listed email. Exposure is via `cloudflared` (outbound tunnel) — no inbound port-forward.

**Tech Stack:** TypeScript (ESM, Node ≥20), Express, `@modelcontextprotocol/sdk@^1.26`, `google-auth-library`, `zod`, Vitest. pnpm workspace. `cloudflared` + launchd for deployment.

**Spec:** [`docs/specs/2026-06-07-mcp-gateway-design.md`](../specs/2026-06-07-mcp-gateway-design.md)

**Notes for the implementer:**
- This plan has two phases. **Phase A (Tasks 1–9)** builds and tests the software — fully local, TDD, no external accounts needed (Google is stubbed in tests). **Phase B (Tasks 10–13)** is an operational runbook (not TDD) that provisions Google credentials, the VM, and the tunnel. Phase A produces working, testable software on its own; do it first and confirm green before Phase B.
- All work happens in the worktree at `.worktrees/mcp-gateway` on branch `feat/mcp-gateway`.
- Commit author: `Mike North <michael.l.north@gmail.com>` (personal GitHub remote). Use `git commit --author="Mike North <michael.l.north@gmail.com>"`. No AI attribution trailers.
- Run commands from the package dir `packages/gateway` unless stated. Build the workspace first so `@ofocus/mcp` / `@ofocus/sdk` are resolvable: from repo root run `pnpm install` then `pnpm build`.

---

## File Structure

```
packages/gateway/
  package.json                 # @ofocus/gateway manifest
  tsconfig.json                # extends ../../tsconfig.base.json
  vitest.config.ts
  src/
    index.ts                   # bin entry: load config, build app, listen
    config.ts                  # zod-validated env config loader
    version.ts                 # read version from package.json (no hardcode)
    store/
      types.ts                 # Store interface + record types
      fileStore.ts             # durable JSON-file implementation
    identity/
      types.ts                 # IdentityProvider interface
      google.ts                # GoogleIdentityProvider (google-auth-library)
    oauth/
      provider.ts              # OfocusOAuthProvider implements OAuthServerProvider
      googleCallback.ts        # GET /auth/google/callback express handler
    mcp/
      gatedServer.ts           # createGatedServer(): tool-exposure gate via Proxy
    app.ts                     # buildApp(): assembles express app (auth + /mcp)
  tests/
    config.test.ts
    store/fileStore.test.ts
    identity/fakeIdentity.ts   # test double for IdentityProvider
    oauth/provider.test.ts
    mcp/gatedServer.test.ts
    app.integration.test.ts
    uat/oauthDance.uat.test.ts
  deploy/
    com.ofocus.gateway.plist
    com.ofocus.cloudflared.plist
    README.md                  # Phase B runbook (generated in Task 10–13)
```

Responsibilities are split by concern: config, persistence, identity, OAuth logic, the MCP tool-gate, and HTTP assembly are each isolated and independently testable. `app.ts` is the only file that wires them together.

---

## Phase A — The `@ofocus/gateway` software

### Task 1: Scaffold the package

**Files:**
- Create: `packages/gateway/package.json`
- Create: `packages/gateway/tsconfig.json`
- Create: `packages/gateway/vitest.config.ts`
- Create: `packages/gateway/src/version.ts`
- Create: `packages/gateway/tests/.gitkeep`

- [ ] **Step 1: Inspect an existing package for conventions**

Run: `cat packages/mcp/tsconfig.json packages/mcp/package.json`
Expected: see how `tsconfig.base.json` is extended, `composite`/`references`, and the `bin`/`exports` shape. Mirror it.

- [ ] **Step 2: Write `packages/gateway/package.json`**

```json
{
  "name": "@ofocus/gateway",
  "version": "0.1.0",
  "description": "Remote-MCP gateway exposing OmniFocus to claude.ai and ChatGPT over OAuth 2.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": { "ofocus-gateway": "./dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:watch": "vitest"
  },
  "author": "Mike North",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "@ofocus/mcp": "workspace:*",
    "express": "^4.21.2",
    "google-auth-library": "^9.15.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.13.4",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "typescript": "^5.9.3",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 3: Write `packages/gateway/tsconfig.json`** (match `packages/mcp/tsconfig.json`, adding the project references it uses)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../mcp" }]
}
```

- [ ] **Step 4: Write `packages/gateway/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Write `packages/gateway/src/version.ts`** (no hardcoded version, per repo rule)

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Reads this package's version from its package.json. */
export function getVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(dir, "..", "package.json"), "utf8"),
    ) as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
```

- [ ] **Step 6: Install and build**

Run (from repo root): `pnpm install && pnpm build`
Expected: install succeeds, the new package compiles (empty but for `version.ts`), no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/gateway pnpm-lock.yaml
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(gateway): scaffold @ofocus/gateway package"
```

---

### Task 2: Config loader

**Files:**
- Create: `packages/gateway/src/config.ts`
- Test: `packages/gateway/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(cfg.exposedTools).toEqual(new Set(["tasks_list", "search", "forecast"]));
  });

  it("rejects a missing required var", () => {
    const { OFOCUS_GATEWAY_GOOGLE_CLIENT_ID: _omit, ...rest } = base;
    expect(() => loadConfig(rest)).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("rejects a non-https issuer url", () => {
    expect(() =>
      loadConfig({ ...base, OFOCUS_GATEWAY_ISSUER_URL: "http://insecure" }),
    ).toThrow(/https/);
  });

  it("rejects an empty allowlist", () => {
    expect(() =>
      loadConfig({ ...base, OFOCUS_GATEWAY_ALLOWED_EMAILS: "" }),
    ).toThrow(/allow/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/gateway && pnpm vitest run tests/config.test.ts`
Expected: FAIL — `loadConfig` not found.

- [ ] **Step 3: Write `src/config.ts`**

```ts
import { z } from "zod";

export interface GatewayConfig {
  issuerUrl: URL;
  port: number;
  googleClientId: string;
  googleClientSecret: string;
  allowedEmails: string[];
  stateDir: string;
  exposedTools: "all" | Set<string>;
  accessTokenTtlSeconds: number;
}

const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://"), { message: "must be an https url" });

const csv = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);

const envSchema = z.object({
  OFOCUS_GATEWAY_ISSUER_URL: httpsUrl,
  OFOCUS_GATEWAY_PORT: z.coerce.number().int().positive().default(8722),
  OFOCUS_GATEWAY_GOOGLE_CLIENT_ID: z.string().min(1),
  OFOCUS_GATEWAY_GOOGLE_CLIENT_SECRET: z.string().min(1),
  OFOCUS_GATEWAY_ALLOWED_EMAILS: z.string(),
  OFOCUS_GATEWAY_STATE_DIR: z.string().min(1),
  OFOCUS_GATEWAY_EXPOSED_TOOLS: z.string().optional(),
  OFOCUS_GATEWAY_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});

/** Validate and normalize the process environment into a GatewayConfig. */
export function loadConfig(env: Record<string, string | undefined>): GatewayConfig {
  const parsed = envSchema.parse(env);

  const allowedEmails = csv(parsed.OFOCUS_GATEWAY_ALLOWED_EMAILS).map((e) =>
    e.toLowerCase(),
  );
  if (allowedEmails.length === 0) {
    throw new Error("OFOCUS_GATEWAY_ALLOWED_EMAILS must list at least one allowed email");
  }

  const toolsRaw = parsed.OFOCUS_GATEWAY_EXPOSED_TOOLS?.trim();
  const exposedTools: "all" | Set<string> =
    !toolsRaw || toolsRaw === "all" ? "all" : new Set(csv(toolsRaw));

  return {
    issuerUrl: new URL(parsed.OFOCUS_GATEWAY_ISSUER_URL),
    port: parsed.OFOCUS_GATEWAY_PORT,
    googleClientId: parsed.OFOCUS_GATEWAY_GOOGLE_CLIENT_ID,
    googleClientSecret: parsed.OFOCUS_GATEWAY_GOOGLE_CLIENT_SECRET,
    allowedEmails,
    stateDir: parsed.OFOCUS_GATEWAY_STATE_DIR,
    exposedTools,
    accessTokenTtlSeconds: parsed.OFOCUS_GATEWAY_ACCESS_TOKEN_TTL_SECONDS,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/gateway && pnpm vitest run tests/config.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/config.ts packages/gateway/tests/config.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(gateway): zod-validated config loader"
```

---

### Task 3: Persistence store

The store holds three record kinds: registered OAuth clients (DCR), pending authorizations (our one-time codes + their PKCE challenge), login states (the round-trip to Google), and issued tokens. It must survive restarts.

**Files:**
- Create: `packages/gateway/src/store/types.ts`
- Create: `packages/gateway/src/store/fileStore.ts`
- Test: `packages/gateway/tests/store/fileStore.test.ts`

- [ ] **Step 1: Write `src/store/types.ts`**

```ts
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
  getPendingAuthorization(code: string): Promise<PendingAuthorization | undefined>;
  takePendingAuthorization(code: string): Promise<PendingAuthorization | undefined>;
  // tokens
  putToken(t: StoredToken): Promise<void>;
  getTokenByAccessToken(token: string): Promise<StoredToken | undefined>;
  getTokenByRefreshToken(token: string): Promise<StoredToken | undefined>;
  deleteToken(accessToken: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test**

```ts
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
      state: "s1", clientId: "c1", clientRedirectUri: "https://claude.ai/cb",
      codeChallenge: "ch", scopes: [], expiresAt: FIXED + 60000,
    });
    expect((await store.takeLoginState("s1"))?.clientId).toBe("c1");
    expect(await store.takeLoginState("s1")).toBeUndefined(); // consumed
  });

  it("takePendingAuthorization is one-time", async () => {
    await store.putPendingAuthorization({
      code: "code1", clientId: "c1", redirectUri: "https://claude.ai/cb",
      codeChallenge: "ch", scopes: [], email: "a@b.com", expiresAt: FIXED + 60000,
    });
    expect((await store.takePendingAuthorization("code1"))?.email).toBe("a@b.com");
    expect(await store.takePendingAuthorization("code1")).toBeUndefined();
  });

  it("looks tokens up by access and refresh token, and deletes", async () => {
    await store.putToken({
      accessToken: "at", refreshToken: "rt", clientId: "c1",
      scopes: ["offline_access"], email: "a@b.com", accessTokenExpiresAt: FIXED + 3600000,
    });
    expect((await store.getTokenByAccessToken("at"))?.refreshToken).toBe("rt");
    expect((await store.getTokenByRefreshToken("rt"))?.accessToken).toBe("at");
    await store.deleteToken("at");
    expect(await store.getTokenByAccessToken("at")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/gateway && pnpm vitest run tests/store/fileStore.test.ts`
Expected: FAIL — `FileStore` not found.

- [ ] **Step 4: Write `src/store/fileStore.ts`** (atomic write; in-memory index loaded from one JSON file)

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
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

const EMPTY: Data = { clients: {}, loginStates: {}, pending: {}, tokensByAccess: {} };

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
      ? { ...EMPTY, ...(JSON.parse(readFileSync(this.path, "utf8")) as Data) }
      : structuredClone(EMPTY);
  }

  private flush(): void {
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), "utf8");
    renameSync(tmp, this.path); // atomic on same filesystem
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.data.clients[clientId];
  }
  async putClient(client: OAuthClientInformationFull): Promise<void> {
    this.data.clients[client.client_id] = client;
    this.flush();
  }

  async putLoginState(s: LoginState): Promise<void> {
    this.data.loginStates[s.state] = s;
    this.flush();
  }
  async takeLoginState(state: string): Promise<LoginState | undefined> {
    const s = this.data.loginStates[state];
    if (s) {
      delete this.data.loginStates[state];
      this.flush();
    }
    return s;
  }

  async putPendingAuthorization(p: PendingAuthorization): Promise<void> {
    this.data.pending[p.code] = p;
    this.flush();
  }
  async getPendingAuthorization(code: string): Promise<PendingAuthorization | undefined> {
    return this.data.pending[code];
  }
  async takePendingAuthorization(code: string): Promise<PendingAuthorization | undefined> {
    const p = this.data.pending[code];
    if (p) {
      delete this.data.pending[code];
      this.flush();
    }
    return p;
  }

  async putToken(t: StoredToken): Promise<void> {
    this.data.tokensByAccess[t.accessToken] = t;
    this.flush();
  }
  async getTokenByAccessToken(token: string): Promise<StoredToken | undefined> {
    return this.data.tokensByAccess[token];
  }
  async getTokenByRefreshToken(token: string): Promise<StoredToken | undefined> {
    return Object.values(this.data.tokensByAccess).find((t) => t.refreshToken === token);
  }
  async deleteToken(accessToken: string): Promise<void> {
    if (this.data.tokensByAccess[accessToken]) {
      delete this.data.tokensByAccess[accessToken];
      this.flush();
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/gateway && pnpm vitest run tests/store/fileStore.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/gateway/src/store packages/gateway/tests/store
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(gateway): durable file-backed store for clients, codes, tokens"
```

---

### Task 4: Identity provider (Google) + test double

The provider abstracts "given a Google authorization code, return the verified email." A real implementation uses `google-auth-library`; tests use a fake.

**Files:**
- Create: `packages/gateway/src/identity/types.ts`
- Create: `packages/gateway/src/identity/google.ts`
- Create: `packages/gateway/tests/identity/fakeIdentity.ts`

- [ ] **Step 1: Write `src/identity/types.ts`**

```ts
export interface IdentityProvider {
  /**
   * Build the upstream authorization URL the user is redirected to in order to log in.
   * `state` is opaque round-trip data; `redirectUri` is this gateway's callback.
   */
  buildAuthorizationUrl(params: { state: string; redirectUri: string }): string;
  /**
   * Exchange the upstream authorization `code` for the authenticated user's email.
   * Throws if the code is invalid or no verified email is present.
   */
  exchangeCodeForEmail(params: { code: string; redirectUri: string }): Promise<string>;
}
```

- [ ] **Step 2: Write `src/identity/google.ts`**

```ts
import { OAuth2Client } from "google-auth-library";
import type { IdentityProvider } from "./types.js";

export class GoogleIdentityProvider implements IdentityProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  buildAuthorizationUrl(params: { state: string; redirectUri: string }): string {
    const client = new OAuth2Client(this.clientId, this.clientSecret, params.redirectUri);
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["openid", "email"],
      state: params.state,
    });
  }

  async exchangeCodeForEmail(params: { code: string; redirectUri: string }): Promise<string> {
    const client = new OAuth2Client(this.clientId, this.clientSecret, params.redirectUri);
    const { tokens } = await client.getToken(params.code);
    if (!tokens.id_token) throw new Error("Google did not return an id_token");
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified !== true) {
      throw new Error("Google profile has no verified email");
    }
    return payload.email.toLowerCase();
  }
}
```

- [ ] **Step 3: Write `tests/identity/fakeIdentity.ts`** (reusable test helper)

```ts
import type { IdentityProvider } from "../../src/identity/types.js";

/** Deterministic IdentityProvider double. Maps a fixed code → email. */
export class FakeIdentityProvider implements IdentityProvider {
  constructor(private readonly codeToEmail: Record<string, string>) {}

  buildAuthorizationUrl(params: { state: string; redirectUri: string }): string {
    const u = new URL("https://accounts.google.test/o/oauth2/v2/auth");
    u.searchParams.set("state", params.state);
    u.searchParams.set("redirect_uri", params.redirectUri);
    return u.toString();
  }

  async exchangeCodeForEmail(params: { code: string }): Promise<string> {
    const email = this.codeToEmail[params.code];
    if (!email) throw new Error("invalid google code");
    return email.toLowerCase();
  }
}
```

- [ ] **Step 4: Build to typecheck**

Run (repo root): `pnpm build`
Expected: compiles. (No unit test for `google.ts` itself — it's a thin wrapper exercised via the integration/UAT tasks with the fake; the real Google path is verified manually in Phase B.)

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/identity packages/gateway/tests/identity
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(gateway): IdentityProvider abstraction with Google impl + test double"
```

---

### Task 5: OAuth provider

`OfocusOAuthProvider` implements the SDK's `OAuthServerProvider`. The Google round-trip lands on a separate callback route (Task 7) that calls `completeLogin()` here.

**Files:**
- Create: `packages/gateway/src/oauth/provider.ts`
- Test: `packages/gateway/tests/oauth/provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
  const idp = new FakeIdentityProvider({ goodcode: "michael.l.north@gmail.com", badcode: "stranger@evil.com" });
  const provider = new OfocusOAuthProvider({
    store,
    identity: idp,
    allowedEmails: emails,
    callbackUrl: "https://ofocus.huangnorth.com/auth/google/callback",
    accessTokenTtlSeconds: 3600,
  });
  return { provider, store };
}

/** Capture res.redirect(url). */
function fakeRes() {
  const calls: string[] = [];
  const res = { redirect: (url: string) => calls.push(url) } as unknown as Response;
  return { res, calls };
}

beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-06-07T12:00:00Z")));
afterEach(() => vi.useRealTimers());

describe("OfocusOAuthProvider", () => {
  it("authorize() redirects to the upstream IdP carrying our state", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(CLIENT, {
      codeChallenge: "CH", redirectUri: CLIENT.redirect_uris[0], scopes: ["offline_access"], state: "client-state",
    }, res);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(url.host).toBe("accounts.google.test");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("completeLogin() with an allow-listed email issues a code redirect to the client", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(CLIENT, { codeChallenge: "CH", redirectUri: CLIENT.redirect_uris[0], scopes: [], state: "cs" }, res);
    const googleState = new URL(calls[0]).searchParams.get("state")!;

    const redirect = await provider.completeLogin({ googleCode: "goodcode", state: googleState });
    const back = new URL(redirect);
    expect(back.origin + back.pathname).toBe(CLIENT.redirect_uris[0]);
    expect(back.searchParams.get("code")).toBeTruthy();
    expect(back.searchParams.get("state")).toBe("cs"); // the client's original state
  });

  it("completeLogin() REJECTS a non-allow-listed email", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(CLIENT, { codeChallenge: "CH", redirectUri: CLIENT.redirect_uris[0], scopes: [], state: "cs" }, res);
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    await expect(provider.completeLogin({ googleCode: "badcode", state: googleState })).rejects.toThrow(/not authorized/i);
  });

  it("challengeForAuthorizationCode returns the original PKCE challenge", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(CLIENT, { codeChallenge: "CH", redirectUri: CLIENT.redirect_uris[0], scopes: [], state: "cs" }, res);
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(await provider.completeLogin({ googleCode: "goodcode", state: googleState })).searchParams.get("code")!;
    expect(await provider.challengeForAuthorizationCode(CLIENT, code)).toBe("CH");
  });

  it("exchangeAuthorizationCode issues tokens once; the code is single-use", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(CLIENT, { codeChallenge: "CH", redirectUri: CLIENT.redirect_uris[0], scopes: ["offline_access"], state: "cs" }, res);
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(await provider.completeLogin({ googleCode: "goodcode", state: googleState })).searchParams.get("code")!;

    const tokens = await provider.exchangeAuthorizationCode(CLIENT, code);
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    await expect(provider.exchangeAuthorizationCode(CLIENT, code)).rejects.toThrow();
  });

  it("verifyAccessToken returns AuthInfo for a valid token and rejects expired", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(CLIENT, { codeChallenge: "CH", redirectUri: CLIENT.redirect_uris[0], scopes: ["offline_access"], state: "cs" }, res);
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(await provider.completeLogin({ googleCode: "goodcode", state: googleState })).searchParams.get("code")!;
    const tokens = await provider.exchangeAuthorizationCode(CLIENT, code);

    const info = await provider.verifyAccessToken(tokens.access_token);
    expect(info.clientId).toBe("claude");
    expect(info.extra?.email).toBe("michael.l.north@gmail.com");

    vi.setSystemTime(new Date("2026-06-07T14:00:00Z")); // +2h > 1h TTL
    await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toThrow();
  });

  it("exchangeRefreshToken rotates the refresh token", async () => {
    const { provider, store } = makeProvider(["michael.l.north@gmail.com"]);
    await store.putClient(CLIENT);
    const { res, calls } = fakeRes();
    await provider.authorize(CLIENT, { codeChallenge: "CH", redirectUri: CLIENT.redirect_uris[0], scopes: ["offline_access"], state: "cs" }, res);
    const googleState = new URL(calls[0]).searchParams.get("state")!;
    const code = new URL(await provider.completeLogin({ googleCode: "goodcode", state: googleState })).searchParams.get("code")!;
    const first = await provider.exchangeAuthorizationCode(CLIENT, code);

    const refreshed = await provider.exchangeRefreshToken(CLIENT, first.refresh_token!);
    expect(refreshed.access_token).not.toBe(first.access_token);
    expect(refreshed.refresh_token).not.toBe(first.refresh_token);
    await expect(provider.exchangeRefreshToken(CLIENT, first.refresh_token!)).rejects.toThrow(); // old rotated out
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/gateway && pnpm vitest run tests/oauth/provider.test.ts`
Expected: FAIL — `OfocusOAuthProvider` not found.

- [ ] **Step 3: Write `src/oauth/provider.ts`**

```ts
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
  callbackUrl: string; // this gateway's /auth/google/callback (absolute)
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
      registerClient: async (client) => {
        const full = {
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
    res: Response,
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
      this.opts.identity.buildAuthorizationUrl({ state, redirectUri: this.opts.callbackUrl }),
    );
  }

  /**
   * Called by the Google callback route. Verifies the user, enforces the
   * allowlist, mints our one-time authorization code, and returns the URL to
   * redirect the browser back to the MCP client.
   */
  async completeLogin(args: { googleCode: string; state: string }): Promise<string> {
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
    if (login.clientState !== undefined) back.searchParams.set("state", login.clientState);
    return back.toString();
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const pending = await this.opts.store.getPendingAuthorization(authorizationCode);
    if (!pending) throw new Error("unknown authorization code");
    return pending.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const pending = await this.opts.store.takePendingAuthorization(authorizationCode);
    if (!pending || pending.expiresAt < Date.now()) throw new Error("invalid authorization code");
    if (pending.clientId !== client.client_id) throw new Error("client mismatch");
    return this.issueTokens(pending.clientId, pending.scopes, pending.email);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const existing = await this.opts.store.getTokenByRefreshToken(refreshToken);
    if (!existing || existing.clientId !== client.client_id) throw new Error("invalid refresh token");
    await this.opts.store.deleteToken(existing.accessToken); // rotate
    return this.issueTokens(existing.clientId, scopes ?? existing.scopes, existing.email);
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

  private async issueTokens(clientId: string, scopes: string[], email: string): Promise<OAuthTokens> {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/gateway && pnpm vitest run tests/oauth/provider.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/oauth/provider.ts packages/gateway/tests/oauth/provider.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(gateway): OAuth provider with Google delegation + email allowlist"
```

---

### Task 6: Tool-exposure gate

Wrap an `McpServer` so disallowed tools are registered-then-disabled — hidden from `tools/list` and rejected on call — without modifying `@ofocus/mcp`.

**Files:**
- Create: `packages/gateway/src/mcp/gatedServer.ts`
- Test: `packages/gateway/tests/mcp/gatedServer.test.ts`

- [ ] **Step 1: Write the failing test** (drives the server in-memory through the MCP client)

```ts
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createGatedServer } from "../../src/mcp/gatedServer.js";

async function listToolNames(exposed: "all" | Set<string>): Promise<string[]> {
  const server = createGatedServer(exposed, "0.0.0-test");
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(clientT);
  const { tools } = await client.listTools();
  return tools.map((t) => t.name).sort();
}

describe("createGatedServer", () => {
  it("'all' exposes the full tool set (sanity: includes a known tool)", async () => {
    const names = await listToolNames("all");
    expect(names).toContain("tasks_list");
    expect(names).toContain("inbox_add");
  });

  it("an allowlist exposes EXACTLY the allowed tools", async () => {
    const names = await listToolNames(new Set(["tasks_list", "search"]));
    expect(names).toEqual(["search", "tasks_list"]);
  });

  it("rejects INVOCATION of a tool omitted from the allowlist", async () => {
    const server = createGatedServer(new Set(["tasks_list"]), "0.0.0-test");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "t", version: "1" });
    await client.connect(clientT);
    await expect(client.callTool({ name: "inbox_add", arguments: { title: "x" } })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/gateway && pnpm vitest run tests/mcp/gatedServer.test.ts`
Expected: FAIL — `createGatedServer` not found.

- [ ] **Step 3: Write `src/mcp/gatedServer.ts`**

```ts
import { McpServer, type RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "@ofocus/mcp";

/**
 * Build an OmniFocus MCP server whose exposed tool set is filtered by `exposed`.
 * Disallowed tools are registered (so @ofocus/mcp stays untouched) then disabled,
 * which removes them from tools/list and makes invocation an error.
 */
export function createGatedServer(
  exposed: "all" | Set<string>,
  version: string,
): McpServer {
  const server = new McpServer({ name: "ofocus", version });

  if (exposed === "all") {
    registerAllTools(server);
    return server;
  }

  const allow = exposed;
  const gated = new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === "registerTool") {
        return (name: string, ...rest: unknown[]): RegisteredTool => {
          const handle = (
            target.registerTool as unknown as (
              n: string,
              ...r: unknown[]
            ) => RegisteredTool
          )(name, ...rest);
          if (!allow.has(name)) handle.disable();
          return handle;
        };
      }
      const value = Reflect.get(target, prop, receiver) as unknown;
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as McpServer;

  registerAllTools(gated);
  return server;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/gateway && pnpm vitest run tests/mcp/gatedServer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/mcp packages/gateway/tests/mcp
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(gateway): config-driven tool-exposure gate (no @ofocus/mcp change)"
```

---

### Task 7: HTTP app assembly + integration tests

Assemble Express: the SDK auth router (metadata + DCR + authorize + token), the Google callback route, and `/mcp` (bearer-protected, per-session Streamable HTTP).

**Files:**
- Create: `packages/gateway/src/oauth/googleCallback.ts`
- Create: `packages/gateway/src/app.ts`
- Test: `packages/gateway/tests/app.integration.test.ts`

- [ ] **Step 1: Write `src/oauth/googleCallback.ts`**

```ts
import type { RequestHandler } from "express";
import type { OfocusOAuthProvider } from "./provider.js";

/** GET /auth/google/callback?code=&state= — completes upstream login. */
export function googleCallbackHandler(provider: OfocusOAuthProvider): RequestHandler {
  return (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code || !state) {
      res.status(400).send("missing code or state");
      return;
    }
    provider
      .completeLogin({ googleCode: code, state })
      .then((redirectUrl) => res.redirect(redirectUrl))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "login failed";
        res.status(403).send(`Authorization denied: ${msg}`);
      });
  };
}
```

- [ ] **Step 2: Write `src/app.ts`**

```ts
import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { GatewayConfig } from "./config.js";
import type { Store } from "./store/types.js";
import type { IdentityProvider } from "./identity/types.js";
import { OfocusOAuthProvider } from "./oauth/provider.js";
import { googleCallbackHandler } from "./oauth/googleCallback.js";
import { createGatedServer } from "./mcp/gatedServer.js";

export interface BuildAppDeps {
  config: GatewayConfig;
  store: Store;
  identity: IdentityProvider;
  version: string;
}

export function buildApp(deps: BuildAppDeps): Express {
  const { config, store, identity, version } = deps;
  const app = express();

  const callbackUrl = new URL("/auth/google/callback", config.issuerUrl).toString();
  const provider = new OfocusOAuthProvider({
    store,
    identity,
    allowedEmails: config.allowedEmails,
    callbackUrl,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
  });

  // Health check (unauthenticated)
  app.get("/healthz", (_req, res) => res.json({ ok: true, version }));

  // Upstream login callback (must be before the auth router's body parsing concerns; it's a GET)
  app.get("/auth/google/callback", googleCallbackHandler(provider));

  // OAuth 2.1 AS + RS metadata, DCR, /authorize, /token, /revoke
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: config.issuerUrl,
      scopesSupported: ["openid", "email", "offline_access"],
      resourceName: "OmniFocus (ofocus)",
    }),
  );

  // Protected MCP endpoint
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(config.issuerUrl);
  const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl });

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", bearer, express.json(), async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "No valid session; send an initialize request first" },
          id: null,
        });
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => transports.set(sid, transport!),
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      const server = createGatedServer(config.exposedTools, version);
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  const sessionStream: express.RequestHandler = async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", bearer, sessionStream);
  app.delete("/mcp", bearer, sessionStream);

  return app;
}
```

- [ ] **Step 3: Write the failing integration test**

```ts
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
      identity: new FakeIdentityProvider({ goodcode: "michael.l.north@gmail.com" }),
      version: "0.0.0-test",
    });
  });

  it("serves protected-resource metadata pointing at the AS", async () => {
    const res = await request(app).get("/.well-known/oauth-protected-resource");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.authorization_servers)).toBe(true);
  });

  it("serves AS metadata advertising S256 PKCE and refresh_token", async () => {
    const res = await request(app).get("/.well-known/oauth-authorization-server");
    expect(res.status).toBe(200);
    expect(res.body.code_challenge_methods_supported).toContain("S256");
    expect(res.body.grant_types_supported).toContain("refresh_token");
  });

  it("rejects /mcp with no bearer token (401 + WWW-Authenticate → resource metadata)", async () => {
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
```

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `cd packages/gateway && pnpm vitest run tests/app.integration.test.ts`
Expected: first FAIL (module not found), then after Steps 1–2 exist, PASS (5 tests). If a metadata field name differs, read `node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/handlers/metadata.*` and assert the real field names (still asserting S256 + refresh_token are present, per the MCP auth spec).

- [ ] **Step 5: Build the whole workspace**

Run (repo root): `pnpm build`
Expected: clean compile.

- [ ] **Step 6: Commit**

```bash
git add packages/gateway/src/app.ts packages/gateway/src/oauth/googleCallback.ts packages/gateway/tests/app.integration.test.ts
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(gateway): assemble express app (auth router + protected /mcp)"
```

---

### Task 8: Entry point (bin)

**Files:**
- Create: `packages/gateway/src/index.ts`

- [ ] **Step 1: Write `src/index.ts`**

```ts
#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { FileStore } from "./store/fileStore.js";
import { GoogleIdentityProvider } from "./identity/google.js";
import { buildApp } from "./app.js";
import { getVersion } from "./version.js";

function main(): void {
  const version = getVersion();
  const config = loadConfig(process.env);
  const store = new FileStore(config.stateDir);
  const identity = new GoogleIdentityProvider(config.googleClientId, config.googleClientSecret);
  const app = buildApp({ config, store, identity, version });

  const exposed =
    config.exposedTools === "all" ? "all tools" : `${config.exposedTools.size} tools`;
  app.listen(config.port, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.error(
      `ofocus-gateway v${version} on http://127.0.0.1:${config.port} ` +
        `(issuer ${config.issuerUrl.toString()}, exposing ${exposed})`,
    );
  });
}

main();
```

- [ ] **Step 2: Build and smoke-run with a bad env (should fail fast)**

Run (repo root): `pnpm build && node packages/gateway/dist/index.js`
Expected: exits non-zero with a zod validation error naming the missing vars (proves config validation gates startup).

- [ ] **Step 3: Smoke-run with a valid env (should listen)**

Run:
```bash
OFOCUS_GATEWAY_ISSUER_URL=https://ofocus.huangnorth.com \
OFOCUS_GATEWAY_GOOGLE_CLIENT_ID=x OFOCUS_GATEWAY_GOOGLE_CLIENT_SECRET=y \
OFOCUS_GATEWAY_ALLOWED_EMAILS=michael.l.north@gmail.com \
OFOCUS_GATEWAY_STATE_DIR=/tmp/ofocus-gw-smoke \
node packages/gateway/dist/index.js
```
Expected: prints the startup line and listens. `curl -s localhost:8722/healthz` returns `{"ok":true,...}`. Ctrl-C to stop.

- [ ] **Step 4: Commit**

```bash
git add packages/gateway/src/index.ts
git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(gateway): bin entry point"
```

---

### Task 9: UAT — full OAuth dance end-to-end (stubbed Google)

Drive the real HTTP surface through a complete authorization_code+PKCE flow using the fake IdP, then make an authenticated MCP `tools/list` call — exactly what claude.ai/ChatGPT do, minus Google itself.

**Files:**
- Test: `packages/gateway/tests/uat/oauthDance.uat.test.ts`

- [ ] **Step 1: Write the UAT**

```ts
/**
 * UAT: exercises the gateway exactly as a remote MCP client would — DCR, the
 * authorization_code + PKCE flow (with Google stubbed), token exchange, and an
 * authenticated MCP call over real HTTP.
 *
 * @see https://modelcontextprotocol.io/specification/draft/basic/authorization
 * @see RFC 7636 (PKCE), RFC 7591 (DCR)
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { buildApp } from "../../src/app.js";
import { FileStore } from "../../src/store/fileStore.js";
import { FakeIdentityProvider } from "../identity/fakeIdentity.js";
import type { GatewayConfig } from "../../src/config.js";

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

let server: Server;
afterAll(() => server?.close());

describe("UAT: end-to-end OAuth + MCP", () => {
  let baseUrl: string;
  let allowedEmail: string;

  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), "ofocus-gw-uat-"));
    allowedEmail = "michael.l.north@gmail.com";
    const config: GatewayConfig = {
      issuerUrl: new URL("http://127.0.0.1:0"), // overwritten below once we know the port
      port: 0, googleClientId: "gid", googleClientSecret: "gsecret",
      allowedEmails: [allowedEmail], stateDir: dir, exposedTools: "all",
      accessTokenTtlSeconds: 3600,
    };
    // Bind first to learn the port, then rebuild app with a matching issuer.
    const probe = buildApp({
      config, store: new FileStore(dir),
      identity: new FakeIdentityProvider({ goodcode: allowedEmail, badcode: "stranger@evil.com" }),
      version: "uat",
    });
    await new Promise<void>((r) => { server = probe.listen(0, "127.0.0.1", r); });
    const port = (server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    // NOTE: issuer host/port now matches baseUrl because authorize() builds the
    // client redirect from stored values, not the issuer; metadata uses issuerUrl.
  });

  it("completes DCR → authorize → callback → token → authenticated tools/list", async () => {
    // 1) Dynamic client registration
    const reg = await fetch(`${baseUrl}/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [`${baseUrl}/test-client-callback`],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    });
    expect(reg.status).toBe(201);
    const client = (await reg.json()) as { client_id: string };

    // 2) /authorize with PKCE — follow the redirect to the (fake) Google URL
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

    // 3) Simulate Google redirecting back to our callback with a good code
    const cbRes = await fetch(
      `${baseUrl}/auth/google/callback?code=goodcode&state=${googleState}`,
      { redirect: "manual" },
    );
    expect(cbRes.status).toBeGreaterThanOrEqual(300);
    const clientCb = new URL(cbRes.headers.get("location")!);
    expect(clientCb.searchParams.get("state")).toBe("client-xyz");
    const code = clientCb.searchParams.get("code")!;

    // 4) Token exchange with the PKCE verifier
    const tokRes = await fetch(`${baseUrl}/token`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code,
        client_id: client.client_id, redirect_uri: `${baseUrl}/test-client-callback`,
        code_verifier: verifier,
      }),
    });
    expect(tokRes.status).toBe(200);
    const tokens = (await tokRes.json()) as { access_token: string };
    expect(tokens.access_token).toBeTruthy();

    // 5) Authenticated MCP initialize + tools/list over HTTP
    const initRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "uat", version: "1" } },
      }),
    });
    expect(initRes.status).toBe(200);
    expect(initRes.headers.get("mcp-session-id")).toBeTruthy();
  });

  it("denies a non-allow-listed Google account (no token issued)", async () => {
    const reg = await (await fetch(`${baseUrl}/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [`${baseUrl}/cb`], token_endpoint_auth_method: "none" }),
    })).json() as { client_id: string };
    const { challenge } = pkce();
    const authUrl = new URL(`${baseUrl}/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", reg.client_id);
    authUrl.searchParams.set("redirect_uri", `${baseUrl}/cb`);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    const authRes = await fetch(authUrl, { redirect: "manual" });
    const googleState = new URL(authRes.headers.get("location")!).searchParams.get("state")!;
    const cbRes = await fetch(`${baseUrl}/auth/google/callback?code=badcode&state=${googleState}`, { redirect: "manual" });
    expect(cbRes.status).toBe(403); // denied, no redirect back to client
  });
});
```

- [ ] **Step 2: Run the UAT**

Run: `cd packages/gateway && pnpm vitest run tests/uat/oauthDance.uat.test.ts`
Expected: PASS (2 tests). If `/token` rejects PKCE, re-read `handlers/token.*` for the expected param names and adjust the request body (still S256). The assertion that matters: a valid verifier yields a token; the wrong email yields 403.

- [ ] **Step 3: Run the full package suite + lint**

Run (repo root): `pnpm build && pnpm -C packages/gateway test && pnpm lint`
Expected: all green.

- [ ] **Step 4: Add a changeset** (monorepo release convention)

Run: `pnpm changeset` → select `@ofocus/gateway` (minor), summary "New remote-MCP gateway package." Commit the generated file.

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/tests/uat .changeset
git commit --author="Mike North <michael.l.north@gmail.com>" -m "test(gateway): end-to-end OAuth + MCP UAT; add changeset"
```

- [ ] **Step 6: Final Phase-A verification**

Invoke `/clean_blt` (clean build, lint, test across the workspace). Fix anything red and re-run until clean before starting Phase B.

---

## Phase B — Deployment (operational runbook, not TDD)

> These tasks run on/against the **Ventura** macOS VM and external accounts. They are sequential checklists with verification steps, not unit tests. Produce `packages/gateway/deploy/README.md` capturing the exact commands as you go, so the runbook is reproducible.

### Task 10: Ventura macOS VM preparation

- [ ] **Step 1: Enable Remote Login (SSH)** — on Ventura: System Settings → General → Sharing → Remote Login = On. Verify from your machine: `ssh <user>@<ventura-ip> 'sw_vers'` returns the macOS version.
- [ ] **Step 2: Enable automatic login to the GUI session** — System Settings → Users & Groups → Automatically log in as `<user>`. Required because OmniFocus is a GUI app and the gateway must run inside a logged-in window-server session. Reboot and confirm the desktop comes up without manual login.
- [ ] **Step 3: Install OmniFocus, sign into Omni Sync, confirm the database loads** — verify your real tasks appear. Add OmniFocus to System Settings → General → Login Items so it relaunches on boot.
- [ ] **Step 4: Install Node ≥20 + pnpm** — e.g. `brew install node pnpm` (or nodenv to match the repo). Verify `node -v` ≥ 20.
- [ ] **Step 5: Grant Automation permission** — from a terminal on Ventura, run a one-off ofocus command that drives OmniFocus (e.g. `pnpm -C packages/gateway start` will later trigger it on first tool call; or run an `@ofocus/cli` read command). macOS shows an Automation prompt → Allow controlling **OmniFocus**. Verify under System Settings → Privacy & Security → Automation that your terminal/Node is allowed to control OmniFocus. (This is the permission that makes the whole thing work — without it every tool call fails.)
- [ ] **Step 6: Record** each step's exact commands/clicks in `deploy/README.md`.

### Task 11: Google OAuth client

- [ ] **Step 1:** In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** of type **Web application**.
- [ ] **Step 2:** Add authorized redirect URI: `https://ofocus.huangnorth.com/auth/google/callback`.
- [ ] **Step 3:** On the OAuth consent screen, set publishing/test users so that `michael.l.north@gmail.com` can log in (add as a test user if the app stays in "testing").
- [ ] **Step 4:** Copy the client ID + secret into the gateway's environment file on Ventura (a file outside the repo, e.g. `~/.config/ofocus-gateway/env`, mode `600`). Never commit secrets.
- [ ] **Step 5:** Record (without secrets) in `deploy/README.md`.

### Task 12: Cloudflare Tunnel + DNS

> Use the installed **`cloudflare:wrangler`** skill / `cloudflared` docs for exact current syntax. The `cf` CLI (already authenticated as `michael.l.north@gmail.com`) can manage the `huangnorth.com` DNS record.

- [ ] **Step 1: Install cloudflared on Ventura** — `brew install cloudflared`. Verify `cloudflared --version`.
- [ ] **Step 2: Authenticate + create a named tunnel** — `cloudflared tunnel login` (authorizes the `huangnorth.com` zone), then `cloudflared tunnel create ofocus`. Note the tunnel UUID + credentials file path.
- [ ] **Step 3: Write the tunnel config** `~/.cloudflared/config.yml`:
  ```yaml
  tunnel: <tunnel-uuid>
  credentials-file: /Users/<user>/.cloudflared/<tunnel-uuid>.json
  ingress:
    - hostname: ofocus.huangnorth.com
      service: http://127.0.0.1:8722
    - service: http_status:404
  ```
- [ ] **Step 4: Route DNS** — `cloudflared tunnel route dns ofocus ofocus.huangnorth.com` (creates the proxied CNAME). Verify in Cloudflare (or `cf dns ...`) that `ofocus.huangnorth.com` exists and is proxied.
- [ ] **Step 5: Test the tunnel manually** — start the gateway (Task 8 Step 3 env, but with the real Google client id/secret and `OFOCUS_GATEWAY_ISSUER_URL=https://ofocus.huangnorth.com`), then in another terminal `cloudflared tunnel run ofocus`. From your laptop: `curl -s https://ofocus.huangnorth.com/healthz` returns `{"ok":true,...}` over TLS. Confirm no inbound port-forward was added on the UDM Pro.

### Task 13: launchd services + connect the AI clients

- [ ] **Step 1: Write `deploy/com.ofocus.gateway.plist`** (a user LaunchAgent; `EnvironmentVariables` should source the secret env, or use a wrapper script that `exec`s with the env file). Example skeleton:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0"><dict>
    <key>Label</key><string>com.ofocus.gateway</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string><string>-lc</string>
      <string>set -a; source $HOME/.config/ofocus-gateway/env; exec node $HOME/Development/ofocus/packages/gateway/dist/index.js</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardErrorPath</key><string>/tmp/ofocus-gateway.log</string>
    <key>StandardOutPath</key><string>/tmp/ofocus-gateway.log</string>
  </dict></plist>
  ```
- [ ] **Step 2: Write `deploy/com.ofocus.cloudflared.plist`** analogously, running `cloudflared tunnel run ofocus` with `RunAtLoad` + `KeepAlive`.
- [ ] **Step 3: Install the agents** — copy both to `~/Library/LaunchAgents/`, then `launchctl load -w ~/Library/LaunchAgents/com.ofocus.gateway.plist` and the same for cloudflared. Verify `launchctl list | grep ofocus` shows both, and `curl https://ofocus.huangnorth.com/healthz` works after a reboot (proves auto-start + auto-login + tunnel all survive a restart).
- [ ] **Step 4: Connect claude.ai** — Settings → Connectors → Add custom connector → URL `https://ofocus.huangnorth.com/mcp`. Complete the OAuth flow (Google login as the allow-listed account). Verify a tool (e.g. "list my tasks") works. Confirm a *different* Google account is rejected.
- [ ] **Step 5: Connect ChatGPT** — enable Developer Mode (workspace settings; Pro/Team/Enterprise), then add a custom connector with the same `https://ofocus.huangnorth.com/mcp` URL and OAuth. Verify a tool call works and refresh persists past the access-token TTL (leave it >1h, confirm it still works — proves refresh tokens).
- [ ] **Step 6: Finalize `deploy/README.md`** and commit the deploy artifacts:
  ```bash
  git add packages/gateway/deploy
  git commit --author="Mike North <michael.l.north@gmail.com>" -m "docs(gateway): deployment runbook + launchd agents"
  ```

---

## Self-Review (completed during authoring)

- **Spec coverage:** HTTP transport → Tasks 6–7; OAuth AS+RS (DCR, PKCE, refresh) → Tasks 5,7,9; Google delegation + allowlist → Tasks 4–5,9; tool-exposure gate → Task 6; persistence → Task 3; config → Task 2; Cloudflare Tunnel exposure → Task 12; Ventura macOS (auto-login, Automation, SSH, launchd) → Tasks 10,13; security posture (allowlist, no open ports, token rotation, 401/WWW-Authenticate) → Tasks 5,7,9,12; multi-layer tests → Tasks 2–9; manual client-attach verification → Task 13. No uncovered spec sections.
- **Placeholder scan:** no TBD/“add error handling”/vague steps; every code step shows complete code; Phase B steps are concrete commands. (Two SDK field-name caveats in Tasks 7 & 9 point the implementer at the installed `.d.ts`/handler to confirm exact wire names — deliberate, since they assert spec-mandated values either way.)
- **Type consistency:** `Store` methods, `OfocusOAuthProvider` option names (`callbackUrl`, `accessTokenTtlSeconds`), `createGatedServer(exposed, version)`, and `buildApp({config,store,identity,version})` are used identically across tasks and tests.
```

# `@ofocus/gateway` — Remote-MCP Gateway for claude.ai & ChatGPT

**Date:** 2026-06-07
**Status:** Design — pending review
**Layer:** **Deployment / transport-and-auth** (new package `@ofocus/gateway`; wraps `@ofocus/mcp` in-process). `@ofocus/sdk`, `@ofocus/mcp`, and `@ofocus/cli` are **unchanged** by v1.
**Builds on:** the existing `@ofocus/mcp` server, which already separates server construction (`createServer()`, [`packages/mcp/src/index.ts`](../../packages/mcp/src/index.ts)) from its `StdioServerTransport`. The gateway imports `createServer()` directly — no fork, no stdio bridge, no subprocess.

---

## 1. Goal

Expose the OmniFocus MCP server to **hosted AI platforms** — claude.ai custom connectors and ChatGPT custom connectors — which can only attach to **remote MCP servers over Streamable HTTP, authenticated with OAuth 2.1**. They cannot talk to a local stdio process, and they cannot use a static API key or bearer token (Claude's connector UI accepts only an OAuth client ID/secret; ChatGPT requires an OAuth 2.1 flow conforming to the MCP authorization spec).

The gateway is the single new artifact that makes this possible: it terminates the MCP HTTP transport, owns the OAuth 2.1 layer, and runs alongside OmniFocus on a dedicated macOS VM ("Ventura"), reachable from the public internet via a Cloudflare Tunnel at `ofocus.huangnorth.com`.

This is **single-user** by design: the only human who should ever authenticate is the operator (`michael.l.north@gmail.com`).

## 2. Scope

**In scope (v1):**

- A new package `@ofocus/gateway`: a Node (≥20) HTTP server that
  - mounts a **Streamable HTTP MCP transport** backed by an in-process `@ofocus/mcp` server, and
  - implements a **spec-compliant OAuth 2.1 authorization layer** (both Authorization Server and Resource Server roles per the MCP auth spec).
- **Upstream-delegated human login** to Google OIDC, gated by a **single-email allowlist**. The gateway issues its own tokens; Google only performs authentication.
- **Dynamic Client Registration (DCR)**, PKCE/S256, and **refresh tokens** (`offline_access`) — the three things the two clients need to connect without manual fiddling and without losing access after the first token expires.
- A **config-driven tool-exposure allowlist** gate. v1 default: **expose all tools** (single-user), but the gate is built in so the exposed set can be narrowed via config without code changes.
- **Persistence** of registered clients and refresh tokens across gateway restarts.
- **Deployment artifacts**: launchd agent definitions for the gateway and `cloudflared`, plus a documented Ventura macOS configuration runbook (auto-login GUI session, Automation permission, Remote Login).
- **Tests** at unit / integration / UAT layers (see §7).

**Out of scope (deferred):**

- **Multi-user / multi-tenant auth.** The allowlist is one entry. Multi-user is a later concern with real user/session modeling.
- **Per-tool OAuth scopes** (e.g. a distinct `write` scope the client must request). v1's gate is a static config allowlist, not a scope negotiation. _(Natural follow-on once the gate exists.)_
- **Changes to `@ofocus/mcp` tool definitions.** The gateway exposes exactly what `createServer()` registers, filtered by the allowlist.
- **A port-forward + Caddy exposure path.** Cloudflare Tunnel is the chosen exposure; the port-forward alternative is documented as a fallback only (§5.4), not built.
- **Rate-limiting.** Per-token gateway rate limiting is not implemented in v1; DDoS-grade protection is Cloudflare's job at the edge.

## 3. Architecture

### 3.1 Component map

Everything runs on the **Ventura** macOS VM except the Cloudflare edge.

```
  claude.ai / ChatGPT  (hosted)
          │  HTTPS (OAuth 2.1 + Streamable HTTP MCP)
          ▼
  ┌─────────────────────────── Cloudflare edge ───────────────────────────┐
  │  ofocus.huangnorth.com  →  Cloudflare Tunnel (TLS terminates here)     │
  └───────────────────────────────────┬───────────────────────────────────┘
                                       │  outbound-initiated tunnel (no inbound port)
  ┌──────────────────────── Ventura macOS VM (on unraid) ─────────────────┐
  │  cloudflared (launchd)  →  http://127.0.0.1:<port>                     │
  │        │                                                              │
  │        ▼                                                              │
  │  @ofocus/gateway (launchd, Node)                                      │
  │    ├── OAuth 2.1: Authorization Server + Resource Server             │
  │    │     └── upstream login → Google OIDC (+ email allowlist)         │
  │    ├── Streamable HTTP MCP transport  (POST/GET /mcp)                │
  │    │     └── in-process  createServer()  from @ofocus/mcp           │
  │    │            └── @ofocus/sdk → OmniFocus automation               │
  │    └── persistence: clients + refresh tokens (SQLite or JSON file)   │
  │                                                                      │
  │  OmniFocus.app (GUI session, signed into Omni Sync) ── the data source│
  └───────────────────────────────────────────────────────────────────────┘
```

### 3.2 HTTP & MCP transport

- One HTTP server (Express/Hono — decide in implementation) hosts both the OAuth endpoints and `/mcp`.
- `/mcp` uses the MCP SDK's `StreamableHTTPServerTransport` with **per-session** transports keyed by the `mcp-session-id` header (the SDK's documented session pattern): a new session is created on the initialize request and reused for subsequent calls; `GET /mcp` serves the server→client SSE stream; `DELETE /mcp` tears a session down.
- Each session binds to its own `createServer()` instance from `@ofocus/mcp`, so MCP server construction is reused verbatim and stays transport-agnostic.

### 3.3 OAuth 2.1 layer

The gateway plays **both** roles defined by the MCP authorization spec, against its own issuer (`https://ofocus.huangnorth.com`):

**Resource Server**

- `GET /.well-known/oauth-protected-resource` (RFC 9728) — advertises the resource and its `authorization_servers`.
- `/mcp` requires a valid bearer access token. Missing/invalid/expired → **`401`** with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"` so clients can discover the AS.

**Authorization Server**

- `GET /.well-known/oauth-authorization-server` (RFC 8414) — metadata: endpoints, `code_challenge_methods_supported: ["S256"]`, `grant_types_supported` incl. `authorization_code` + `refresh_token`, `scopes_supported` incl. `offline_access`.
- `POST /register` — **DCR** (RFC 7591). Accepts the dynamic registration that claude.ai / ChatGPT perform; persists the client.
- `GET /authorize` — validates PKCE `code_challenge` (S256 required), then **redirects to Google** for the actual human login.
- Google callback handler — verifies the Google ID token, **checks `email` against the allowlist** (`michael.l.north@gmail.com`); on match, issues the gateway's own authorization code bound to the original PKCE challenge and client; on mismatch, denies.
- `POST /token` — exchanges code→tokens (verifying the PKCE `code_verifier`) and services `refresh_token` grants. Issues short-lived access tokens + rotating refresh tokens.

**Why delegate to Google rather than point clients straight at Google:** Google does not support DCR, which ChatGPT in particular relies on. By being its own AS, the gateway presents a fully spec-compliant surface (DCR + S256 + refresh) to the clients while outsourcing only password handling to Google. No credentials are ever stored by the gateway.

_Implementation note (decided during build, not here):_ whether to use the MCP TS SDK's built-in auth (`mcpAuthRouter` + a custom `OAuthServerProvider`) or a small purpose-built provider. The spec fixes the **behavior and endpoints**, not the library.

### 3.4 Tool-exposure gate

- Config field `exposedTools`: `"all"` (v1 default) or an explicit array of tool names.
- Implemented as a filter applied when registering tools onto each session's server (or a wrapper that hides non-allowed tools from `tools/list` **and** rejects their invocation). Both list and call paths must honor the gate — hiding from the list alone is insufficient.
- A startup log line states exactly which tools are exposed, so the operative policy is always observable.

### 3.5 Persistence

- A small store for **registered OAuth clients** and **refresh tokens** (and any auth-code/PKCE state with a short TTL). Restarting the gateway must not force the connectors to re-register or re-authorize.
- Backend: SQLite (via `better-sqlite3`) **or** a guarded JSON file — decided in implementation; the spec requires durability + an interface seam, not the engine.
- Stored under an `OFOCUS_GATEWAY_STATE_DIR` (mirrors the `OFOCUS_STATE_DIR` convention used elsewhere in the repo), default within the user's app-support directory.

### 3.6 Configuration

Environment / config file supplies: listen port; public issuer URL (`https://ofocus.huangnorth.com`); Google OAuth client id/secret; allowlisted email(s); `exposedTools`; state dir. Secrets come from the environment / a file outside the repo — never committed. No version strings are hardcoded (version is read from `package.json`, per repo convention).

## 4. Data flow

**Connect (first time):**
`client → GET /.well-known/oauth-protected-resource → (AS metadata) → POST /register (DCR) → GET /authorize (PKCE S256) → 302 to Google → operator logs in → callback: verify ID token + allowlist → gateway issues code → POST /token (verify code_verifier) → access + refresh tokens.`

**Tool call:**
`client → POST /mcp (Bearer access token, JSON-RPC) → gateway validates token → routes to session's in-process MCP server → @ofocus/sdk → OmniFocus → result streamed back.`

**Token refresh:** `client → POST /token (grant_type=refresh_token) → new access token (+ rotated refresh token).`

## 5. Deployment — Ventura macOS VM

### 5.1 The "remote management" the operator asked about — what it actually is

1. **Automation permission**: System Settings → Privacy & Security → Automation → allow the Node process (and/or Terminal/the launchd context) to control **OmniFocus**. Without this, `@ofocus/sdk` automation fails. Accessibility may also be required depending on the automation path.
2. **A logged-in GUI session**: OmniFocus is a GUI app and cannot be driven headless. The VM must **auto-login** to the operator's account and stay logged in (the gateway runs as a **user** launchd agent in that GUI session, not a system daemon).
3. **Remote Login (SSH)** for administration; **Screen Sharing** optional for first-time permission grants (which need the GUI).

### 5.2 Runtime services (launchd user agents)

- `com.ofocus.gateway` — runs the gateway; `KeepAlive` + `RunAtLoad`.
- `com.ofocus.cloudflared` — runs the tunnel; `KeepAlive` + `RunAtLoad`.
- OmniFocus added to Login Items so it's running in the session.

### 5.3 Cloudflare Tunnel

- Install `cloudflared` on Ventura (Homebrew). Create a named tunnel; route `ofocus.huangnorth.com` → `http://127.0.0.1:<port>`.
- The DNS (CNAME to the tunnel) is created in the `huangnorth.com` zone — doable from the operator's machine with the authenticated `cf` CLI, or `cloudflared tunnel route dns`.
- **No inbound port-forward on the UDM Pro** — the tunnel is outbound-initiated, so nothing new is opened on the home network.

### 5.4 Exposure fallback (documented, not built)

If end-to-end TLS to the VM (no edge termination) is later preferred: port-forward 443 → Ventura + Caddy with a Cloudflare DNS-01 cert on `ofocus.huangnorth.com`. Only the exposure layer changes; the gateway is identical.

## 6. Security posture

- **Single-email allowlist** is the real access control: Google login is "public," but only the allowlisted account passes the callback check.
- **No open inbound ports** (Cloudflare Tunnel).
- **Token discipline**: short-lived access tokens, rotating refresh tokens, PKCE S256 enforced.
- **v1 logging**: startup banner (version, issuer, exposed-tool count) and server-side logging of Google-callback authorization failures (generic `403 Authorization denied` to the client; full error message and stack to stderr only).
- **Deferred (not in v1):** per-request audit logging of authenticated `/mcp` calls (principal + tool name + outcome), and per-token rate limiting. Edge-level rate limiting is provided by Cloudflare in front.
- **Blast radius awareness**: v1 exposes all tools, including destructive ones (`task_delete`, etc.). The config gate exists precisely so this can be narrowed; the default is accepted only because the surface is single-user and authenticated.

## 7. Testing strategy

Per the repo's multi-layer testing approach. Assertions about OAuth metadata and error responses are written **from the specs** (RFC 8414/7591/9728 + the MCP auth spec), not snapshotted.

**Unit**

- PKCE: S256 challenge/verifier match accepted; mismatch rejected; non-S256 method rejected.
- Allowlist: allowed email passes; any other email denied; missing/invalid Google ID token denied.
- Token lifecycle: issue, validate, expiry rejection, refresh-rotation, reuse-of-rotated-refresh rejected.
- Metadata documents: assert the required fields of protected-resource and AS metadata **field-by-field** against the RFCs (e.g. `code_challenge_methods_supported` contains `S256`; `authorization_servers` present and correct).
- Tool gate: `"all"` exposes everything; an explicit list exposes exactly those and **rejects invocation** of an omitted tool (not just hides it from `tools/list`).

**Integration**

- Real `StreamableHTTPServerTransport` + in-process MCP server: a valid bearer round-trips a real `tools/call`.
- Negative: missing / expired / wrong-issuer token → `401` with a correct `WWW-Authenticate` pointing at the resource-metadata URL.
- Session lifecycle: initialize creates a session; reuse via `mcp-session-id`; `DELETE` tears down.

**UAT (locally automatable)**

- Boot the gateway locally; drive the full OAuth dance with a scripted client / MCP Inspector / `mcp-remote` against a **stubbed Google** endpoint; complete a real tool call end-to-end.
- Negative end-to-end: a non-allowlisted email is rejected at the callback and no token is issued.
- _Manual (cannot run in CI — needs the hosted clients):_ a documented checklist for verifying the connector actually attaches in claude.ai and in ChatGPT (see `manual-test-design`).

## 8. Open decisions (resolved during implementation)

- OAuth implementation: MCP SDK built-in auth vs. purpose-built provider.
- Persistence engine: SQLite vs. guarded JSON file.
- HTTP framework: Express vs. Hono.

None of these change the externally-observable behavior fixed above.

## 9. References

- MCP authorization spec — <https://modelcontextprotocol.io/specification/draft/basic/authorization>
- Connect to remote MCP servers — <https://modelcontextprotocol.io/docs/develop/connect-remote-servers>
- Claude custom connectors — <https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers>
- Claude connector authentication — <https://claude.com/docs/connectors/building/authentication>
- ChatGPT MCP / connectors — <https://developers.openai.com/api/docs/guides/tools-connectors-mcp>
- ChatGPT developer mode — <https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta>
- RFC 9728 (Protected Resource Metadata), RFC 8414 (AS Metadata), RFC 7591 (Dynamic Client Registration), OAuth 2.1 draft.

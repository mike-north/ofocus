import { randomUUID } from "node:crypto";
import express, { type Express, type RequestHandler } from "express";
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
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

  const callbackUrl = new URL(
    "/auth/google/callback",
    config.issuerUrl
  ).toString();
  const provider = new OfocusOAuthProvider({
    store,
    identity,
    allowedEmails: config.allowedEmails,
    callbackUrl,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, version });
  });

  app.get("/auth/google/callback", googleCallbackHandler(provider));

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: config.issuerUrl,
      scopesSupported: ["openid", "email", "offline_access"],
      resourceName: "OmniFocus (ofocus)",
    })
  );

  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(
    config.issuerUrl
  );
  const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl });

  const transports = new Map<string, StreamableHTTPServerTransport>();

  const mcpPost: RequestHandler = (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const sessionId =
          typeof req.headers["mcp-session-id"] === "string"
            ? req.headers["mcp-session-id"]
            : undefined;
        let transport = sessionId ? transports.get(sessionId) : undefined;

        if (!transport) {
          if (!isInitializeRequest(req.body)) {
            res.status(400).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "No valid session; send an initialize request first",
              },
              id: null,
            });
            return;
          }
          // Capture in a const so the closures below close over the same
          // reference without needing non-null assertions.
          const t = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports.set(sid, t);
            },
          });
          t.onclose = () => {
            if (t.sessionId) transports.delete(t.sessionId);
          };
          transport = t;
          const server = createGatedServer(config.exposedTools, version);
          // `StreamableHTTPServerTransport` uses getter/setter for `onclose` that
          // accepts `undefined`, which conflicts with `exactOptionalPropertyTypes: true`
          // in the `Transport` interface. The runtime behaviour is correct; this cast
          // works around a declaration incompatibility in the SDK (v1.26.0).
          await server.connect(t as unknown as Transport);
        }

        await transport.handleRequest(req, res, req.body);
      })
      .catch(next);
  };

  app.post("/mcp", bearer, express.json(), mcpPost);

  const sessionStream: RequestHandler = (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const sessionId =
          typeof req.headers["mcp-session-id"] === "string"
            ? req.headers["mcp-session-id"]
            : undefined;
        const transport = sessionId ? transports.get(sessionId) : undefined;
        if (!transport) {
          res.status(400).send("Invalid or missing session ID");
          return;
        }
        await transport.handleRequest(req, res);
      })
      .catch(next);
  };

  app.get("/mcp", bearer, sessionStream);
  app.delete("/mcp", bearer, sessionStream);

  return app;
}

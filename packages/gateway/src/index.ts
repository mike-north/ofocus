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
  const identity = new GoogleIdentityProvider(
    config.googleClientId,
    config.googleClientSecret
  );
  const app = buildApp({ config, store, identity, version });

  const exposed =
    config.exposedTools === "all"
      ? "all tools"
      : `${config.exposedTools.size.toString()} tools`;
  app.listen(config.port, "127.0.0.1", () => {
    console.error(
      `ofocus-gateway v${version} on http://127.0.0.1:${config.port.toString()} ` +
        `(issuer ${config.issuerUrl.toString()}, exposing ${exposed})`
    );
  });
}

main();

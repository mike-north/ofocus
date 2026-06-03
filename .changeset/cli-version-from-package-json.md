---
"@ofocus/cli": patch
"ofocus": patch
---

Fix `ofocus --version` reporting a stale `0.0.1` instead of the real package version.

The version is now sourced at runtime from the package's own `package.json` rather than a hardcoded literal, so it stays in lockstep with the published version automatically. The umbrella `ofocus` binary reports the `ofocus` package version (what users install); `ofocus-cli` reports the `@ofocus/cli` version.

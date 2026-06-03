---
"@ofocus/sdk": minor
"@ofocus/cli": patch
"@ofocus/mcp": patch
"ofocus": patch
---

Fix the published bins producing no output when installed globally. Global bins
are symlinked, so each entry's main-module check (`process.argv[1]` vs
`import.meta.url`) never matched and the bin was never invoked — `ofocus`,
`ofocus-cli`, and the `ofocus-mcp` server were all silent through a symlinked
install. Adds a shared `isMainModule(importMetaUrl)` helper to `@ofocus/sdk` that
resolves symlinks (`realpathSync`) before comparing, and applies it across all
three bin entries so they run as expected.

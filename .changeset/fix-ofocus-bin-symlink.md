---
"ofocus": patch
---

Fix the `ofocus` CLI producing no output when installed globally. Global bins are
symlinked, so the entry point's main-module check (`process.argv[1]` vs
`import.meta.url`) never matched and the CLI was never invoked. The check now
resolves symlinks (`realpathSync`) before comparing, so `ofocus <command>` runs
as expected through the installed bin.

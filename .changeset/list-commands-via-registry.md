---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"ofocus": minor
---

feat(cli): derive `list-commands` catalog from the descriptor registry; remove hand-maintained `CommandInfo[]` array

The `list-commands` command now builds its catalog by iterating over every descriptor registered in the CLI (via a `CLI_DESCRIPTORS` array in `commands/index.ts`) and computing each entry's `name`, `description`, and `usage` string from the descriptor itself — using the same `usageStringForDescriptor` helper that `registerCliCommand` uses to register flags in Commander. This eliminates the source of drift that Copilot reviews repeatedly flagged: usage strings were previously hand-maintained in a parallel `commandRegistry` array and grew stale whenever a descriptor's flags changed.

The three commands that cannot (yet) be expressed as descriptors remain explicitly listed in a small supplementary array:

- **`list-commands`** — reads from the descriptor registry itself; has no OmniFocus handler.
- **`import`** — the CLI accepts a file path and reads its content before calling the SDK; the MCP descriptor (`importTaskPaperDescriptor`, `cliName: "import-taskpaper"`) takes raw content and is a different surface.
- **`review-interval`** — combines `getReviewIntervalDescriptor` and `setReviewIntervalDescriptor` into one CLI command via the `--set` flag.

## SDK change

`allCommandDescriptors` is a new export from `@ofocus/sdk` (and its registry module) that lists every command descriptor in one place. Consumers such as documentation generators and test coverage assertions can import it instead of maintaining parallel lists.

## CLI change

`usageStringForDescriptor` is a new exported helper in `packages/cli/src/registry-adapter.ts` that derives the usage string from a descriptor's positionals and flags — the single source of truth shared by `registerCliCommand` and `list-commands`.

The legacy hand-maintained `commandRegistry: CommandInfo[]` array is gone. The `commandRegistry` export is retained (same type, same name) but is now populated by the descriptor-derived `buildCommandRegistry()` function.

## Catalog counts

- **58** descriptor-driven entries (all commands registered via `registerCliCommand` in `cli.ts`)
- **3** hand-wired entries (`list-commands`, `import`, `review-interval`)
- **61** total entries — same as before, with all usage strings now authoritative

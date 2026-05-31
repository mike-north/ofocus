# OFocus Architecture

**Status:** Living document — describes how the OFocus SDK/CLI/MCP actually work today.
**Audience:** contributors and agents working in this repo. Read this before making
structural changes or adding commands.
**See also:** [Agent collaboration principles & roadmap](./superpowers/specs/2026-05-30-ofocus-agent-principles.md)
· [docs index](./README.md)

---

## 1. What OFocus is

OFocus is an SDK + CLI + MCP server for driving OmniFocus 4 on macOS. It lets programs and
AI agents query and mutate tasks, projects, folders, tags, and perspectives. There is no
OmniFocus HTTP API — everything goes through **OmniJS** (OmniFocus's built-in JavaScript
automation), evaluated out-of-process via `osascript`.

**Requirements:** macOS with OmniFocus 4+ installed and running.

## 2. Monorepo layout & dependency graph

pnpm workspace (`packages/*`), TypeScript project references, strict tsconfig
(`tsconfig.base.json`), ESLint `strict-type-checked` + Prettier, vitest, Changesets.

| Package                    | Role                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@ofocus/sdk`**          | Core library. The OmniJS bridge, command implementations, the descriptor registry, query/error/result types. Minimal dependencies (`zod` only). |
| **`@ofocus/productivity`** | Layer-2 "niceties" built on the SDK (currently the `changes` change-detection command). The sanctioned home for any extra dependency weight.    |
| **`@ofocus/cli`**          | Commander-based terminal interface. Consumes the SDK **and** productivity.                                                                      |
| **`@ofocus/mcp`**          | MCP server exposing commands as tools. Consumes the SDK **and** productivity.                                                                   |
| **`ofocus`**               | Umbrella package; re-exports the others. Provides the `ofocus` binary.                                                                          |

**Dependency direction (acyclic):** `sdk ← productivity ← {cli, mcp} ← ofocus`.
The SDK never imports productivity, cli, or mcp.

```
@ofocus/sdk ──────┐
                  ├── @ofocus/cli ──┐
@ofocus/productivity ─┤             ├── ofocus (umbrella, `ofocus` bin)
                  └── @ofocus/mcp ──┘
```

## 3. The three layers

A design discipline (full version in the [principles doc](./superpowers/specs/2026-05-30-ofocus-agent-principles.md)):

- **L1 — programmatic core** (`@ofocus/sdk`): explicit, direct, deterministic OmniFocus
  operations. "Give me exactly what I ask for."
- **L2 — productivity niceties** (`@ofocus/productivity`): actor-agnostic conveniences that
  absorb mechanical work (change detection, and — on the roadmap — recurrence expansion,
  derived state, fuzzy resolution). A human at a terminal benefits, not just agents.
- **L3 — agent interaction patterns** (a plugin, future): hooks, monitoring orchestration,
  multi-turn triage — things only meaningful inside an agent runtime.

**Placement test:** _Is this about OmniFocus data/computation (→ tool, L1/L2) or about an
agent's runtime/interaction (→ plugin, L3)?_ Fuzzy-but-deterministic things (e.g. ranked
search) are L2, not L3 — "fuzzy" ≠ "agent-only".

## 4. The OmniJS bridge

All OmniFocus access is a single mechanism (`packages/sdk/src/omnijs.ts`):

```
osascript -e 'tell application "OmniFocus" to evaluate javascript "<escaped OmniJS>"'
```

- **`runOmniJS<T>(script)`** — escapes the script, invokes `osascript` via `execFile`
  (10 MB buffer, 30 s timeout), and parses stdout as JSON. Non-JSON output or an empty
  response is a protocol violation → structured error. The script must end with a
  `return JSON.stringify(...)` expression so the result is a typed value.
- **`wrapOmniJS(body)`** wraps a body in `(function(){ try { <body> } catch(err){ return
JSON.stringify({__omnijs_error:true, message}) } })()`, and **`runOmniJSWrapped<T>(body)`**
  runs it and surfaces caught OmniJS errors as `{ success:false, error }`. Prefer
  `runOmniJSWrapped` for new command bodies.
- **OmniJS facts that matter** (verified against build 185.15): objects expose `.modified`
  and `.added` timestamps; a _Project_'s root has no `.modified` — use `project.task.modified`;
  `document.lastSyncDate` is available; there is no O(1) database change token; the on-disk
  `.ofocus` package is gated by macOS TCC (Full Disk Access) and is not generally readable
  from the CLI/agent context.

**Trust model:** `eval`/`runOmniJS` run unsandboxed in the user's live database and can
mutate anything. Treat OmniJS scripts like shell code on the user's machine.

## 5. The descriptor registry (single source of truth)

Adding a command is **declarative**. `defineCommand` (`packages/sdk/src/registry/define.ts`)
produces a `ResolvedCommandDescriptor` with: canonical `name` (camelCase), `cliName`
(kebab), `mcpName` (snake), `description`, a Zod `inputSchema`, optional `cliPositional`
fields, and an async `handler(input) → CliOutput<T>`.

```ts
const inboxAdd = defineCommand({
  name: "addToInbox",
  cliName: "inbox",
  mcpName: "inbox_add",
  description: "Add a new task to the OmniFocus inbox.",
  cliPositional: ["title"],
  inputSchema: z.object({
    title: z.string().describe("Task title"),
    note: z.string().optional(),
  }),
  handler: async (input) => addToInbox(input.title, { note: input.note }),
});
```

The descriptor is the **one** place a command is defined; every surface derives from it:

| Surface            | How it derives                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canonical list** | `packages/sdk/src/registry/all-descriptors.ts` exports `allCommandDescriptors` — the source of truth for SDK commands.                                                                                                    |
| **CLI**            | `registerCliCommand(program, descriptor, handleOutput)` (`packages/cli/src/registry-adapter.ts`) builds the Commander subcommand: positionals + `--flags` from the schema, coercion, Zod validation → `VALIDATION_ERROR`. |
| **MCP**            | `registerMcpTool(server, descriptor)` (`packages/mcp/src/registry-adapter.ts`) registers the tool; it auto-injects a `format?: 'json' \| 'toon'` param (default `toon`).                                                  |
| **Docs**           | `scripts/generate-agent-docs.ts` reads the built descriptors and writes `AGENT_INSTRUCTIONS.md`, `AGENT_CLI_INSTRUCTIONS.md`, and `skills/ofocus/SKILL.md`.                                                               |

**Cross-package commands (L2):** because `@ofocus/productivity` depends on the SDK, the SDK's
`allCommandDescriptors` cannot import it. Instead `@ofocus/productivity` exports its own
`productivityDescriptors`, and the **CLI, MCP, and docs generator compose the union** of the
core + productivity descriptor arrays.

## 6. Query model

Read commands (`tasks`, `projects`, `folders`, `tags`, `forecast`, `search`, `deferred`,
`perspective`) share a rich, composable query vocabulary so most questions need no scripting:

- **Filters** — domain predicates (`--flagged`, `--available`, `--in-inbox`, `--status`,
  date windows like `--due-within`, name/note matchers, etc.).
- **Field selection** — `--fields` / `--exclude-fields` to shape the payload.
- **Sorting** — `--sort` (multi-key), `--reverse`, `--nulls-first`.
- **Aggregation** — `--group-by`, `--count`, `--stats`, `--first`/`--last`, `--ids-only`.
- **Pagination** — `--limit` / `--offset`, or `--all` for auto-paginated iteration.

Prefer these declarative commands over `eval`. Reach for `eval` only as a last resort, and
narrate intent in plain language before showing the script.

## 7. Result, error, and output models

**Every handler returns `CliOutput<T>`** (`packages/sdk/src/types.ts`):

```ts
interface CliOutput<T> {
  success: boolean;
  data: T | null;
  error: CliError | null;
}
```

Build results with the `success(data)` / `failure(error)` helpers
(`packages/sdk/src/result.ts`). **Errors are structured** (`packages/sdk/src/errors.ts`):

```ts
interface CliError {
  code: ErrorCode;
  message: string;
  details?: string;
}
```

`ErrorCode` is a const-object union — e.g. `OMNIFOCUS_NOT_RUNNING`, `TASK_NOT_FOUND`,
`VALIDATION_ERROR`, `INVALID_DATE_FORMAT`, `SCRIPT_ERROR`, `JSON_PARSE_ERROR`,
`UNKNOWN_ERROR`. Use `createError(code, message, details?)`; don't throw raw strings.

**Output formats:**

| Surface | Default | Options                                                          |
| ------- | ------- | ---------------------------------------------------------------- |
| **CLI** | `json`  | `--format json\|toon`, or `--human` for readable text.           |
| **MCP** | `toon`  | per-call `format: 'json'\|'toon'` (auto-injected on every tool). |

[TOON](https://toonformat.dev/) is a token-efficient encoding for uniform arrays-of-objects —
the default for MCP because agents pay per token.

## 8. Change detection (L2 example)

`ofocus changes` (`@ofocus/productivity`) is the first L2 capability and the reference
implementation of "compute, don't make the caller reason." It keeps a per-watch on-disk
snapshot under `~/.ofocus/watch/<name>.json` (override with `OFOCUS_STATE_DIR`), and answers
"what changed since I last looked?" with field-level diffs, a `{count, maxModified}`
fingerprint fast path, an opaque cursor, and a generation/pending model for push-style
delivery. Full design: [changes primitive spec](./superpowers/specs/2026-05-30-ofocus-changes-primitive-design.md).

## 9. How to add a command

1. **Define the descriptor** with `defineCommand` in the appropriate package
   (`@ofocus/sdk` for L1, `@ofocus/productivity` for an L2 nicety). Implement the handler to
   return `CliOutput<T>`; use `runOmniJSWrapped` for OmniFocus access.
2. **Register it in the canonical array** — `allCommandDescriptors` (SDK) or
   `productivityDescriptors` (productivity).
3. **CLI/MCP surface automatically** via the registry adapters (productivity descriptors are
   union-merged in `packages/cli/src/cli.ts` + `commands/index.ts` and
   `packages/mcp/src/tools/`). New MCP tools must be added to the expected-tools fixture
   (`packages/mcp/tests/fixtures/expected-tools.ts`).
4. **Regenerate agent docs** — `pnpm build` runs `generate:agent-docs`, updating
   `AGENT_*.md` and `skills/ofocus/SKILL.md`. Commit the regenerated files.
5. **Test** at the right layers (see §10) with spec-derived assertions.
6. **Add a changeset** for any published-package change.

## 10. Testing strategy

- **Unit** (vitest): pure logic — engines, parsers, validation — with hand-built fixtures and
  **spec-derived assertions** (never snapshot/gold-master as a correctness mechanism).
- **Integration**: wiring across the descriptor registry (CLI/MCP derive correctly).
- **UAT**: drive the real CLI as a subprocess; tests that need a live OmniFocus gate on
  `existsSync('/Applications/OmniFocus.app')` and skip in CI; tests that need the built CLI
  skip when the dist is absent.
- OmniFocus-touching unit tests inject the scan/exec seam so they run without the app.

## 11. Invariants & constraints

- **SDK dependency discipline.** `@ofocus/sdk` stays minimal (only `zod`). Anything needing a
  network call, an external process, or heavy weight (e.g. the `--semantic` summary command)
  lives in `@ofocus/productivity` (or higher), invoked lazily and **fail-open**.
- **The descriptor is the single source of truth.** Never hand-maintain a parallel CLI/MCP/docs
  command list — derive from descriptors.
- **Layer placement is deliberate.** Apply the §3 test; when unsure which package code belongs
  in, consult the principles doc before adding it.
- **OmniJS scripts end with `return JSON.stringify(...)`** and must be JSON-serializable;
  surface OmniFocus errors via the structured error model rather than throwing strings.
- **Generated files are generated.** `AGENT_*.md`, `skills/ofocus/SKILL.md`, and
  `packages/sdk/docs/*` are produced by tooling — edit the source/generator, not the output.

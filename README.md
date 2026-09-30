# OFocus

A CLI, SDK, and MCP server for integrating with OmniFocus on macOS.

[![CI](https://github.com/mike-north/ofocus/actions/workflows/ci.yml/badge.svg)](https://github.com/mike-north/ofocus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Requires macOS with OmniFocus 4+ installed. The SDK uses OmniJS through `osascript`; most operations require OmniFocus to be running. macOS may ask you to allow Automation access on first use.

## Quick Start

Install the `ofocus` command with Node.js 20 or newer:

```bash
npm install -g ofocus

# Add a flagged task to the inbox
ofocus inbox "Buy groceries" --flag

# Find the task and its ID
ofocus tasks --flagged --limit 20

# Replace TASK_ID_FROM_OUTPUT with an ID returned by the query
ofocus complete "TASK_ID_FROM_OUTPUT"
```

Output defaults to TOON when an AI agent is detected and JSON otherwise. Use `--format json` for JSON or `--human` for readable output. Run `ofocus list-commands` to discover commands and `ofocus tasks --help` for options.

## Claude Code plugin

This repo also ships an [OmniFocus Automation](./plugins/omnifocus-automation) (`omnifocus-automation`) Claude Code plugin — proactive OmniFocus change notifications plus an inbox-triage/co-planning skill, built on the CLI above. It's distributed via this repo's plugin marketplace index (`.claude-plugin/marketplace.json`):

```bash
npm install -g ofocus            # the CLI the plugin's hooks call
npx plugins add mike-north/ofocus # the plugin (Claude Code / Cursor)
```

Or with Claude Code's native plugin manager:

```
/plugin marketplace add mike-north/ofocus
/plugin install omnifocus-automation@ofocus
```

See the [plugin README](./plugins/omnifocus-automation) for the notification model and configuration.

## Packages

| Package                                           | Purpose                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| [`ofocus`](./packages/ofocus)                     | Installs the `ofocus` CLI and re-exports the SDK and MCP helpers |
| [`@ofocus/cli`](./packages/cli)                   | Standalone CLI, installed as `ofocus-cli`                        |
| [`@ofocus/sdk`](./packages/sdk)                   | Core OmniFocus SDK                                               |
| [`@ofocus/productivity`](./packages/productivity) | Productivity features built on the SDK                           |
| [`@ofocus/omnijs-types`](./packages/omnijs-types) | TypeScript types for OmniJS                                      |
| [`@ofocus/mcp`](./packages/mcp)                   | MCP server, installed as `ofocus-mcp`                            |
| [`@ofocus/gateway`](./packages/gateway)           | Remote MCP gateway                                               |

## API Reference

### CLI

Use `ofocus list-commands` for command discovery and [the generated CLI reference](./AGENT_CLI_INSTRUCTIONS.md) for current arguments, filters, and output formats. The [CLI guide](./packages/cli/README.md) has examples.

### SDK

Install `@ofocus/sdk` directly, or import its exports from `ofocus`:

```typescript
import { addToInbox, queryTasks } from "@ofocus/sdk";

const created = await addToInbox("Buy groceries");
if (created.success) {
  console.log(created.data.id);
}

const flagged = await queryTasks({ flagged: true });
if (flagged.success) {
  console.log(flagged.data.items);
}
```

See the [SDK guide](./packages/sdk/README.md) and [generated API reference](./packages/sdk/docs/sdk.md).

### MCP server

An MCP client that supports standard server configuration can launch `@ofocus/mcp` with:

```json
{
  "mcpServers": {
    "ofocus": {
      "command": "npx",
      "args": ["-y", "@ofocus/mcp"]
    }
  }
}
```

See the [MCP setup guide](./packages/mcp/README.md) and [generated tool reference](./AGENT_INSTRUCTIONS.md) for registered tool names.

## Using `ofocus eval`

`ofocus eval` (MCP: `omnifocus_eval`) is a last-resort escape hatch for operations that no combination of flags on the deterministic commands can cover. Before using it, try `tasks`, `projects`, `folders`, `tags`, `forecast`, `search`, and their filter/sort/projection flags.

When `eval` is necessary, narrate your intent in plain language first so the user can verify the script matches the description.

### Example: simple query

Intent: count how many flagged tasks exist across all projects.

```bash
ofocus eval 'return flattenedTasks.filter(t => t.flagged && !t.completed).length;'
```

### Example: args-parameterized query

Intent: retrieve the name of the task with a specific ID, using `args` to avoid embedding the ID in the script string.

```bash
ofocus eval \
  --args '{"taskId":"abc123"}' \
  'var t = flattenedTasks.byId(args.taskId); return t ? t.name : null;'
```

Using `--args` is safer than string-interpolating values into the script body — values are JSON-encoded and cannot break out of the argument context.

### Example: mutation

Intent: move all tasks tagged "waiting" that have no due date into a holding project called "Someday".

```bash
ofocus eval '
var waiting = flattenedTasks.filter(function(t) {
  return t.tags.map(function(tg) { return tg.name; }).includes("waiting")
    && !t.dueDate && !t.completed;
});
var holding = flattenedProjects.byName("Someday");
if (!holding) { return JSON.stringify({ error: "Someday project not found" }); }
waiting.forEach(function(t) { moveTasks([t], holding.ending); });
return JSON.stringify({ moved: waiting.length });
'
```

**Security note**: Scripts run unsandboxed in your OmniFocus and can mutate any task, project, folder, tag, or perspective. Scripts must end with `return <expression>;` and are capped at 64 KB.

## Pagination

All list commands (`tasks`, `projects`, `folders`, `tags`, `forecast`, `deferred`, `search`, `subtasks`) return a `PaginatedResult` envelope and support two pagination modes.

### Page-by-page (`--limit` / `--offset`)

Use `--limit <n>` and `--offset <n>` to page through results one window at a time:

```bash
ofocus tasks --limit 50 --offset 0   # first page
ofocus tasks --limit 50 --offset 50  # second page
```

```typescript
const page1 = await queryTasks({ limit: 50, offset: 0 });
const page2 = await queryTasks({ limit: 50, offset: 50 });
```

### Full result set (`--all`)

Use `--all` to return every matching item in a single call, bypassing pagination. This is the recommended approach when the query is bounded by filters (e.g., a specific project or tag) and the result set fits comfortably in memory. Because OmniFocus runs in-process via OmniJS, there are no network round-trips — server-side materialization is safe.

```bash
# All tasks in a project — no paging loop needed
ofocus tasks --project "Work" --all

# All active projects
ofocus projects --status active --all
```

```typescript
const result = await queryTasks({ project: "Work", all: true });
// result.data.kind === "list"
// result.data.hasMore === false  (nothing left to page)
// result.data.items contains every matched task
```

`--all` is **mutually exclusive** with `--limit` and `--offset` — supplying both returns a validation error.

For unbounded or extremely large queries (e.g., every task in a large database), prefer `--count` or `--group-by` to avoid materializing a very large array.

### Auto-iterate in the SDK (`paginate` / `paginatePages`)

In TypeScript, rather than stepping `offset`/`hasMore` yourself (or materializing everything with `--all`), pass a single-`options` list query — queries like `queryTasks`, `queryProjects`, `queryTags`, `queryFolders`, `queryDeferred`, and `queryForecast` conform directly — to `paginate` and iterate every matching item with a `for await` loop:

```typescript
import {
  paginate,
  paginatePages,
  PaginationError,
  queryTasks,
} from "@ofocus/sdk";

// Iterate every flagged task, transparently fetching pages as needed.
for await (const task of paginate(queryTasks, { flagged: true })) {
  console.log(task.name);
}

// Or process whole pages — useful for batching or progress reporting.
// The third argument sets the page size (defaults to options.limit, then 100).
for await (const page of paginatePages(queryTasks, { available: true }, 250)) {
  await processBatch(page);
}
```

The element and options types are inferred from the query function — no type arguments needed.

Queries that take a required leading argument — `searchTasks(query, options)` and `querySubtasks(parentTaskId, options)` — don't match the single-`options` shape directly. Wrap them in a closure first:

```typescript
for await (const task of paginate((options) =>
  searchTasks("invoice", options)
)) {
  console.log(task.name);
}
```

A failed page (or an options combination that does not produce a list, such as `count`/`idsOnly`/`first`/`last`/`groupBy`) throws a `PaginationError` carrying the underlying error code:

```typescript
try {
  for await (const task of paginate(queryTasks)) {
    // …
  }
} catch (err) {
  if (err instanceof PaginationError) {
    console.error(err.code, err.message);
  }
}
```

> **Note:** This is offset-based pagination over a live database. If tasks are added, completed, or deleted while you iterate, pages can skip or duplicate items.

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 10.24.0
- macOS with OmniFocus 4+ installed and running for integration tests

### Setup and build

```bash
pnpm install
pnpm build
```

`pnpm build` compiles the TypeScript projects and regenerates the agent command references. It does not update the committed SDK API report. To remove generated output before building, run `pnpm build:clean`.

### Tests and checks

```bash
# Package, generator, and plugin tests
pnpm test

# SDK integration tests (requires OmniFocus on macOS)
pnpm --filter @ofocus/sdk test:integration

pnpm lint
pnpm typecheck
pnpm format:check
```

`pnpm test:unit` runs packages with a dedicated unit-test script. Use `pnpm lint:fix` for ESLint fixes, `pnpm knip` for unused exports and dependencies, and `pnpm syncpack:check` for dependency versions.

### SDK API report

The SDK package build uses `api-extractor.types.json` to bundle declarations without updating the committed report. Run these commands after `pnpm build` when the SDK's public API changes:

```bash
# Fail if the committed API report differs from the SDK
pnpm --filter @ofocus/sdk run api-report:check

# Accept the API change, then regenerate Markdown docs
pnpm --filter @ofocus/sdk run api-report:update
pnpm --filter @ofocus/sdk run docs
```

Both report commands use `api-extractor.report.json`; see the [SDK development guide](./packages/sdk/README.md#developing-the-sdk) for the config mapping.

## Architecture

```text
packages/
├── omnijs-types/  # TypeScript types for OmniJS
├── sdk/           # Core OmniFocus commands
├── productivity/  # Derived productivity features
├── cli/           # Command-line interface
├── mcp/           # MCP server
├── gateway/       # Remote MCP gateway
└── ofocus/        # Combined package and CLI
```

See [the architecture guide](./docs/architecture.md) for the package graph and command registry.

## Contributing

### Adding Changes

This project uses [changesets](https://github.com/changesets/changesets) for versioning. When making changes:

1. Make your code changes
2. Run `pnpm changeset` to create a changeset describing your changes
3. Commit the changeset file along with your code changes

### Release Process

When changesets are merged to main, the release workflow will:

1. Create a "Version Packages" PR that bumps versions
2. When that PR is merged, publish packages to npm

## License

MIT - see [LICENSE](LICENSE) for details.

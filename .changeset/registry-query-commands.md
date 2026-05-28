---
"@ofocus/sdk": minor
"@ofocus/cli": minor
"ofocus": minor
---

Drive `search`, `forecast`, `deferred`, and `quick` from centralized command descriptors

These four commands now flow from a single descriptor in the SDK that drives the SDK function, the CLI subcommand, and the MCP tool. This removes duplicate hand-written registrations across the three surfaces.

**New SDK exports**:

- `searchTasksDescriptor`
- `queryForecastDescriptor`
- `queryDeferredDescriptor`
- `quickCaptureDescriptor`

**CLI behavior change**:

- The `-n` short alias for `--note` on `ofocus quick` is removed. Use the long form `--note <text>` instead.

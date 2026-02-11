# OmniFocus CLI Monorepo

[![CI](https://github.com/mnorth/ofocus/actions/workflows/ci.yml/badge.svg)](https://github.com/mnorth/ofocus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A monorepo containing the OmniFocus CLI and SDK for AI agents.

> **Note**: Requires macOS with OmniFocus installed. The SDK communicates with OmniFocus via AppleScript.

## Packages

| Package | Description |
|---------|-------------|
| [`@ofocus/sdk`](./packages/sdk) | Core SDK with zero runtime dependencies |
| [`@ofocus/cli`](./packages/cli) | CLI using Commander.js |
| [`ofocus`](./packages/ofocus) | Umbrella package re-exporting both |

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 10.24.0
- macOS with OmniFocus installed (for integration tests)

### Setup

```bash
pnpm install
```

### Build

```bash
# Build all packages
pnpm build

# Build with clean
pnpm build:clean
```

### Test

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit
```

### Lint

```bash
# Check for lint errors
pnpm lint

# Fix lint errors
pnpm lint:fix
```

### Type Check

```bash
pnpm typecheck
```

### Quality Tools

```bash
# Check for unused exports/dependencies
pnpm knip

# Check dependency version consistency
pnpm syncpack:check

# Fix dependency version mismatches
pnpm syncpack:fix
```

### API Documentation

The SDK uses API Extractor to generate documentation:

```bash
# Generate API report (CI mode - fails on changes)
pnpm --filter @ofocus/sdk run api-extractor

# Update API report (local development)
pnpm --filter @ofocus/sdk run api-extractor:local

# Generate markdown documentation
pnpm --filter @ofocus/sdk run docs
```

## Architecture

```
of-cli/
├── packages/
│   ├── sdk/           # @ofocus/sdk - Core SDK
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── errors.ts
│   │   │   ├── result.ts
│   │   │   ├── applescript.ts
│   │   │   ├── escape.ts
│   │   │   ├── validation.ts
│   │   │   └── commands/
│   │   ├── api-report/
│   │   └── docs/
│   │
│   ├── cli/           # @ofocus/cli - CLI
│   │   └── src/
│   │       ├── index.ts
│   │       ├── cli.ts
│   │       ├── output.ts
│   │       └── commands/
│   │
│   └── ofocus/        # ofocus - Umbrella
│       └── src/
│           └── index.ts
```

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

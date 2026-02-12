# ofocus

## 0.1.0

### Minor Changes

- 7bab77a: Complete monorepo refactoring with quality tooling, CI/CD, and publishing setup
  - Add GitHub Actions CI workflow (build, lint, typecheck, test, api-extractor)
  - Add GitHub Actions release workflow for automated npm publishing via changesets
  - Add changesets for version management
  - Update license from UNLICENSED to MIT
  - Add publishConfig and repository metadata to all packages
  - Expand test coverage with result helpers and mocked command tests
  - Update AGENT_INSTRUCTIONS.md with SDK programmatic usage and troubleshooting
  - Generate API documentation with api-documenter
  - Fix ESLint error in CLI entry point
  - Fix Jest deprecation warning by enabling isolatedModules
  - Clean up knip configuration

### Patch Changes

- Updated dependencies [7bab77a]
- Updated dependencies [2b662a9]
  - @ofocus/sdk@0.1.0
  - @ofocus/cli@0.1.0

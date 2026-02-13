---
"@ofocus/sdk": patch
---

Improve unit test coverage across all SDK command files

- Add unit tests for 12 previously untested command modules: `archive`, `sync`, `stats`, `subtasks`, `projects`, `folders`, `tags-query`, `perspectives`, `deferred`, `forecast`, `attachments`, and `create-project`
- Fix timezone-related test failures in `stats.test.ts` date assertions
- Fix `focus.test.ts` validation test to match actual `validateProjectName` behavior
- Total unit test count increased from ~650 to 838 tests

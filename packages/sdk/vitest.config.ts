import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only - integration tests use vitest.integration.config.ts
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});

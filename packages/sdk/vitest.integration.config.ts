import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    // Integration tests run sequentially to avoid race conditions with OmniFocus
    sequence: {
      concurrent: false,
    },
    // Longer timeouts for AppleScript operations
    testTimeout: 30000,
    hookTimeout: 60000,
    // Fail fast on first error to speed up debugging
    bail: 1,
    // Allow console output for debugging
    silent: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tests/unit/**   — unit tests, always run
    // tests/uat/**    — subprocess UAT tests, opt-in via OFOCUS_UAT=1
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});

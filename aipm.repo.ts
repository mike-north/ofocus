import { defineRepoConfig } from "@ai-plugin-marketplace/core";

// The software lives under `packages/`; the agent plugin marketplace lives under
// `plugins/`. aipm writes generated per-target bundles to `dist/` (the software
// builds to `packages/*/dist`, so the repo root `dist/` is free).
export default defineRepoConfig({
  pluginsRoot: "plugins",
  distDir: "dist",
});

import { defineConfig } from "@ai-plugin-marketplace/core";

export default defineConfig({
  version: "0.1.0",
  targets: ["claude", "cursor", "codex", "vercel"],
  description:
    "Proactive OmniFocus change notifications (tiered, per-session, low-noise) plus an inbox-triage and co-planning skill. Built on the ofocus CLI.",
  keywords: [
    "omnifocus",
    "productivity",
    "notifications",
    "triage",
    "calendar",
  ],
});

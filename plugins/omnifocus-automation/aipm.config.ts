import { defineConfig } from "@ai-plugin-marketplace/core";

export default defineConfig({
  version: "0.2.1",
  targets: ["claude", "cursor", "codex", "vercel"],
  description:
    "OmniFocus chief-of-staff assistant: a proactive daily brief (what matters today, what's stuck, the next action per project), inbox triage and co-planning, and tiered low-noise change notifications. Built on the ofocus CLI.",
  keywords: [
    "omnifocus",
    "productivity",
    "chief-of-staff",
    "brief",
    "notifications",
    "triage",
    "calendar",
  ],
});

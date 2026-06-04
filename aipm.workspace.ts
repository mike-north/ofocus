import { defineWorkspace } from "@ai-plugin-marketplace/core";

// Opts the repo into generated marketplace registries. `name: "ofocus"` keeps the
// install id stable: `/plugin install ofocus-assistant@ofocus`.
export default defineWorkspace({
  marketplace: {
    name: "ofocus",
    owner: { name: "Mike North" },
    description:
      "OmniFocus AI assistant — proactive change notifications and inbox triage/co-planning, built on the ofocus CLI.",
  },
});

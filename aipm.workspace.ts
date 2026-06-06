import { defineWorkspace } from "@ai-plugin-marketplace/core";

// Opts the repo into generated marketplace registries. `name: "ofocus"` is the
// marketplace id — the `@ofocus` suffix of the install id
// `/plugin install omnifocus-automation@ofocus`. The plugin prefix
// (`omnifocus-automation`) comes from the plugin's own name, not from here.
export default defineWorkspace({
  marketplace: {
    name: "ofocus",
    owner: { name: "Mike North" },
    description:
      "OmniFocus AI assistant — proactive change notifications and inbox triage/co-planning, built on the ofocus CLI.",
  },
});

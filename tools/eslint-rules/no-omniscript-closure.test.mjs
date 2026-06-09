import { RuleTester } from "eslint";
import rule from "./no-omniscript-closure.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    // OmniFocus globals + standard JS globals are provided at runtime.
    globals: { flattenedTasks: "readonly", JSON: "readonly" },
  },
});

ruleTester.run("no-omniscript-closure", rule, {
  valid: [
    // References only its own param + a known global.
    `defineOmniScript((args) => { return flattenedTasks.byId(args.id); });`,
    // A locally-declared binding is fine.
    `defineOmniScript((args) => { const n = args.id.length; return n; });`,
    // A configured/standard global is allowed (must NOT be flagged as a closure).
    `defineOmniScript((args) => { return JSON.stringify(args); });`,
    // defineOmniAction validate: references only its own param — must NOT be flagged.
    `defineOmniAction((selection) => { void selection; }, { validate: (selection) => selection.tasks.length > 0 });`,
  ],
  invalid: [
    {
      // `outer` is a closed-over module-scope binding — not allowed.
      code: `const outer = 1; defineOmniScript((args) => { return outer + args.n; });`,
      errors: [{ messageId: "closure" }],
    },
    {
      // Regression: `cap` is a closed-over module-scope binding inside the
      // `validate` callback of defineOmniAction. Before the fix this was not
      // flagged, allowing broken serialised plugins that throw ReferenceError
      // inside OmniFocus.
      code: `const cap = 1; defineOmniAction(() => {}, { validate: () => cap > 0 });`,
      errors: [{ messageId: "closure" }],
    },
  ],
});

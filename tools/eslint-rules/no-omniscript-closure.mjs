/**
 * ESLint rule: no-omniscript-closure
 *
 * Enforces that callbacks passed to `defineOmniScript` / `defineOmniAction`
 * are self-contained — they may only reference their own parameters/locals or
 * globals declared in the ESLint config (OmniFocus runtime globals and
 * standard JS globals like `JSON`/`Date`/`console`).
 *
 * Closures over outer module/function-scope bindings and imports are
 * forbidden because OmniJS script bodies are serialised and run in a
 * separate global context where those bindings do not exist.
 *
 * @see {@link ../../docs/specs/2026-06-08-typed-omniautomation-foundation.md} §2.3
 */

const WRAPPERS = new Set(["defineOmniScript", "defineOmniAction"]);

export default {
  meta: {
    type: "problem",
    docs: {
      description: "OmniJS script/action bodies must be self-contained.",
    },
    messages: {
      closure:
        "'{{name}}' is closed over from an outer scope; OmniJS bodies run in a separate global and cannot reference closures or imports.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;

    /**
     * Walk all `through` (unresolved-within-callback) references of the
     * callback's scope tree and report any that resolve to a non-global
     * binding (i.e. a real closure or import).
     *
     * A reference is considered safe when:
     * - `ref.resolved` is null/undefined  →  truly unresolved; ESLint treats
     *   it as a global (e.g. an OmniFocus runtime global not listed in config)
     * - `ref.resolved.scope.type === "global"`  →  listed in ESLint's globals
     *   (standard JS globals or declared OmniFocus globals)
     *
     * A reference is flagged when:
     * - `ref.resolved.scope.type !== "global"`  →  resolves to a module-,
     *   function-, or block-scope binding in the outer code (a closure).
     */
    function checkCallback(node) {
      const scope = sourceCode.getScope(node);
      for (const ref of scope.through) {
        if (
          ref.resolved !== null &&
          ref.resolved !== undefined &&
          ref.identifier &&
          ref.resolved.scope.type !== "global"
        ) {
          context.report({
            node: ref.identifier,
            messageId: "closure",
            data: { name: ref.identifier.name },
          });
        }
      }
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          WRAPPERS.has(node.callee.name) &&
          node.arguments[0] !== undefined &&
          (node.arguments[0].type === "ArrowFunctionExpression" ||
            node.arguments[0].type === "FunctionExpression")
        ) {
          checkCallback(node.arguments[0]);
        }
      },
    };
  },
};

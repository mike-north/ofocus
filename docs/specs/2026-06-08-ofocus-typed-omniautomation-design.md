# Typed OmniAutomation Authoring — Foundation (v1)

**Date:** 2026-06-08
**Status:** Approved direction (foundation pillar; A3 is its first consumer)
**Scope:** Establishes the contract for authoring OmniFocus automation as type-checked
TypeScript instead of untyped OmniJS strings. Defines the core authoring primitives, the
ambient-type package, the v1 emit/install backends, package placement, and the testing
strategy. This document specifies the **contract**; the implementation plan is downstream.

**See also:** [Agent principles & roadmap](./2026-05-30-ofocus-agent-principles.md) ·
[Architecture](../architecture.md). The derived-state (A3) design is approved but its spec is
**forthcoming**; this foundation is sequenced ahead of A3 as its authoring substrate.

---

## 1. Thesis

> Make authoring OmniFocus automation **type-safe at the deepest layer**. An agent or human
> writes OmniJS as a type-checked TypeScript function — with autocomplete, lint, and the npm
> ecosystem — instead of concatenating untyped strings. The same typed core compiles to
> multiple **backends** (run-now, installable plugin, and — later — chat links and Shortcuts).

This extends the project's "type-safe at every layer" tenet down into the OmniJS that the SDK
itself emits today as hand-built string fragments (e.g. `packages/sdk/src/commands/inbox.ts`).
It also turns the untyped `eval` escape hatch into a **typed `eval`**: durable, reviewable,
version-controllable automation an agent authors once and reuses.

### Why now / why this shape

The current bridge (`packages/sdk/src/omnijs.ts`) already solves the hard *transport* problem:
`runOmniJS` escapes and evaluates a script via `osascript`, and the `eval` command
(`packages/sdk/src/commands/evaluate.ts`) already injects arguments through a JSON `args`
channel and expects a `return <expression>` tail. What is missing is **type safety in the
script body**. This spec adds that without changing the transport.

---

## 2. The core authoring primitives

Two authoring shapes, distinguished by what the surrounding OmniJS context provides. Both are
plain TypeScript functions, type-checked against the ambient OmniFocus globals (§3), and both
serialize to OmniJS via `Function.prototype.toString()` (§2.3).

### 2.1 `defineOmniScript` — run/eval shape (args → result)

For the osascript and (future) Script-URL backends, where the script receives JSON `args` and
returns a JSON-serializable value.

```ts
const nextStatus = defineOmniScript((args: { taskId: string }) => {
  const t = flattenedTasks.byId(args.taskId); // typed against OmniFocus globals
  return t ? t.taskStatus : null;             // return type T flows back to the caller
});
// nextStatus: OmniScript<{ taskId: string }, TaskStatus | null>
```

- The function's **parameter type** is the args contract; the **return type** `T` is the
  decoded result type the SDK hands back.
- Arguments are marshaled through the existing JSON channel (the `composeBody` pattern in
  `evaluate.ts`): the runtime injects `const __args = JSON.parse(<double-stringified literal>)`
  and the emitted body is `return JSON.stringify((<fnSource>)(__args));`. Values cannot break
  out of the argument context (they are JSON-encoded, never string-interpolated into code).

### 2.2 `defineOmniAction` — plugin action shape (selection, sender)

For the plugin-install backend, where OmniFocus invokes a `PlugIn.Action`'s `perform`
function with `(selection, sender)` and there is no args channel.

```ts
const archiveDone = defineOmniAction((selection, sender) => {
  // typed against OmniFocus globals + Selection
  selection.tasks.filter((t) => t.completed).forEach((t) => deleteObject(t));
}, {
  validate: (selection) => selection.tasks.length > 0, // optional; defaults to `() => true`
});
```

- The authored function becomes the action's `perform`; an optional `validate` becomes
  `action.validate`. Both are type-checked against the ambient types.

### 2.3 Mechanism (v1): `toString()` serialization + a static guardrail

The serialized function runs in OmniFocus's **separate JavaScript global**, with no access to
the authoring module's closures, imports, or module-scope variables. The function must be
**self-contained**: it may reference only its parameters, locally-declared bindings, and the
OmniFocus globals declared in `@ofocus/omnijs-types`.

- **Serialization:** `fn.toString()` at runtime yields the (already-transpiled) JS source,
  wrapped per backend (§4).
- **Guardrail (required):** a lightweight static check (lint rule / AST scan) flags the
  self-contained-function footguns at author time — references to identifiers that are neither
  parameters, local bindings, nor known OmniFocus globals; and any `import`/`require` inside a
  script/action body. This converts the most common runtime failure into an authoring-time
  warning.
- **Transpile target:** script/action bodies must compile to a JS dialect OmniFocus's engine
  accepts **without helper injection** (no `async`/iterator downleveling that emits
  `__awaiter`/regenerator helpers referencing module scope). The build pins a safe target and
  the guardrail rejects helper-emitting syntax in bodies.

**Deliberately deferred (additive, not rework):**
- **(B) Compiler-transform** (TS Compiler API): turns the guardrail's warnings into hard
  **compile errors**, enables source maps for in-OmniFocus stack traces, and can bundle
  helpers deliberately. A v2 hardening on the same core.
- **(C) TS language-service plugin:** editor-time diagnostics, OmniFocus-scoped completions,
  quick-fixes. A v3 DX layer. Built only after the DSL shape stabilizes.

Choosing A first is deliberate: A→B→C is **additive hardening of one core**, not a throwaway
path. v1 ships A with the guardrail; B and C upgrade enforcement and DX without changing the
authored surface.

---

## 3. Ambient types — `@ofocus/omnijs-types` (new package)

A **zero-runtime** package of ambient TypeScript declarations for the OmniJS global
environment, used at author time to type-check `defineOmniScript`/`defineOmniAction` bodies.

- **v1 coverage (a slice, not the whole API):** the surface A3's enrichment, the dogfooded
  command bodies, and the plugin/action backend need — e.g. `Task`, `Project`, `Folder`,
  `Tag`, `Database`, `Inbox`, `flattenedTasks`/`flattenedProjects`, `Task.Status`, `new Task`,
  `moveTasks`, `deleteObject`, `effectiveDueDate`/`effectiveDeferDate`, the repetition rule,
  plus the plugin surface (`PlugIn`, `PlugIn.Action`, `PlugIn.Library`), and `Selection`,
  `Alert`, `Form`/`Form.Field`, `Console`. Additional classes are added incrementally as
  consumers need them.
- **Authoring & drift:** the OmniJS API is **documented in prose only** — there is no
  machine-readable schema to generate from
  ([shared API reference](https://omni-automation.com/shared/index.html),
  [OmniFocus API](https://omni-automation.com/omnifocus/index.html)). Types are hand-authored.
  Because the live API can drift across OmniFocus builds, the package version is tracked
  against a known-good `app.version` (verified at build **185.15**), and a console-introspection
  check is provided to detect divergence. This maintenance cost is accepted and explicit.
- **Zero runtime dependencies**; ships only `.d.ts`. Consumable by the SDK and by external
  authors writing typed automations.

---

## 4. Backends (v1: two, both empirically confirmed — see §8)

A backend takes a serialized `OmniScript`/`OmniAction` and produces an executable or
installable artifact. The interface is designed so deferred backends (§9) slot in without
changing the core.

### 4.1 `osascript` — run-now

- **Emit:** `const __args = JSON.parse(<literal>); return JSON.stringify((<fnSource>)(__args));`,
  passed through the existing `runOmniJSWrapped` transport (`packages/sdk/src/omnijs.ts`).
- **Properties:** macOS only; headless; no approval prompt (uses the existing Apple-Events
  automation permission). This replaces the string-building in command bodies — the typed
  successor to `inbox.ts`-style emission.

### 4.2 `plugin-install` — durable, headless

- **Emit:** a single-file `.omnijs`:
  ```js
  /*{ "type":"action", "targets":["omnifocus"], "identifier":"<id>", "version":"<v>",
      "label":"<label>", "image":"<sf-symbol>" /* …optional metadata… */ }*/
  (() => {
    const action = new PlugIn.Action(<performSource>);
    action.validate = <validateSource | (() => true)>;
    return action;
  })();
  ```
  (Format per [plug-in API](https://omni-automation.com/plugins/api.html) and
  [single-file plug-in](https://omni-automation.com/plugins/simple.html). Required metadata
  keys: `type`, `targets`, `identifier`, `version`.)
- **Install:** write the file into the resolved OmniFocus Plug-Ins folder. OmniFocus
  **live-loads** it (confirmed §8). Headless; no approval sheet; no hosting.
- **Path resolution:** resolve the correct container Plug-Ins directory; the Mac App Store and
  direct-download builds differ. v1 targets the detected `com.omnigroup.OmniFocus4` container
  at `…/Data/Library/Application Support/Plug-Ins/`.
- **Uninstall caveat:** deleting the file does **not** live-unload the plugin — the in-memory
  registry clears only on OmniFocus relaunch (§8). v1 is **install-only**; uninstall is a
  documented relaunch step (a programmatic unload API has not been found).

### 4.3 Deferred backends (v2+, interface-compatible)

- **Script URL** `omnifocus://localhost/omnijs-run?script=…&arg=…` — run-once chat link;
  cross-platform; **per-script** approval (keyed to the exact body + sending app, so prefer
  stable parameterized scripts). ([script-url](https://omni-automation.com/script-url/index.html),
  [security](https://omni-automation.com/script-url/security.html))
- **Install Link** `omnifocus:///omnijs-install?path=…` — durable chat link; cross-platform;
  one approval per install. **The app fetches `path` client-side**, so a `localhost`/LAN URL
  works — no public hosting required (confirmed §8). ([install-links](https://omni-automation.com/plugins/install-links.html))
- **Shortcuts** ("Omni Automation Script" / "…Plug-In" actions) — scheduled/triggered
  execution (iOS Personal Automations). ([shortcuts](https://omni-automation.com/shortcuts/index.html))

---

## 5. Package placement

| Package | Role | Dependencies |
| --- | --- | --- |
| **`@ofocus/omnijs-types`** *(new)* | Ambient OmniJS type declarations. Zero runtime. | none |
| **`@ofocus/sdk`** | `defineOmniScript`/`defineOmniAction` core + the `osascript` and `plugin-install` backends. Node built-ins only (`child_process`, `fs` — both already sanctioned). | `zod`; `@ofocus/omnijs-types` (types only) |

Typed authoring + install are a **first-class SDK capability** — the SDK is the excellent
programmatic interface to OmniFocus, now type-safe end-to-end. v1's CLI/MCP impact is minimal;
the core is primarily a **programmatic authoring** surface. A thin `compile-and-install`
command (source file → installed plugin) is a later, thin descriptor over the core, consistent
with the descriptor registry (`architecture.md` §5) — not v1.

---

## 6. Dogfooding & relationship to A3

- A3's relational `blockedReason` enrichment (`sequential-predecessor`, `incomplete-children`),
  which requires walking siblings/children in OmniFocus, is **authored on `defineOmniScript`**
  as the foundation's first real consumer — proving the core on genuine work rather than a toy.
  (A3's design is approved; its spec is forthcoming and sequenced after this foundation.)
- A3 derived-state shipped as a `PlugIn.Library` (so any agent/user script can call it via
  `PlugIn.find(...)`) is a compelling convergence but **deferred** — it needs a library-emission
  backend, which is out of v1 scope.

---

## 7. Governance & testing

### Governance
`@ofocus/omnijs-types` and the new SDK authoring surface are brought under
**api-extractor + api-report + TSDoc + changesets**, extending the SDK's existing setup. The
authored API (`defineOmniScript`, `defineOmniAction`, the backend functions, and the exported
result types) is a supported public surface from day one, because external authors will depend
on it.

### Testing (spec-first; assert spec-derived values, never snapshots)
- **Unit:** serialization correctness (a given typed function → the exact expected OmniJS
  body, asserted against this spec's emit shapes in §4); the self-contained guardrail (flags a
  closed-over reference / an `import`); plugin-template emission (valid metadata header + the
  `PlugIn.Action` structure); Plug-Ins path resolution.
- **UAT (gated on `OmniFocus.app`; skipped in CI):** the round-trips verified by hand on
  2026-06-08, now automated:
  1. `defineOmniScript` → `osascript` returns the expected value.
  2. `defineOmniAction` → `plugin-install` → `PlugIn.all` reflects the new identifier.
  These encode the §8 findings as regression tests.

---

## 8. Empirical findings (verified 2026-06-08, OmniFocus build 185.15)

Established by direct experiment on the target machine; encoded as tests in §7.

1. **Install Links fetch client-side.** Firing
   `omnifocus:///omnijs-install?path=http://localhost:8765/test.omnijs` produced a `GET` from
   OmniFocus's own networking stack (`User-Agent: OmniFocus/185.15.0 CFNetwork/… Darwin/…`)
   against `localhost`. The on-device app fetches `path`; there is **no OmniGroup cloud relay**,
   so **public hosting is not required** — `localhost`/LAN URLs work.
2. **Headless folder-install works.** Writing a `.omnijs` directly into
   `…/com.omnigroup.OmniFocus4/Data/Library/Application Support/Plug-Ins/` caused OmniFocus to
   **load and register it immediately** (`PlugIn.all` reflected it) with **no approval sheet and
   no user interaction**. The CLI can write there from outside the sandbox (no TCC block).
3. **Load is live; unload is not.** Deleting a plugin file does not de-register it until
   OmniFocus relaunches; the in-memory `PlugIn.all` is stale until then.

---

## 9. Out of scope (v1)

Compiler-transform mechanism (B) and TS language-service plugin (C); the Script-URL,
Install-Link, and Shortcuts backends; `PlugIn.Library` emission; full ambient-type coverage;
any hosting / Vercel / GitHub apparatus; cross-device-sync automation (OmniSync/iCloud handle
propagation — see §10 open item).

---

## 10. Open / unverified items

- **Does the container Plug-Ins folder sync to other devices via OmniSync?** This is the
  local "On My Mac" location; the Omni Automation docs credit **iCloud Drive** for cross-device
  plug-in availability ([setup](https://omni-automation.com/omnifocus/setup.html)), while the
  user reports plug-ins syncing via OmniSync in practice. The exact synced location is
  unverified and warrants a check on a second device before any cross-device claim is made. It
  does **not** block v1 (which targets headless local install on macOS).

---

## 11. Roadmap reconciliation (same change set)

This pillar lands together with the principles-doc update already agreed for A3: mark
**A2 / A4 / calendar conversance shipped**, reconcile the stale "calendar out of scope" line to
the agent-supplies-snapshots boundary, record **A3's actual shape** (raw native fields in L1 +
derived engine as L2's enriched wrapping-SDK surface), and **add "type-safe at every layer" as a
first-class tenet** with this typed-authoring pillar placed on the capability roadmap.

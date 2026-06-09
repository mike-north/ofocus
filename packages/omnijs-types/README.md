# @ofocus/omnijs-types

Hand-authored TypeScript types for the OmniFocus OmniJS (Omni Automation) API, verified against build 185.15 and derived from [omni-automation.com](https://omni-automation.com/omnifocus/). `src/types.ts` holds the exported named shapes (API-Extractor-governed); `src/globals.ts` binds the OmniJS runtime globals (`flattenedTasks`, `Alert`, `PlugIn`, etc.) to those types so automation script bodies can use `Task`, `Project`, and the globals unqualified, without an import. No machine-readable schema exists for this API — extend the slice as consumers need more.

/**
 * @ofocus/productivity — Layer 2 productivity niceties built on @ofocus/sdk.
 *
 * @packageDocumentation
 */

import type { ResolvedCommandDescriptor } from "@ofocus/sdk";
import { changesDescriptor } from "./changes/command.js";
import { nextOccurrencesDescriptor } from "./commands/next-occurrences.js";

export { changesDescriptor } from "./changes/command.js";
export type { ChangesOutput, ChangesDeps } from "./changes/command.js";
export * from "./changes/types.js";
export { resolveDbPackagePath, readDbMtime } from "./changes/fda.js";

export {
  runNextOccurrences,
  nextOccurrencesDescriptor,
} from "./commands/next-occurrences.js";
export type {
  NextOccurrencesOutput,
  NextOccurrencesInput,
  NextOccurrencesDeps,
} from "./commands/next-occurrences.js";

/**
 * Every command descriptor contributed by the productivity package.
 * The CLI, MCP server, and docs generator compose this with the SDK's
 * `allCommandDescriptors`.
 *
 * @public
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous descriptors; see SDK all-descriptors.ts */
export const productivityDescriptors: readonly ResolvedCommandDescriptor<
  any,
  any,
  any
>[] = [changesDescriptor, nextOccurrencesDescriptor];
/* eslint-enable @typescript-eslint/no-explicit-any */

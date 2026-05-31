/**
 * @ofocus/productivity — Layer 2 productivity niceties built on @ofocus/sdk.
 *
 * @packageDocumentation
 */

import type { ResolvedCommandDescriptor } from "@ofocus/sdk";
import { changesDescriptor } from "./changes/command.js";

export { changesDescriptor } from "./changes/command.js";
export type { ChangesOutput, ChangesDeps } from "./changes/command.js";
export * from "./changes/types.js";

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
>[] = [changesDescriptor];
/* eslint-enable @typescript-eslint/no-explicit-any */

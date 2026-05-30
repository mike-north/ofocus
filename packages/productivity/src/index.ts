/**
 * @ofocus/productivity — Layer 2 productivity niceties built on @ofocus/sdk.
 *
 * @packageDocumentation
 */

import type { ResolvedCommandDescriptor } from "@ofocus/sdk";

/**
 * Every command descriptor contributed by the productivity package.
 * The CLI, MCP server, and docs generator compose this with the SDK's
 * `allCommandDescriptors` (the SDK cannot import these — productivity
 * depends on the SDK, not the other way around).
 *
 * @public
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous descriptor array; each element is a valid ResolvedCommandDescriptor with differing input/output/schema generics */
export const productivityDescriptors: readonly ResolvedCommandDescriptor<
  any,
  any,
  any
>[] = [];
/* eslint-enable @typescript-eslint/no-explicit-any */

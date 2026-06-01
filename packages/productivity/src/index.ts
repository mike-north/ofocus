/**
 * @ofocus/productivity — Layer 2 productivity niceties built on @ofocus/sdk.
 *
 * @packageDocumentation
 */

import type { ResolvedCommandDescriptor } from "@ofocus/sdk";
import { changesDescriptor } from "./changes/command.js";
import {
  thisWeekDescriptor,
  todayDescriptor,
} from "./commands/digests.js";
import { nextOccurrencesDescriptor } from "./commands/next-occurrences.js";
import { occurrencesDescriptor } from "./commands/occurrences.js";
import { resolveDescriptor } from "./commands/resolve.js";

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

export {
  runOccurrences,
  occurrencesDescriptor,
} from "./commands/occurrences.js";
export type {
  OccurrencesOutput,
  OccurrencesInput,
  OccurrencesDeps,
  Occurrence,
  OccurrencesWindow,
} from "./commands/occurrences.js";

export {
  endOfUtcDay,
  groupByDay,
  partitionToday,
  runThisWeek,
  runToday,
  thisWeekDescriptor,
  todayDescriptor,
} from "./commands/digests.js";
export type {
  DayGroup,
  ThisWeekDeps,
  TodayBucket,
  TodayDeps,
  TodayDigest,
  TodayItem,
  WeekDigest,
  WeekItem,
} from "./commands/digests.js";

export {
  runResolve,
  buildAnchorResolver,
  resolveDescriptor,
} from "./commands/resolve.js";
export type { ResolveOutput, ResolveDeps } from "./commands/resolve.js";

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
>[] = [
  changesDescriptor,
  nextOccurrencesDescriptor,
  occurrencesDescriptor,
  todayDescriptor,
  thisWeekDescriptor,
  resolveDescriptor,
];
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Shared helpers for the `link`, `unlink`, `links`, and `readiness` command modules.
 *
 * These are internal to the productivity package — they are NOT re-exported from
 * `src/index.ts` and carry no `@public` tag. Two command modules import from here
 * rather than duplicating the helpers.
 */
import { z } from "zod";
import { FileLinkStore } from "../links/store.js";
import { readTaskStates } from "../links/scan-task-state.js";
import type { EventInput } from "../links/types.js";
import type { LinkDeps } from "./link.js";

/** Zod schema for an agent-supplied event object. */
const eventObjectSchema = z.object({
  eventId: z.string().min(1).describe("Stable event id from your calendar source"),
  title: z.string().describe("Event title"),
  start: z.string().describe("Event start (ISO 8601)"),
  end: z.string().describe("Event end (ISO 8601)"),
  location: z.string().optional().describe("Event location"),
  source: z.string().optional().describe("Calendar source, e.g. google | ms365"),
});

/**
 * Accept either a structured object (MCP) or a JSON string (CLI).
 * Applied with `z.preprocess` so both transports work transparently.
 */
export const eventArgSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v; // leave as-is so object validation fails with a clear error
  }
}, eventObjectSchema);

/** Map the zod-inferred event to an EventInput (handles exactOptionalPropertyTypes). */
export function toEventInput(e: z.infer<typeof eventObjectSchema>): EventInput {
  return {
    eventId: e.eventId,
    title: e.title,
    start: e.start,
    end: e.end,
    ...(e.location !== undefined ? { location: e.location } : {}),
    ...(e.source !== undefined ? { source: e.source } : {}),
  };
}

/** Production dependencies factory. Creates a fresh set of deps for each command invocation. */
export function realLinkDeps(): LinkDeps {
  return {
    store: new FileLinkStore(),
    fetchTaskStates: readTaskStates,
    now: new Date().toISOString(),
  };
}

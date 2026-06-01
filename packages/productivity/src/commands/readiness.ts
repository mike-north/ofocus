/**
 * `readiness` — meeting-readiness for a calendar event: gather its `prep-for`
 * links, read the live task state, and compute the verdict (spec §3.3). An
 * inline `--event` override refreshes the stored snapshots first (refresh on
 * supply); without it, the most recently captured stored snapshot is used.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.4
 */
import {
  type CliOutput,
  ErrorCode,
  createError,
  defineCommand,
  failure,
  success,
} from "@ofocus/sdk";
import { z } from "zod";
import { FileLinkStore } from "../links/store.js";
import { readTaskStates } from "../links/scan-task-state.js";
import { readiness } from "../links/readiness.js";
import type { LinkDeps } from "./link.js";
import type {
  EventInput,
  EventSnapshot,
  PrepEntry,
  ReadinessResult,
  TaskEventLink,
  TaskState,
} from "../links/types.js";

interface ReadinessInput {
  eventId?: string | undefined;
  event?: EventInput | undefined;
  now?: string | undefined;
}

/** Validate an inline event override and stamp `capturedAt` from `now`. */
function overrideSnapshot(
  event: EventInput,
  now: string,
): { ok: true; value: EventSnapshot } | { ok: false; message: string } {
  if (event.eventId.trim().length === 0) {
    return { ok: false, message: "event.eventId is required" };
  }
  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  if (Number.isNaN(startMs)) {
    return { ok: false, message: `event.start is not a valid ISO date: ${event.start}` };
  }
  if (Number.isNaN(endMs)) {
    return { ok: false, message: `event.end is not a valid ISO date: ${event.end}` };
  }
  if (endMs < startMs) return { ok: false, message: "event.end is before event.start" };
  return {
    ok: true,
    value: {
      eventId: event.eventId,
      title: event.title,
      start: event.start,
      end: event.end,
      capturedAt: now,
      ...(event.location !== undefined ? { location: event.location } : {}),
      ...(event.source !== undefined ? { source: event.source } : {}),
    },
  };
}

/**
 * Core handler for `readiness`.
 *
 * @public
 */
export async function runReadiness(
  input: ReadinessInput,
  deps: LinkDeps,
): Promise<CliOutput<ReadinessResult>> {
  const eventId = (input.eventId ?? "").trim();
  if (eventId.length === 0) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, "readiness requires --event-id"));
  }
  const nowOverride = (input.now ?? "").trim();
  const now = nowOverride.length > 0 ? nowOverride : deps.now;

  let links: TaskEventLink[];
  try {
    links = await deps.store.byEvent(eventId);
  } catch (e) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        e instanceof Error ? e.message : "failed to read links",
      ),
    );
  }
  const prep = links.filter((l) => l.linkType === "prep-for");

  // Resolve the event snapshot to compute against.
  let event: EventSnapshot;
  if (input.event !== undefined) {
    const snap = overrideSnapshot(input.event, now);
    if (!snap.ok) return failure(createError(ErrorCode.VALIDATION_ERROR, snap.message));
    event = snap.value;
    // Refresh on supply: persist the new snapshot into every prep link. If one
    // upsert throws mid-loop the store is transiently mixed, but upsert is
    // idempotent so a retry with the same --event converges all links.
    try {
      for (const l of prep) await deps.store.upsert({ ...l, event });
    } catch (e) {
      return failure(
        createError(
          ErrorCode.UNKNOWN_ERROR,
          e instanceof Error ? e.message : "failed to refresh snapshots",
        ),
      );
    }
  } else if (prep.length > 0) {
    event = prep.reduce((a, b) =>
      a.event.capturedAt >= b.event.capturedAt ? a : b,
    ).event;
  } else {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        `No prep-for links for event ${eventId}; supply --event to assess a new one`,
      ),
    );
  }

  // Live task state is required for a correct verdict — fail if unreachable.
  let states: TaskState[];
  try {
    states = await deps.fetchTaskStates(prep.map((l) => l.taskId));
  } catch (e) {
    return failure(
      createError(
        ErrorCode.OMNIFOCUS_NOT_RUNNING,
        e instanceof Error ? e.message : "OmniFocus is not reachable",
      ),
    );
  }
  const byId = new Map(states.map((s) => [s.taskId, s]));
  const entries: PrepEntry[] = prep.map((l) => ({
    taskId: l.taskId,
    state: byId.get(l.taskId) ?? null,
  }));

  return success(readiness(event, entries, now));
}

function realLinkDeps(): LinkDeps {
  return {
    store: new FileLinkStore(),
    fetchTaskStates: readTaskStates,
    now: new Date().toISOString(),
  };
}

const eventObjectSchema = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  location: z.string().optional(),
  source: z.string().optional(),
});
const eventArgSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}, eventObjectSchema);

/** Map the zod-inferred event to an EventInput (handles exactOptionalPropertyTypes). */
function toEventInput(e: z.infer<typeof eventObjectSchema>): EventInput {
  return {
    eventId: e.eventId,
    title: e.title,
    start: e.start,
    end: e.end,
    ...(e.location !== undefined ? { location: e.location } : {}),
    ...(e.source !== undefined ? { source: e.source } : {}),
  };
}

/**
 * Descriptor for the `readiness` command.
 *
 * @public
 */
export const readinessDescriptor = defineCommand({
  name: "readiness",
  cliName: "readiness",
  mcpName: "readiness",
  description:
    "Assess meeting readiness for a calendar event: are its prep-for tasks done, " +
    "and are they on track relative to the event start? Pass --event to refresh the " +
    "stored snapshot with current calendar data.",
  cliPositional: [],
  inputSchema: z.object({
    eventId: z.string().describe("The event id to assess"),
    event: eventArgSchema
      .optional()
      .describe("Optional fresh event JSON to refresh the stored snapshot"),
    now: z
      .string()
      .optional()
      .describe("Override the current instant (ISO 8601; for testing/determinism)"),
  }),
  handler: async (parsed): Promise<CliOutput<ReadinessResult>> =>
    runReadiness(
      {
        eventId: parsed.eventId,
        ...(parsed.event !== undefined ? { event: toEventInput(parsed.event) } : {}),
        ...(parsed.now !== undefined ? { now: parsed.now } : {}),
      },
      realLinkDeps(),
    ),
});

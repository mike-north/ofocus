/**
 * `link` / `unlink` / `links` — create, remove, and list task↔event links.
 *
 * All OmniFocus and disk I/O is behind injected {@link LinkDeps} so handlers are
 * unit-testable offline. `ofocus` never reads a calendar: event data arrives via
 * the `--event` JSON argument (a structured object over MCP; a JSON string over
 * the CLI, transparently parsed by a `z.preprocess` wrapper).
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.4
 */
import { z } from "zod";
import {
  type CliOutput,
  ErrorCode,
  createError,
  defineCommand,
  failure,
  success,
} from "@ofocus/sdk";
import type { LinkStore } from "../links/store.js";
import { blockCoverage, needsRefresh } from "../links/readiness.js";
import { eventArgSchema, toEventInput, realLinkDeps } from "./links-shared.js";
import type {
  BlockCoverage,
  EventInput,
  EventSnapshot,
  LinkType,
  RefreshStatus,
  TaskEventLink,
  TaskState,
} from "../links/types.js";

/**
 * Injected dependencies for the link commands.
 *
 * @public
 */
export interface LinkDeps {
  store: LinkStore;
  /** Resolves live state for the given task ids; rejects if OmniFocus is unreachable. */
  fetchTaskStates: (ids: string[]) => Promise<TaskState[]>;
  /** Current instant (ISO 8601), injected for determinism. */
  now: string;
}

interface LinkInput {
  taskId?: string | undefined;
  event?: EventInput | undefined;
  type?: LinkType | undefined;
  note?: string | undefined;
}

interface UnlinkInput {
  taskId?: string | undefined;
  eventId?: string | undefined;
  type?: LinkType | undefined;
}

interface LinksInput {
  task?: string | undefined;
  eventId?: string | undefined;
  prune?: boolean | undefined;
}

/**
 * Result of `link`.
 *
 * @public
 */
export interface LinkResult {
  link: TaskEventLink;
  /** False when OmniFocus was unreachable and the task could not be verified. */
  taskVerified: boolean;
  refresh: RefreshStatus;
}

/**
 * A listed link with its computed annotations.
 *
 * @public
 */
export interface ListedLink {
  link: TaskEventLink;
  refresh: RefreshStatus;
  /** Present only for time-block links. */
  blockCoverage?: BlockCoverage;
}

/**
 * Result of `links`.
 *
 * @public
 */
export interface LinksResult {
  links: ListedLink[];
  /** Number of links removed by `--prune` (0 when not pruning). */
  pruned: number;
}

/** Validate an agent-supplied event and stamp `capturedAt`. */
function toSnapshot(
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
  if (endMs < startMs) {
    return { ok: false, message: "event.end is before event.start" };
  }
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
 * Core handler for `link`.
 *
 * @public
 */
export async function runLink(
  input: LinkInput,
  deps: LinkDeps,
): Promise<CliOutput<LinkResult>> {
  const taskId = (input.taskId ?? "").trim();
  if (taskId.length === 0) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, "link requires a taskId"));
  }
  if (input.event === undefined) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, "link requires --event"));
  }
  const snap = toSnapshot(input.event, deps.now);
  if (!snap.ok) {
    return failure(createError(ErrorCode.VALIDATION_ERROR, snap.message));
  }

  // Verify the task exists; if OmniFocus is unreachable, store anyway (fail-open).
  let taskVerified = true;
  try {
    const states = await deps.fetchTaskStates([taskId]);
    if (states.length === 0) {
      return failure(
        createError(ErrorCode.TASK_NOT_FOUND, `No task with id: ${taskId}`),
      );
    }
  } catch {
    taskVerified = false;
  }

  const linkType: LinkType = input.type ?? "prep-for";
  const link: TaskEventLink = {
    taskId,
    linkType,
    event: snap.value,
    createdAt: deps.now,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  try {
    await deps.store.upsert(link);
  } catch (e) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        e instanceof Error ? e.message : "failed to persist link",
      ),
    );
  }
  return success({
    link,
    taskVerified,
    refresh: needsRefresh(link, deps.now),
  });
}

/**
 * Core handler for `unlink`.
 *
 * @public
 */
export async function runUnlink(
  input: UnlinkInput,
  deps: LinkDeps,
): Promise<CliOutput<{ removed: boolean }>> {
  const taskId = (input.taskId ?? "").trim();
  const eventId = (input.eventId ?? "").trim();
  if (taskId.length === 0 || eventId.length === 0) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "unlink requires both a taskId and --event-id"),
    );
  }
  const linkType: LinkType = input.type ?? "prep-for";
  try {
    const removed = await deps.store.remove(taskId, linkType, eventId);
    return success({ removed });
  } catch (e) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        e instanceof Error ? e.message : "failed to remove link",
      ),
    );
  }
}

/**
 * Core handler for `links`.
 *
 * @public
 */
export async function runLinks(
  input: LinksInput,
  deps: LinkDeps,
): Promise<CliOutput<LinksResult>> {
  const task = (input.task ?? "").trim();
  const eventId = (input.eventId ?? "").trim();
  // Reject both-empty and both-present; require exactly one selector.
  if ((task.length === 0) === (eventId.length === 0)) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "links requires exactly one of --task or --event-id",
      ),
    );
  }

  let links: TaskEventLink[];
  try {
    links = task.length > 0 ? await deps.store.byTask(task) : await deps.store.byEvent(eventId);
  } catch (e) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        e instanceof Error ? e.message : "failed to read links",
      ),
    );
  }

  // Fetch task states once for coverage + open/closed (for staleness) + prune.
  const ids = [...new Set(links.map((l) => l.taskId))];
  let states: TaskState[] = [];
  let omniReachable = true;
  try {
    states = await deps.fetchTaskStates(ids);
  } catch {
    omniReachable = false;
  }
  const byId = new Map(states.map((s) => [s.taskId, s]));

  let pruned = 0;
  if (input.prune === true && omniReachable) {
    for (const l of links) {
      if (!byId.has(l.taskId)) {
        if (await deps.store.remove(l.taskId, l.linkType, l.event.eventId)) pruned += 1;
      }
    }
    links = links.filter((l) => byId.has(l.taskId));
  }

  const listed: ListedLink[] = links.map((l) => {
    const state = byId.get(l.taskId) ?? null;
    const taskOpen = state ? !state.completed : true;
    const base: ListedLink = {
      link: l,
      refresh: needsRefresh(l, deps.now, taskOpen),
    };
    if (l.linkType === "time-block") {
      base.blockCoverage = blockCoverage(l.event, state ? state.estimatedMinutes : null);
    }
    return base;
  });

  return success({ links: listed, pruned });
}

/**
 * Descriptor for the `link` command.
 *
 * @public
 */
export const linkDescriptor = defineCommand({
  name: "link",
  cliName: "link",
  mcpName: "link",
  description:
    "Link an OmniFocus task to a calendar event the agent supplies. " +
    "--type prep-for (task done before the event) or time-block (event reserves work time). " +
    "ofocus never reads a calendar; pass event data via --event.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The task to link"),
    event: eventArgSchema.describe(
      'Event JSON: {"eventId","title","start","end","location"?,"source"?}',
    ),
    type: z
      .enum(["prep-for", "time-block"])
      .optional()
      .describe("Link type (default: prep-for)"),
    note: z.string().optional().describe("Optional note describing the link"),
  }),
  handler: async (parsed): Promise<CliOutput<LinkResult>> =>
    runLink(
      {
        taskId: parsed.taskId,
        event: toEventInput(parsed.event),
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
        ...(parsed.note !== undefined ? { note: parsed.note } : {}),
      },
      realLinkDeps(),
    ),
});

/**
 * Descriptor for the `unlink` command.
 *
 * @public
 */
export const unlinkDescriptor = defineCommand({
  name: "unlink",
  cliName: "unlink",
  mcpName: "unlink",
  description: "Remove a task↔event link by task id, event id, and type.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The linked task id"),
    eventId: z.string().describe("The linked event id"),
    type: z
      .enum(["prep-for", "time-block"])
      .optional()
      .describe("Link type (default: prep-for)"),
  }),
  handler: async (parsed): Promise<CliOutput<{ removed: boolean }>> =>
    runUnlink(
      {
        taskId: parsed.taskId,
        eventId: parsed.eventId,
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
      },
      realLinkDeps(),
    ),
});

/**
 * Descriptor for the `links` command.
 *
 * @public
 */
export const linksDescriptor = defineCommand({
  name: "links",
  cliName: "links",
  mcpName: "links",
  description:
    "List task↔event links for a task (--task) or an event (--event-id). " +
    "Each link is annotated with refresh status and (for time-blocks) coverage. " +
    "--prune drops links whose task no longer exists.",
  cliPositional: [],
  inputSchema: z.object({
    task: z.string().optional().describe("List links for this task id"),
    eventId: z.string().optional().describe("List links for this event id"),
    prune: z
      .boolean()
      .optional()
      .describe("Remove links whose task no longer exists"),
  }),
  handler: async (parsed): Promise<CliOutput<LinksResult>> =>
    runLinks(
      {
        ...(parsed.task !== undefined ? { task: parsed.task } : {}),
        ...(parsed.eventId !== undefined ? { eventId: parsed.eventId } : {}),
        ...(parsed.prune !== undefined ? { prune: parsed.prune } : {}),
      },
      realLinkDeps(),
    ),
});

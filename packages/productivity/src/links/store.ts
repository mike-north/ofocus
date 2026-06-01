/**
 * Pluggable persistence for task↔event links.
 *
 * The {@link LinkStore} interface is the seam that lets a future cloud backend
 * (e.g. Airtable, for cloud agents) drop in behind the same contract; the
 * reusable conformance suite in the tests verifies any implementation. The
 * default {@link FileLinkStore} keeps a single atomic JSON document under
 * `OFOCUS_STATE_DIR`, reusing the conventions established by the `changes` cache.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.2
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LinkType, TaskEventLink } from "./types.js";

/**
 * Persistence contract for task↔event links.
 *
 * @public
 */
export interface LinkStore {
  /** Insert or replace a link by its composite key (taskId, linkType, eventId). */
  upsert(link: TaskEventLink): Promise<void>;
  /** Remove a link by composite key; resolves `true` if one was removed. */
  remove(taskId: string, linkType: LinkType, eventId: string): Promise<boolean>;
  /** All links for a task. */
  byTask(taskId: string): Promise<TaskEventLink[]>;
  /** All links for an event. */
  byEvent(eventId: string): Promise<TaskEventLink[]>;
  /** Every link (for reconcile / prune). */
  all(): Promise<TaskEventLink[]>;
}

/** Composite identity for a link. */
function keyOf(taskId: string, linkType: LinkType, eventId: string): string {
  return `${taskId}::${linkType}::${eventId}`;
}

/**
 * Resolve the state directory: explicit arg > OFOCUS_STATE_DIR > ~/.ofocus.
 */
export function resolveStateDir(stateDir?: string): string {
  if (stateDir !== undefined && stateDir.length > 0) return stateDir;
  const env = process.env["OFOCUS_STATE_DIR"];
  if (env !== undefined && env.length > 0) return env;
  return join(homedir(), ".ofocus");
}

/** On-disk shape of the links document. */
interface LinksFile {
  version: 1;
  links: TaskEventLink[];
}

/**
 * Local-JSON {@link LinkStore}. One document at `${stateDir}/links.json`.
 *
 * Reads: a missing file resolves to an empty set; a corrupt file rejects so the
 * caller surfaces a failure rather than silently discarding user state.
 * Writes: atomic (temp file + rename), creating parent dirs.
 *
 * @public
 */
export class FileLinkStore implements LinkStore {
  private readonly path: string;

  constructor(stateDir?: string) {
    this.path = join(resolveStateDir(stateDir), "links.json");
  }

  private read(): TaskEventLink[] {
    if (!existsSync(this.path)) return [];
    const raw = readFileSync(this.path, "utf8");
    const parsed = JSON.parse(raw) as Partial<LinksFile>; // throws on corrupt → caller surfaces failure
    if (parsed.version !== 1 || !Array.isArray(parsed.links)) return [];
    return parsed.links;
  }

  private write(links: TaskEventLink[]): void {
    mkdirSync(join(this.path, ".."), { recursive: true });
    const doc: LinksFile = { version: 1, links };
    const tmp = `${this.path}.tmp-${String(process.pid)}`;
    writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
    renameSync(tmp, this.path);
  }

  upsert(link: TaskEventLink): Promise<void> {
    try {
      const links = this.read();
      const k = keyOf(link.taskId, link.linkType, link.event.eventId);
      const next = links.filter(
        (l) => keyOf(l.taskId, l.linkType, l.event.eventId) !== k,
      );
      next.push(link);
      this.write(next);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  remove(taskId: string, linkType: LinkType, eventId: string): Promise<boolean> {
    try {
      const links = this.read();
      const k = keyOf(taskId, linkType, eventId);
      const next = links.filter(
        (l) => keyOf(l.taskId, l.linkType, l.event.eventId) !== k,
      );
      if (next.length === links.length) return Promise.resolve(false);
      this.write(next);
      return Promise.resolve(true);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  byTask(taskId: string): Promise<TaskEventLink[]> {
    try {
      return Promise.resolve(this.read().filter((l) => l.taskId === taskId));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  byEvent(eventId: string): Promise<TaskEventLink[]> {
    try {
      return Promise.resolve(
        this.read().filter((l) => l.event.eventId === eventId),
      );
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  all(): Promise<TaskEventLink[]> {
    try {
      return Promise.resolve(this.read());
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

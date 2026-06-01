/**
 * Tests for the LinkStore contract and the default FileLinkStore.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.2
 */
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileLinkStore, type LinkStore } from "../../src/links/store.js";
import type { TaskEventLink } from "../../src/links/types.js";

const CAPTURED_AT = "2026-06-01T09:00:00.000Z";
const CREATED_AT = "2026-06-01T09:00:00.000Z";

function link(overrides: Partial<TaskEventLink> = {}): TaskEventLink {
  return {
    taskId: overrides.taskId ?? "task-1",
    linkType: overrides.linkType ?? "prep-for",
    event: overrides.event ?? {
      eventId: "evt-1",
      title: "1:1 with Sarah",
      start: "2026-06-02T15:00:00.000Z",
      end: "2026-06-02T15:30:00.000Z",
      capturedAt: CAPTURED_AT,
    },
    createdAt: overrides.createdAt ?? CREATED_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
  };
}

/** Reusable conformance suite: any LinkStore implementation must satisfy it. */
export function runLinkStoreConformance(
  name: string,
  makeStore: () => LinkStore,
): void {
  describe(`LinkStore conformance: ${name}`, () => {
    it("upsert then byTask / byEvent returns the link", async () => {
      const store = makeStore();
      const l = link();
      await store.upsert(l);
      expect(await store.byTask("task-1")).toEqual([l]);
      expect(await store.byEvent("evt-1")).toEqual([l]);
    });

    it("upsert is idempotent on composite key (refreshes, does not duplicate)", async () => {
      const store = makeStore();
      await store.upsert(link());
      const refreshed = link({
        event: {
          eventId: "evt-1",
          title: "1:1 with Sarah (moved)",
          start: "2026-06-02T16:00:00.000Z",
          end: "2026-06-02T16:30:00.000Z",
          capturedAt: "2026-06-01T12:00:00.000Z",
        },
      });
      await store.upsert(refreshed);
      const all = await store.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.event.title).toBe("1:1 with Sarah (moved)");
    });

    it("different linkType for same task+event are distinct links", async () => {
      const store = makeStore();
      await store.upsert(link({ linkType: "prep-for" }));
      await store.upsert(link({ linkType: "time-block" }));
      expect(await store.byTask("task-1")).toHaveLength(2);
    });

    it("remove returns true when present, false when absent", async () => {
      const store = makeStore();
      await store.upsert(link());
      expect(await store.remove("task-1", "prep-for", "evt-1")).toBe(true);
      expect(await store.remove("task-1", "prep-for", "evt-1")).toBe(false);
      expect(await store.byTask("task-1")).toEqual([]);
    });

    it("byTask / byEvent return empty arrays for unknown keys", async () => {
      const store = makeStore();
      expect(await store.byTask("nope")).toEqual([]);
      expect(await store.byEvent("nope")).toEqual([]);
      expect(await store.all()).toEqual([]);
    });
  });
}

describe("FileLinkStore", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ofocus-links-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  runLinkStoreConformance("FileLinkStore", () => new FileLinkStore(dir));

  it("persists across instances (same state dir)", async () => {
    const a = new FileLinkStore(dir);
    await a.upsert(link());
    const b = new FileLinkStore(dir);
    expect(await b.byTask("task-1")).toHaveLength(1);
  });

  it("missing file → empty (no throw)", async () => {
    const store = new FileLinkStore(dir);
    expect(await store.all()).toEqual([]);
  });

  it("corrupt file → throws so the caller can surface a failure", async () => {
    writeFileSync(join(dir, "links.json"), "{ not json", "utf8");
    const store = new FileLinkStore(dir);
    await expect(store.all()).rejects.toThrow();
  });

  it("writes atomically (no leftover temp file)", async () => {
    const store = new FileLinkStore(dir);
    await store.upsert(link());
    const raw = readFileSync(join(dir, "links.json"), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ version: 1 });
    expect(readdirSync(dir).some((f) => f.includes(".tmp-"))).toBe(false);
  });
});

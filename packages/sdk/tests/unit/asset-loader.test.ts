import { describe, it, expect, beforeEach } from "vitest";
import {
  getScriptPath,
  loadScriptContent,
  loadScriptContentCached,
  clearScriptCache,
} from "../../src/asset-loader.js";

describe("asset-loader", () => {
  beforeEach(() => {
    clearScriptCache();
  });

  describe("getScriptPath", () => {
    it("should return absolute path for helper scripts", () => {
      const path = getScriptPath("helpers/json.applescript");
      expect(path).toMatch(/scripts[/\\]helpers[/\\]json\.applescript$/);
      expect(path).toMatch(/^[/\\]|^[A-Z]:[/\\]/); // Absolute path (unix or windows)
    });

    it("should return absolute path for serializer scripts", () => {
      const path = getScriptPath("serializers/task.applescript");
      expect(path).toMatch(/scripts[/\\]serializers[/\\]task\.applescript$/);
    });
  });

  describe("loadScriptContent", () => {
    it("should load json.applescript content", async () => {
      const content = await loadScriptContent("helpers/json.applescript");
      expect(content).toContain("on jsonString(val)");
      expect(content).toContain("on jsonArray(theList)");
      expect(content).toContain("on escapeJson(str)");
    });

    it("should throw for non-existent scripts", async () => {
      await expect(
        loadScriptContent("nonexistent.applescript")
      ).rejects.toThrow();
    });

    it("should throw for empty path", async () => {
      await expect(loadScriptContent("")).rejects.toThrow();
    });

    it("should throw for path with only whitespace", async () => {
      await expect(loadScriptContent("   ")).rejects.toThrow();
    });

    it("should throw for directory traversal attempts", async () => {
      await expect(loadScriptContent("../../../etc/passwd")).rejects.toThrow();
    });

    it("should load all serializer scripts", async () => {
      const serializers = [
        "serializers/task.applescript",
        "serializers/project.applescript",
        "serializers/folder.applescript",
        "serializers/tag.applescript",
        "serializers/task-with-children.applescript",
      ];
      for (const serializer of serializers) {
        const content = await loadScriptContent(serializer);
        expect(content).toBeTruthy();
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it("should load all helper scripts", async () => {
      const helpers = [
        "helpers/json.applescript",
        "helpers/pagination.applescript",
        "helpers/safe-access.applescript",
      ];
      for (const helper of helpers) {
        const content = await loadScriptContent(helper);
        expect(content).toBeTruthy();
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  describe("loadScriptContentCached", () => {
    it("should return same content as uncached load", async () => {
      const uncached = await loadScriptContent("helpers/json.applescript");
      const cached = await loadScriptContentCached("helpers/json.applescript");
      expect(cached).toBe(uncached);
    });

    it("should return cached content on subsequent calls", async () => {
      const first = await loadScriptContentCached("helpers/json.applescript");
      const second = await loadScriptContentCached("helpers/json.applescript");
      // Both should be the exact same string reference after caching
      expect(second).toBe(first);
    });
  });

  describe("clearScriptCache", () => {
    it("should clear the cache", async () => {
      // Load once to populate cache
      await loadScriptContentCached("helpers/json.applescript");

      // Clear cache
      clearScriptCache();

      // This should work without errors (fresh load)
      const content = await loadScriptContentCached("helpers/json.applescript");
      expect(content).toContain("on jsonString");
    });
  });
});

import { describe, it, expect } from "vitest";
import { allCommandDescriptors } from "../../../src/registry/all-descriptors.js";
// Representative descriptor from each domain
import { addToInboxDescriptor } from "../../../src/commands/inbox.js";
import { queryTasksDescriptor } from "../../../src/commands/tasks.js";
import { completeTaskDescriptor } from "../../../src/commands/complete.js";
import { updateTaskDescriptor } from "../../../src/commands/update.js";
import { listProjectsDescriptor } from "../../../src/commands/projects.js";
import { createProjectDescriptor } from "../../../src/commands/create-project.js";
import { listFoldersDescriptor } from "../../../src/commands/folders.js";
import { listTagsDescriptor } from "../../../src/commands/tags.js";
import { reviewProjectDescriptor } from "../../../src/commands/review.js";
import { queryForecastDescriptor } from "../../../src/commands/forecast.js";
import { searchTasksDescriptor } from "../../../src/commands/search.js";
import { getStatsDescriptor } from "../../../src/commands/stats.js";
import { evaluateScriptDescriptor } from "../../../src/commands/evaluate.js";
import {
  exportTaskPaperDescriptor,
  importTaskPaperDescriptor,
} from "../../../src/commands/taskpaper.js";
import {
  getReviewIntervalDescriptor,
  setReviewIntervalDescriptor,
} from "../../../src/commands/review.js";

describe("allCommandDescriptors", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(allCommandDescriptors)).toBe(true);
    expect(allCommandDescriptors.length).toBeGreaterThan(0);
  });

  it("contains a representative descriptor from the Tasks domain", () => {
    expect(allCommandDescriptors).toContain(addToInboxDescriptor);
    expect(allCommandDescriptors).toContain(queryTasksDescriptor);
    expect(allCommandDescriptors).toContain(completeTaskDescriptor);
    expect(allCommandDescriptors).toContain(updateTaskDescriptor);
  });

  it("contains a representative descriptor from the Projects domain", () => {
    expect(allCommandDescriptors).toContain(listProjectsDescriptor);
    expect(allCommandDescriptors).toContain(createProjectDescriptor);
  });

  it("contains a representative descriptor from the Folders domain", () => {
    expect(allCommandDescriptors).toContain(listFoldersDescriptor);
  });

  it("contains a representative descriptor from the Tags domain", () => {
    expect(allCommandDescriptors).toContain(listTagsDescriptor);
  });

  it("contains descriptors from the Review domain (including get/set interval)", () => {
    expect(allCommandDescriptors).toContain(reviewProjectDescriptor);
    expect(allCommandDescriptors).toContain(getReviewIntervalDescriptor);
    expect(allCommandDescriptors).toContain(setReviewIntervalDescriptor);
  });

  it("contains descriptors from Forecast, Focus, Deferred", () => {
    expect(allCommandDescriptors).toContain(queryForecastDescriptor);
  });

  it("contains the search descriptor", () => {
    expect(allCommandDescriptors).toContain(searchTasksDescriptor);
  });

  it("contains the stats descriptor", () => {
    expect(allCommandDescriptors).toContain(getStatsDescriptor);
  });

  it("contains both TaskPaper descriptors (export and import-taskpaper)", () => {
    expect(allCommandDescriptors).toContain(exportTaskPaperDescriptor);
    expect(allCommandDescriptors).toContain(importTaskPaperDescriptor);
  });

  it("contains the eval escape-hatch descriptor", () => {
    expect(allCommandDescriptors).toContain(evaluateScriptDescriptor);
  });

  it("has no duplicate descriptor objects", () => {
    const seen = new Set();
    const duplicates: string[] = [];
    for (const d of allCommandDescriptors) {
      if (seen.has(d)) {
        duplicates.push(String(d.cliName));
      }
      seen.add(d);
    }
    expect(duplicates).toEqual([]);
  });

  it("every descriptor has a non-empty name, cliName, and description", () => {
    for (const d of allCommandDescriptors) {
      expect(
        String(d.name).trim().length,
        `name empty for a descriptor`
      ).toBeGreaterThan(0);
      expect(
        String(d.cliName).trim().length,
        `cliName empty for "${String(d.name)}"`
      ).toBeGreaterThan(0);
      expect(
        String(d.description).trim().length,
        `description empty for "${String(d.name)}"`
      ).toBeGreaterThan(0);
    }
  });

  it("every descriptor has an inputSchema with a .shape property", () => {
    for (const d of allCommandDescriptors) {
      expect(
        d.inputSchema !== null &&
          typeof d.inputSchema === "object" &&
          "shape" in d.inputSchema,
        `inputSchema missing or invalid for "${String(d.name)}"`
      ).toBe(true);
    }
  });

  it("every descriptor has a handler function", () => {
    for (const d of allCommandDescriptors) {
      expect(
        typeof d.handler,
        `handler not a function for "${String(d.name)}"`
      ).toBe("function");
    }
  });
});

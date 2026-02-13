/**
 * Tag Integration Tests
 *
 * Tests for tag CRUD operations against live OmniFocus.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IntegrationTestContext } from "./setup.js";
import {
  createTag,
  queryTags,
  updateTag,
  deleteTag,
  addToInbox,
} from "../../src/index.js";

describe("Tag Integration", () => {
  let ctx: IntegrationTestContext;

  beforeAll(() => {
    ctx = new IntegrationTestContext();
  });

  afterAll(async () => {
    const result = await ctx.cleanup();
    if (!result.success) {
      console.warn("Cleanup had errors:", result.errors);
    }
  });

  describe("tag creation", () => {
    it("creates a basic tag", async () => {
      const name = ctx.generateName("basic-tag");
      const result = await createTag(name);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBeDefined();
      expect(result.data!.name).toBe(name);

      ctx.trackTag(result.data!.id);
    });

    it("creates nested tag by parent name", async () => {
      const parentName = ctx.generateName("parent-tag");
      const parentResult = await createTag(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackTag(parentResult.data!.id);

      const childName = ctx.generateName("child-tag");
      const childResult = await createTag(childName, {
        parentTagName: parentName,
      });

      expect(childResult.success).toBe(true);
      expect(childResult.data!.parentId).toBe(parentResult.data!.id);
      expect(childResult.data!.parentName).toBe(parentName);

      ctx.trackTag(childResult.data!.id);
    });

    it("creates nested tag by parent ID", async () => {
      const parentName = ctx.generateName("parent-tag-id");
      const parentResult = await createTag(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackTag(parentResult.data!.id);

      const childName = ctx.generateName("child-tag-id");
      const childResult = await createTag(childName, {
        parentTagId: parentResult.data!.id,
      });

      expect(childResult.success).toBe(true);
      expect(childResult.data!.parentId).toBe(parentResult.data!.id);

      ctx.trackTag(childResult.data!.id);
    });
  });

  describe("tag queries", () => {
    it("queries all tags and finds test tag", async () => {
      const name = ctx.generateName("query-tag");
      const createResult = await createTag(name);
      expect(createResult.success).toBe(true);
      ctx.trackTag(createResult.data!.id);

      const queryResult = await queryTags({});

      expect(queryResult.success).toBe(true);
      expect(queryResult.data).toBeDefined();

      const found = queryResult.data!.items.find(
        (t) => t.id === createResult.data!.id
      );
      expect(found).toBeDefined();
    });

    it("queries tags by parent", async () => {
      const parentName = ctx.generateName("parent-query");
      const parentResult = await createTag(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackTag(parentResult.data!.id);

      const childName = ctx.generateName("child-query");
      const childResult = await createTag(childName, {
        parentTagId: parentResult.data!.id,
      });
      expect(childResult.success).toBe(true);
      ctx.trackTag(childResult.data!.id);

      // queryTags expects parent NAME, not ID
      const queryResult = await queryTags({ parent: parentName });

      expect(queryResult.success).toBe(true);
      const found = queryResult.data!.items.find(
        (t) => t.id === childResult.data!.id
      );
      expect(found).toBeDefined();
    });
  });

  describe("tag updates", () => {
    it("updates tag name", async () => {
      const name = ctx.generateName("update-tag");
      const createResult = await createTag(name);
      expect(createResult.success).toBe(true);
      ctx.trackTag(createResult.data!.id);

      const newName = ctx.generateName("updated-tag");
      const updateResult = await updateTag(createResult.data!.id, {
        name: newName,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.name).toBe(newName);
    });

    it("moves tag to new parent", async () => {
      // Create two parent tags
      const parent1Name = ctx.generateName("parent1-move");
      const parent1Result = await createTag(parent1Name);
      expect(parent1Result.success).toBe(true);
      ctx.trackTag(parent1Result.data!.id);

      const parent2Name = ctx.generateName("parent2-move");
      const parent2Result = await createTag(parent2Name);
      expect(parent2Result.success).toBe(true);
      ctx.trackTag(parent2Result.data!.id);

      // Create child under parent1
      const childName = ctx.generateName("child-move");
      const childResult = await createTag(childName, {
        parentTagId: parent1Result.data!.id,
      });
      expect(childResult.success).toBe(true);
      ctx.trackTag(childResult.data!.id);

      // Move child to parent2
      const updateResult = await updateTag(childResult.data!.id, {
        parentTagId: parent2Result.data!.id,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.parentId).toBe(parent2Result.data!.id);
    });
  });

  describe("tag usage with tasks", () => {
    it("creates task with tag", async () => {
      const tagName = ctx.generateName("task-tag");
      const tagResult = await createTag(tagName);
      expect(tagResult.success).toBe(true);
      ctx.trackTag(tagResult.data!.id);

      const taskName = ctx.generateName("tagged-task");
      const taskResult = await addToInbox(taskName, { tags: [tagName] });

      expect(taskResult.success).toBe(true);
      expect(taskResult.data!.tags).toContain(tagName);

      ctx.trackTask(taskResult.data!.id);
    });

    it("creates task with multiple tags", async () => {
      const tag1Name = ctx.generateName("multi-tag1");
      const tag1Result = await createTag(tag1Name);
      expect(tag1Result.success).toBe(true);
      ctx.trackTag(tag1Result.data!.id);

      const tag2Name = ctx.generateName("multi-tag2");
      const tag2Result = await createTag(tag2Name);
      expect(tag2Result.success).toBe(true);
      ctx.trackTag(tag2Result.data!.id);

      const taskName = ctx.generateName("multi-tagged-task");
      const taskResult = await addToInbox(taskName, {
        tags: [tag1Name, tag2Name],
      });

      expect(taskResult.success).toBe(true);
      expect(taskResult.data!.tags).toContain(tag1Name);
      expect(taskResult.data!.tags).toContain(tag2Name);

      ctx.trackTask(taskResult.data!.id);
    });

    it("verifies tag task count", async () => {
      const tagName = ctx.generateName("count-tag");
      const tagResult = await createTag(tagName);
      expect(tagResult.success).toBe(true);
      ctx.trackTag(tagResult.data!.id);

      // Initially zero tasks
      expect(tagResult.data!.availableTaskCount).toBe(0);

      // Add a task with this tag
      const taskName = ctx.generateName("count-task");
      const taskResult = await addToInbox(taskName, { tags: [tagName] });
      expect(taskResult.success).toBe(true);
      ctx.trackTask(taskResult.data!.id);

      // Query tag again
      const queryResult = await queryTags({});
      expect(queryResult.success).toBe(true);
      const updatedTag = queryResult.data!.items.find(
        (t) => t.id === tagResult.data!.id
      );
      expect(updatedTag).toBeDefined();
      expect(updatedTag!.availableTaskCount).toBe(1);
    });
  });

  describe("tag deletion", () => {
    it("deletes an unused tag", async () => {
      const name = ctx.generateName("delete-tag");
      const createResult = await createTag(name);
      expect(createResult.success).toBe(true);
      const tagId = createResult.data!.id;

      const deleteResult = await deleteTag(tagId);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data!.deleted).toBe(true);

      // Verify tag is gone
      const queryResult = await queryTags({});
      const found = queryResult.data?.items.find((t) => t.id === tagId);
      expect(found).toBeUndefined();

      // Don't track - it's already deleted
    });
  });

  describe("nested tag hierarchy", () => {
    it("creates three-level tag hierarchy", async () => {
      // Level 1
      const level1Name = ctx.generateName("tag-level1");
      const level1Result = await createTag(level1Name);
      expect(level1Result.success).toBe(true);
      ctx.trackTag(level1Result.data!.id);

      // Level 2
      const level2Name = ctx.generateName("tag-level2");
      const level2Result = await createTag(level2Name, {
        parentTagId: level1Result.data!.id,
      });
      expect(level2Result.success).toBe(true);
      expect(level2Result.data!.parentId).toBe(level1Result.data!.id);
      ctx.trackTag(level2Result.data!.id);

      // Level 3
      const level3Name = ctx.generateName("tag-level3");
      const level3Result = await createTag(level3Name, {
        parentTagId: level2Result.data!.id,
      });
      expect(level3Result.success).toBe(true);
      expect(level3Result.data!.parentId).toBe(level2Result.data!.id);
      ctx.trackTag(level3Result.data!.id);

      // Verify hierarchy via query (queryTags expects parent NAME, not ID)
      const level3Query = await queryTags({ parent: level2Name });
      expect(level3Query.success).toBe(true);
      const foundLevel3 = level3Query.data!.find(
        (t) => t.id === level3Result.data!.id
      );
      expect(foundLevel3).toBeDefined();
    });
  });
});

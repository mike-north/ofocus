/**
 * Folder Integration Tests
 *
 * Tests for folder CRUD operations against live OmniFocus.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IntegrationTestContext } from "./setup.js";
import {
  createFolder,
  queryFolders,
  updateFolder,
  deleteFolder,
  createProject,
} from "../../src/index.js";

describe("Folder Integration", () => {
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

  describe("folder creation", () => {
    it("creates a basic folder", async () => {
      const name = ctx.generateName("basic-folder");
      const result = await createFolder(name);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBeDefined();
      expect(result.data!.name).toBe(name);

      ctx.trackFolder(result.data!.id);
    });

    it("creates nested folder by parent name", async () => {
      const parentName = ctx.generateName("parent-folder");
      const parentResult = await createFolder(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackFolder(parentResult.data!.id);

      const childName = ctx.generateName("child-folder");
      const childResult = await createFolder(childName, {
        parentFolderName: parentName,
      });

      expect(childResult.success).toBe(true);
      expect(childResult.data!.parentId).toBe(parentResult.data!.id);
      expect(childResult.data!.parentName).toBe(parentName);

      ctx.trackFolder(childResult.data!.id);
    });

    it("creates nested folder by parent ID", async () => {
      const parentName = ctx.generateName("parent-folder-id");
      const parentResult = await createFolder(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackFolder(parentResult.data!.id);

      const childName = ctx.generateName("child-folder-id");
      const childResult = await createFolder(childName, {
        parentFolderId: parentResult.data!.id,
      });

      expect(childResult.success).toBe(true);
      expect(childResult.data!.parentId).toBe(parentResult.data!.id);

      ctx.trackFolder(childResult.data!.id);
    });
  });

  describe("folder queries", () => {
    it("queries all folders and finds test folder", async () => {
      const name = ctx.generateName("query-folder");
      const createResult = await createFolder(name);
      expect(createResult.success).toBe(true);
      ctx.trackFolder(createResult.data!.id);

      const queryResult = await queryFolders({});

      expect(queryResult.success).toBe(true);
      expect(queryResult.data).toBeDefined();

      const found = queryResult.data!.items.find(
        (f) => f.id === createResult.data!.id
      );
      expect(found).toBeDefined();
    });

    it("queries folders by parent", async () => {
      const parentName = ctx.generateName("parent-query");
      const parentResult = await createFolder(parentName);
      expect(parentResult.success).toBe(true);
      ctx.trackFolder(parentResult.data!.id);

      const childName = ctx.generateName("child-query");
      const childResult = await createFolder(childName, {
        parentFolderId: parentResult.data!.id,
      });
      expect(childResult.success).toBe(true);
      ctx.trackFolder(childResult.data!.id);

      // Query with parent filter (expects parent NAME, not ID)
      const queryResult = await queryFolders({ parent: parentName });

      expect(queryResult.success).toBe(true);
      const found = queryResult.data!.items.find(
        (f) => f.id === childResult.data!.id
      );
      expect(found).toBeDefined();
    });
  });

  describe("folder updates", () => {
    it("updates folder name", async () => {
      const name = ctx.generateName("update-folder");
      const createResult = await createFolder(name);
      expect(createResult.success).toBe(true);
      ctx.trackFolder(createResult.data!.id);

      const newName = ctx.generateName("updated-folder");
      const updateResult = await updateFolder(createResult.data!.id, {
        name: newName,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.name).toBe(newName);
    });

    it("moves folder to new parent", async () => {
      // Create two parent folders
      const parent1Name = ctx.generateName("parent1-move");
      const parent1Result = await createFolder(parent1Name);
      expect(parent1Result.success).toBe(true);
      ctx.trackFolder(parent1Result.data!.id);

      const parent2Name = ctx.generateName("parent2-move");
      const parent2Result = await createFolder(parent2Name);
      expect(parent2Result.success).toBe(true);
      ctx.trackFolder(parent2Result.data!.id);

      // Create child in parent1
      const childName = ctx.generateName("child-move");
      const childResult = await createFolder(childName, {
        parentFolderId: parent1Result.data!.id,
      });
      expect(childResult.success).toBe(true);
      ctx.trackFolder(childResult.data!.id);

      // Move child to parent2
      const updateResult = await updateFolder(childResult.data!.id, {
        parentFolderId: parent2Result.data!.id,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.parentId).toBe(parent2Result.data!.id);
    });
  });

  describe("folder with projects", () => {
    it("creates project in folder", async () => {
      const folderName = ctx.generateName("folder-projects");
      const folderResult = await createFolder(folderName);
      expect(folderResult.success).toBe(true);
      ctx.trackFolder(folderResult.data!.id);

      const projectName = ctx.generateName("project-in-folder");
      const projectResult = await createProject(projectName, {
        folderId: folderResult.data!.id,
      });

      expect(projectResult.success).toBe(true);
      expect(projectResult.data!.folderId).toBe(folderResult.data!.id);
      expect(projectResult.data!.folderName).toBe(folderName);

      ctx.trackProject(projectResult.data!.id);
    });

    it("creates project in folder by name", async () => {
      const folderName = ctx.generateName("folder-by-name");
      const folderResult = await createFolder(folderName);
      expect(folderResult.success).toBe(true);
      ctx.trackFolder(folderResult.data!.id);

      const projectName = ctx.generateName("project-folder-name");
      const projectResult = await createProject(projectName, {
        folderName: folderName,
      });

      expect(projectResult.success).toBe(true);
      expect(projectResult.data!.folderId).toBe(folderResult.data!.id);

      ctx.trackProject(projectResult.data!.id);
    });
  });

  describe("folder deletion", () => {
    it("deletes an empty folder", async () => {
      const name = ctx.generateName("delete-folder");
      const createResult = await createFolder(name);
      expect(createResult.success).toBe(true);
      const folderId = createResult.data!.id;

      const deleteResult = await deleteFolder(folderId);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data!.deleted).toBe(true);

      // Verify folder is gone
      const queryResult = await queryFolders({});
      const found = queryResult.data?.items.find((f) => f.id === folderId);
      expect(found).toBeUndefined();

      // Don't track - it's already deleted
    });
  });

  describe("nested folder hierarchy", () => {
    it("creates three-level folder hierarchy", async () => {
      // Level 1
      const level1Name = ctx.generateName("level1");
      const level1Result = await createFolder(level1Name);
      expect(level1Result.success).toBe(true);
      ctx.trackFolder(level1Result.data!.id);

      // Level 2
      const level2Name = ctx.generateName("level2");
      const level2Result = await createFolder(level2Name, {
        parentFolderId: level1Result.data!.id,
      });
      expect(level2Result.success).toBe(true);
      expect(level2Result.data!.parentId).toBe(level1Result.data!.id);
      ctx.trackFolder(level2Result.data!.id);

      // Level 3
      const level3Name = ctx.generateName("level3");
      const level3Result = await createFolder(level3Name, {
        parentFolderId: level2Result.data!.id,
      });
      expect(level3Result.success).toBe(true);
      expect(level3Result.data!.parentId).toBe(level2Result.data!.id);
      ctx.trackFolder(level3Result.data!.id);

      // Verify hierarchy via query (queryFolders expects parent NAME, not ID)
      const level3Query = await queryFolders({ parent: level2Name });
      expect(level3Query.success).toBe(true);
      const foundLevel3 = level3Query.data!.find(
        (f) => f.id === level3Result.data!.id
      );
      expect(foundLevel3).toBeDefined();
    });
  });
});

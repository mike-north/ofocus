#!/usr/bin/env tsx
/**
 * Standalone cleanup script for orphaned integration test data
 *
 * Usage: pnpm --filter @ofocus/sdk run cleanup:integration
 *
 * This script:
 * 1. Searches OmniFocus for all items matching __OFOCUS_TEST__
 * 2. Displays what it found
 * 3. Asks for confirmation before deleting
 * 4. Deletes in the correct dependency order
 */

import * as readline from "readline";
import {
  findTestItems,
  deleteTestItems,
  TEST_PREFIX,
  type FoundTestItems,
} from "./setup.js";

async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

function displayItems(items: FoundTestItems): void {
  const totalCount =
    items.tasks.length +
    items.projects.length +
    items.folders.length +
    items.tags.length;

  if (totalCount === 0) {
    console.log("\nNo test items found in OmniFocus.");
    console.log(`Searched for items starting with: ${TEST_PREFIX}`);
    return;
  }

  console.log(`\nFound ${totalCount} test item(s) in OmniFocus:\n`);

  if (items.tasks.length > 0) {
    console.log(`Tasks (${items.tasks.length}):`);
    for (const task of items.tasks) {
      console.log(`  - ${task.name}`);
      console.log(`    ID: ${task.id}`);
    }
    console.log();
  }

  if (items.projects.length > 0) {
    console.log(`Projects (${items.projects.length}):`);
    for (const project of items.projects) {
      console.log(`  - ${project.name}`);
      console.log(`    ID: ${project.id}`);
    }
    console.log();
  }

  if (items.folders.length > 0) {
    console.log(`Folders (${items.folders.length}):`);
    for (const folder of items.folders) {
      console.log(`  - ${folder.name}`);
      console.log(`    ID: ${folder.id}`);
    }
    console.log();
  }

  if (items.tags.length > 0) {
    console.log(`Tags (${items.tags.length}):`);
    for (const tag of items.tags) {
      console.log(`  - ${tag.name}`);
      console.log(`    ID: ${tag.id}`);
    }
    console.log();
  }
}

async function main(): Promise<void> {
  console.log("OmniFocus Integration Test Cleanup");
  console.log("===================================\n");
  console.log("Searching for test items...");

  let items: FoundTestItems;
  try {
    items = await findTestItems();
  } catch (e) {
    console.error("\nError searching for test items:");
    console.error(e instanceof Error ? e.message : String(e));
    console.error("\nMake sure OmniFocus is running.");
    process.exit(1);
  }

  displayItems(items);

  const totalCount =
    items.tasks.length +
    items.projects.length +
    items.folders.length +
    items.tags.length;

  if (totalCount === 0) {
    process.exit(0);
  }

  // Check for --force flag
  const forceDelete = process.argv.includes("--force");

  if (forceDelete) {
    console.log("--force flag detected, skipping confirmation.\n");
  } else {
    const confirmed = await promptYesNo(
      `Delete all ${totalCount} test item(s)? (y/N): `
    );

    if (!confirmed) {
      console.log("\nCleanup cancelled.");
      process.exit(0);
    }
  }

  console.log("\nDeleting test items...");
  console.log("(Deleting in order: tasks -> projects -> folders -> tags)\n");

  const result = await deleteTestItems(items);

  if (result.success) {
    console.log("All test items deleted successfully.");
  } else {
    console.log(`Cleanup completed with ${result.errors.length} error(s):\n`);
    for (const error of result.errors) {
      console.log(`  ${error.type} ${error.id}: ${error.error}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});

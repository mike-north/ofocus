/**
 * Integration tests for applyRepetitionRule and clearRepetitionRule.
 *
 * These tests require a live OmniFocus instance and are skipped in CI.
 * They create real tasks, apply repetition rules, verify the persisted
 * rule string, and clean up afterward.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IntegrationTestContext } from "./setup.js";
import {
  addToInbox,
  applyRepetitionRule,
  clearRepetitionRule,
} from "../../src/index.js";
import { buildRRule } from "../../src/commands/repetition.js";

// Skip all integration tests unless OFOCUS_INTEGRATION=1 is set
const SKIP = process.env["OFOCUS_INTEGRATION"] !== "1";

describe.skipIf(SKIP)("Repetition rule integration", () => {
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

  it("applies and reads back a daily rule", async () => {
    const name = ctx.generateName("repetition-daily");
    const created = await addToInbox(name);
    expect(created.success).toBe(true);
    const taskId = created.data!.id;
    ctx.trackTask(taskId);

    const rule = {
      frequency: "daily" as const,
      interval: 1,
      repeatMethod: "due-again" as const,
    };
    const applied = await applyRepetitionRule(taskId, rule);
    expect(applied.success).toBe(true);
    expect(applied.data!.ruleString).toBe(buildRRule(rule));
  });

  it("applies and reads back a weekly BYDAY rule (MO,WE,FR)", async () => {
    const name = ctx.generateName("repetition-weekly-byday");
    const created = await addToInbox(name);
    expect(created.success).toBe(true);
    const taskId = created.data!.id;
    ctx.trackTask(taskId);

    const rule = {
      frequency: "weekly" as const,
      interval: 1,
      repeatMethod: "due-again" as const,
      daysOfWeek: [1, 3, 5],
    };
    const applied = await applyRepetitionRule(taskId, rule);
    expect(applied.success).toBe(true);
    expect(applied.data!.ruleString).toBe(buildRRule(rule));
  });

  it("applies and reads back a monthly Nth-weekday rule (first Monday)", async () => {
    const name = ctx.generateName("repetition-monthly-nth-weekday");
    const created = await addToInbox(name);
    expect(created.success).toBe(true);
    const taskId = created.data!.id;
    ctx.trackTask(taskId);

    const rule = {
      frequency: "monthly" as const,
      interval: 1,
      repeatMethod: "due-again" as const,
      daysOfWeek: [1],
      daysOfWeekPositions: [1],
    };
    const applied = await applyRepetitionRule(taskId, rule);
    expect(applied.success).toBe(true);
    expect(applied.data!.ruleString).toBe(buildRRule(rule));
  });

  it("applies and reads back a yearly BYMONTH rule (March and September)", async () => {
    const name = ctx.generateName("repetition-yearly-bymonth");
    const created = await addToInbox(name);
    expect(created.success).toBe(true);
    const taskId = created.data!.id;
    ctx.trackTask(taskId);

    const rule = {
      frequency: "yearly" as const,
      interval: 1,
      repeatMethod: "due-again" as const,
      monthsOfYear: [3, 9],
    };
    const applied = await applyRepetitionRule(taskId, rule);
    expect(applied.success).toBe(true);
    expect(applied.data!.ruleString).toBe(buildRRule(rule));
  });

  it("clears a previously applied rule", async () => {
    const name = ctx.generateName("repetition-clear");
    const created = await addToInbox(name);
    expect(created.success).toBe(true);
    const taskId = created.data!.id;
    ctx.trackTask(taskId);

    // Apply first
    const rule = {
      frequency: "daily" as const,
      interval: 1,
      repeatMethod: "due-again" as const,
    };
    await applyRepetitionRule(taskId, rule);

    // Then clear
    const cleared = await clearRepetitionRule(taskId);
    expect(cleared.success).toBe(true);
    expect(cleared.data!.id).toBe(taskId);
  });
});

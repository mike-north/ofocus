import type { CliOutput, OFProject, ReviewResult } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";

/**
 * Result from getting or setting review interval.
 */
export interface ReviewIntervalResult {
  projectId: string;
  projectName: string;
  reviewIntervalDays: number;
}

/**
 * Mark a project as reviewed in OmniFocus.
 * Sets the lastReviewDate to now, which OmniFocus uses to recompute nextReviewDate.
 */
export async function reviewProject(
  projectId: string
): Promise<CliOutput<ReviewResult>> {
  // Validate project ID
  const idError = validateId(projectId, "project");
  if (idError) return failure(idError);

  const body = `
var theProject = Project.byIdentifier("${escapeJSString(projectId)}");
if (!theProject) {
  throw new Error("Project not found: ${escapeJSString(projectId)}");
}

// Mark as reviewed by setting lastReviewDate to now
theProject.lastReviewDate = new Date();

return JSON.stringify({
  projectId: theProject.id.primaryKey,
  projectName: theProject.name,
  lastReviewed: theProject.lastReviewDate ? theProject.lastReviewDate.toISOString() : new Date().toISOString(),
  nextReviewDate: theProject.nextReviewDate ? theProject.nextReviewDate.toISOString() : null
});`;

  const result = await runOmniJSWrapped<ReviewResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to review project")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

/**
 * Query projects that are due for review in OmniFocus.
 * Returns active (and on-hold) projects whose nextReviewDate is in the past or today.
 */
export async function queryProjectsForReview(): Promise<
  CliOutput<OFProject[]>
> {
  const body = `
var now = new Date();
var results = [];

flattenedProjects.forEach(function(p) {
  // Skip dropped and completed projects
  if (p.status === Project.Status.Dropped || p.status === Project.Status.Done) {
    return;
  }

  // Include only if nextReviewDate is set and in the past/today
  if (!p.nextReviewDate || p.nextReviewDate > now) {
    return;
  }

  var folderId = null;
  var folderName = null;
  if (p.parentFolder) {
    folderId = p.parentFolder.id.primaryKey;
    folderName = p.parentFolder.name;
  }

  var statusStr = "active";
  if (p.status === Project.Status.OnHold) {
    statusStr = "on-hold";
  } else if (p.status === Project.Status.Done) {
    statusStr = "completed";
  } else if (p.status === Project.Status.Dropped) {
    statusStr = "dropped";
  }

  results.push({
    id: p.id.primaryKey,
    name: p.name,
    note: p.note || null,
    status: statusStr,
    sequential: p.sequential,
    folderId: folderId,
    folderName: folderName,
    taskCount: p.tasks.length,
    remainingTaskCount: p.tasks.filter(function(t) { return !t.completed; }).length
  });
});

return JSON.stringify(results);`;

  const result = await runOmniJSWrapped<OFProject[]>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(
          ErrorCode.UNKNOWN_ERROR,
          "Failed to query projects for review"
        )
    );
  }

  return success(result.data ?? []);
}

/**
 * Get the review interval for a project in OmniFocus.
 * Returns the interval in days (approximating months as 30 days, years as 365 days).
 */
export async function getReviewInterval(
  projectId: string
): Promise<CliOutput<ReviewIntervalResult>> {
  // Validate project ID
  const idError = validateId(projectId, "project");
  if (idError) return failure(idError);

  const body = `
var theProject = Project.byIdentifier("${escapeJSString(projectId)}");
if (!theProject) {
  throw new Error("Project not found: ${escapeJSString(projectId)}");
}

var intervalDays = 0;
var ri = theProject.reviewInterval;
if (ri) {
  var steps = ri.steps || 0;
  var unit = ri.unit || "days";
  // Convert to days: weeks->*7, months->*30, years->*365
  if (unit === "day" || unit === "days") {
    intervalDays = steps;
  } else if (unit === "week" || unit === "weeks") {
    intervalDays = steps * 7;
  } else if (unit === "month" || unit === "months") {
    intervalDays = steps * 30;
  } else if (unit === "year" || unit === "years") {
    intervalDays = steps * 365;
  } else {
    intervalDays = steps;
  }
}

return JSON.stringify({
  projectId: theProject.id.primaryKey,
  projectName: theProject.name,
  reviewIntervalDays: intervalDays
});`;

  const result = await runOmniJSWrapped<ReviewIntervalResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to get review interval")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

/**
 * Set the review interval for a project in OmniFocus.
 * The interval is specified in days and stored as a `{ steps, unit }` object using "days" as the unit.
 */
export async function setReviewInterval(
  projectId: string,
  days: number
): Promise<CliOutput<ReviewIntervalResult>> {
  // Validate project ID
  const idError = validateId(projectId, "project");
  if (idError) return failure(idError);

  // Validate days
  if (!Number.isInteger(days) || days < 1) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "Review interval must be a positive integer (days)"
      )
    );
  }

  const body = `
var theProject = Project.byIdentifier("${escapeJSString(projectId)}");
if (!theProject) {
  throw new Error("Project not found: ${escapeJSString(projectId)}");
}

// Set review interval using the {steps, unit} object shape
// We always store as days to preserve the exact day count
var ri = theProject.reviewInterval;
if (ri) {
  ri.steps = ${String(days)};
  ri.unit = "days";
  theProject.reviewInterval = ri;
} else {
  // If no existing interval object, create one — assign a plain object and let OmniFocus coerce it
  theProject.reviewInterval = { steps: ${String(days)}, unit: "days" };
}

// Read back what was actually set
var intervalDays = 0;
var updatedRi = theProject.reviewInterval;
if (updatedRi) {
  var steps = updatedRi.steps || 0;
  var unit = updatedRi.unit || "days";
  if (unit === "day" || unit === "days") {
    intervalDays = steps;
  } else if (unit === "week" || unit === "weeks") {
    intervalDays = steps * 7;
  } else if (unit === "month" || unit === "months") {
    intervalDays = steps * 30;
  } else if (unit === "year" || unit === "years") {
    intervalDays = steps * 365;
  } else {
    intervalDays = steps;
  }
}

return JSON.stringify({
  projectId: theProject.id.primaryKey,
  projectName: theProject.name,
  reviewIntervalDays: intervalDays
});`;

  const result = await runOmniJSWrapped<ReviewIntervalResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to set review interval")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

import type { CliOutput, OFProject, ReviewResult } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

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
 */
export async function reviewProject(
  projectId: string
): Promise<CliOutput<ReviewResult>> {
  // Validate project ID
  const idError = validateId(projectId, "project");
  if (idError) return failure(idError);

  const script = `
    set theProject to first flattened project whose id is "${escapeAppleScript(projectId)}"

    -- Mark as reviewed by setting last review date to now
    set last review date of theProject to current date

    set projId to id of theProject
    set projName to name of theProject

    set lastReviewStr to ""
    try
      set lastReviewStr to (last review date of theProject) as string
    end try

    set nextReviewStr to ""
    try
      set nextReviewStr to (next review date of theProject) as string
    end try

    return "{" & ¬
      "\\"projectId\\": \\"" & projId & "\\"," & ¬
      "\\"projectName\\": \\"" & (my escapeJson(projName)) & "\\"," & ¬
      "\\"lastReviewed\\": " & (my jsonString(lastReviewStr)) & "," & ¬
      "\\"nextReviewDate\\": " & (my jsonString(nextReviewStr)) & ¬
      "}"
  `;

  const result = await runAppleScript<ReviewResult>(
    omniFocusScriptWithHelpers(script)
  );

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
 */
export async function queryProjectsForReview(): Promise<
  CliOutput<OFProject[]>
> {
  const script = `
    set output to "["
    set isFirst to true
    set currentDate to current date

    set allProjects to flattened projects

    repeat with p in allProjects
      set shouldInclude to false

      -- Check if project needs review (next review date is in the past or today)
      try
        set theStatus to status of p
        if theStatus is not dropped and theStatus is not done then
          set nextReview to next review date of p
          if nextReview is not missing value then
            if nextReview <= currentDate then
              set shouldInclude to true
            end if
          end if
        end if
      end try

      if shouldInclude then
        if not isFirst then set output to output & ","
        set isFirst to false

        set projId to id of p
        set projName to name of p
        set projNote to note of p
        set projSeq to sequential of p

        set projStatus to "active"
        try
          set theStatus to status of p
          if theStatus is on hold status then
            set projStatus to "on-hold"
          else if theStatus is done status then
            set projStatus to "completed"
          else if theStatus is dropped status then
            set projStatus to "dropped"
          end if
        end try

        set folderId to ""
        set folderName to ""
        try
          set f to folder of p
          set folderId to id of f
          set folderName to name of f
        end try

        set taskCount to count of tasks of p
        set remainingCount to count of (tasks of p where completed is false)

        set output to output & "{" & ¬
          "\\"id\\": \\"" & projId & "\\"," & ¬
          "\\"name\\": \\"" & (my escapeJson(projName)) & "\\"," & ¬
          "\\"note\\": " & (my jsonString(projNote)) & "," & ¬
          "\\"status\\": \\"" & projStatus & "\\"," & ¬
          "\\"sequential\\": " & projSeq & "," & ¬
          "\\"folderId\\": " & (my jsonString(folderId)) & "," & ¬
          "\\"folderName\\": " & (my jsonString(folderName)) & "," & ¬
          "\\"taskCount\\": " & taskCount & "," & ¬
          "\\"remainingTaskCount\\": " & remainingCount & ¬
          "}"
      end if
    end repeat

    return output & "]"
  `;

  const result = await runAppleScript<OFProject[]>(
    omniFocusScriptWithHelpers(script)
  );

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

// Seconds per day for review interval conversion
const SECONDS_PER_DAY = 86400;

/**
 * Get the review interval for a project in OmniFocus.
 * Returns the interval in days.
 */
export async function getReviewInterval(
  projectId: string
): Promise<CliOutput<ReviewIntervalResult>> {
  // Validate project ID
  const idError = validateId(projectId, "project");
  if (idError) return failure(idError);

  const script = `
    set theProject to first flattened project whose id is "${escapeAppleScript(projectId)}"

    set projId to id of theProject
    set projName to name of theProject

    -- Review interval is stored in seconds
    set intervalSecs to 0
    try
      set intervalSecs to review interval of theProject
    end try

    -- Convert to days (integer division)
    set intervalDays to intervalSecs div ${String(SECONDS_PER_DAY)}

    return "{" & ¬
      "\\"projectId\\": \\"" & projId & "\\"," & ¬
      "\\"projectName\\": \\"" & (my escapeJson(projName)) & "\\"," & ¬
      "\\"reviewIntervalDays\\": " & intervalDays & ¬
      "}"
  `;

  const result = await runAppleScript<ReviewIntervalResult>(
    omniFocusScriptWithHelpers(script)
  );

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
 * The interval is specified in days.
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

  // Convert days to seconds
  const intervalSeconds = days * SECONDS_PER_DAY;

  const script = `
    set theProject to first flattened project whose id is "${escapeAppleScript(projectId)}"

    -- Set review interval (stored in seconds)
    set review interval of theProject to ${String(intervalSeconds)}

    set projId to id of theProject
    set projName to name of theProject

    -- Get the updated interval
    set intervalSecs to review interval of theProject
    set intervalDays to intervalSecs div ${String(SECONDS_PER_DAY)}

    return "{" & ¬
      "\\"projectId\\": \\"" & projId & "\\"," & ¬
      "\\"projectName\\": \\"" & (my escapeJson(projName)) & "\\"," & ¬
      "\\"reviewIntervalDays\\": " & intervalDays & ¬
      "}"
  `;

  const result = await runAppleScript<ReviewIntervalResult>(
    omniFocusScriptWithHelpers(script)
  );

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

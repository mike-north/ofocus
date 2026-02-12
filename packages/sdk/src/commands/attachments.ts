import * as fs from "node:fs";
import * as path from "node:path";
import type { CliOutput } from "../types.js";
import { success, failure, failureMessage } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Attachment information.
 */
export interface OFAttachment {
  /** Attachment ID */
  id: string;
  /** Attachment name (filename) */
  name: string;
  /** File size in bytes (if available) */
  size: number | null;
  /** MIME type or file type (if available) */
  type: string | null;
}

/**
 * Result of adding an attachment.
 */
export interface AddAttachmentResult {
  /** Task ID */
  taskId: string;
  /** Task name */
  taskName: string;
  /** Attached file name */
  fileName: string;
  /** Success status */
  attached: boolean;
}

/**
 * Result of listing attachments.
 */
export interface ListAttachmentsResult {
  /** Task ID */
  taskId: string;
  /** Task name */
  taskName: string;
  /** List of attachments */
  attachments: OFAttachment[];
}

/**
 * Result of removing an attachment.
 */
export interface RemoveAttachmentResult {
  /** Task ID */
  taskId: string;
  /** Attachment name */
  attachmentName: string;
  /** Success status */
  removed: boolean;
}

/**
 * Add an attachment to a task.
 * @param taskId - Task ID to add attachment to
 * @param filePath - Path to the file to attach
 */
export async function addAttachment(
  taskId: string,
  filePath: string
): Promise<CliOutput<AddAttachmentResult>> {
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  // Validate file exists
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return failureMessage(`File not found: ${filePath}`);
  }

  // Get file stats
  const stats = fs.statSync(absolutePath);
  if (!stats.isFile()) {
    return failureMessage(`Not a file: ${filePath}`);
  }

  const fileName = path.basename(absolutePath);

  // OmniFocus AppleScript for adding attachment
  // Note: OmniFocus uses POSIX file paths for attachments
  const script = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"
    set taskName to name of theTask

    -- Add attachment using POSIX file path
    set theFile to POSIX file "${escapeAppleScript(absolutePath)}"

    tell theTask
      make new attachment with properties {file:theFile}
    end tell

    return "{" & ¬
      "\\"taskId\\": \\"" & (id of theTask) & "\\"," & ¬
      "\\"taskName\\": \\"" & (my escapeJson(taskName)) & "\\"," & ¬
      "\\"fileName\\": \\"" & "${escapeAppleScript(fileName)}" & "\\"," & ¬
      "\\"attached\\": true" & ¬
      "}"
  `;

  const result = await runAppleScript<AddAttachmentResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to add attachment")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No result data returned")
    );
  }

  return success(result.data);
}

/**
 * List attachments of a task.
 * @param taskId - Task ID to list attachments for
 */
export async function listAttachments(
  taskId: string
): Promise<CliOutput<ListAttachmentsResult>> {
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  const script = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"
    set taskName to name of theTask
    set taskId to id of theTask

    set output to "{\\"taskId\\": \\"" & taskId & "\\","
    set output to output & "\\"taskName\\": \\"" & (my escapeJson(taskName)) & "\\","
    set output to output & "\\"attachments\\": ["

    set isFirst to true
    set taskAttachments to attachments of theTask

    repeat with att in taskAttachments
      if not isFirst then set output to output & ","
      set isFirst to false

      set attId to id of att
      set attName to name of att

      set output to output & "{"
      set output to output & "\\"id\\": \\"" & attId & "\\","
      set output to output & "\\"name\\": \\"" & (my escapeJson(attName)) & "\\","
      set output to output & "\\"size\\": null,"
      set output to output & "\\"type\\": null"
      set output to output & "}"
    end repeat

    set output to output & "]}"
    return output
  `;

  const result = await runAppleScript<ListAttachmentsResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to list attachments")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No result data returned")
    );
  }

  return success(result.data);
}

/**
 * Remove an attachment from a task.
 * @param taskId - Task ID to remove attachment from
 * @param attachmentIdOrName - Attachment ID or name to remove
 */
export async function removeAttachment(
  taskId: string,
  attachmentIdOrName: string
): Promise<CliOutput<RemoveAttachmentResult>> {
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  if (!attachmentIdOrName || attachmentIdOrName.trim() === "") {
    return failureMessage("Attachment ID or name is required");
  }

  const script = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"
    set attachmentToRemove to missing value
    set attName to ""

    -- Try to find attachment by ID first, then by name
    set taskAttachments to attachments of theTask

    repeat with att in taskAttachments
      if id of att is "${escapeAppleScript(attachmentIdOrName)}" then
        set attachmentToRemove to att
        set attName to name of att
        exit repeat
      else if name of att is "${escapeAppleScript(attachmentIdOrName)}" then
        set attachmentToRemove to att
        set attName to name of att
        exit repeat
      end if
    end repeat

    if attachmentToRemove is missing value then
      error "Attachment not found: ${escapeAppleScript(attachmentIdOrName)}"
    end if

    delete attachmentToRemove

    return "{" & ¬
      "\\"taskId\\": \\"" & (id of theTask) & "\\"," & ¬
      "\\"attachmentName\\": \\"" & (my escapeJson(attName)) & "\\"," & ¬
      "\\"removed\\": true" & ¬
      "}"
  `;

  const result = await runAppleScript<RemoveAttachmentResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to remove attachment")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No result data returned")
    );
  }

  return success(result.data);
}

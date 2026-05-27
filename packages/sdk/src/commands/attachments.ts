import * as fs from "node:fs";
import * as path from "node:path";
import type { CliOutput } from "../types.js";
import { success, failure, failureMessage } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";

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

  // Read the file and convert to base64 for embedding in the OmniJS script.
  // OmniJS does not support POSIX file paths directly — the file must be
  // passed as base64 data and reconstructed via Data.fromBase64 + FileWrapper.
  const fileBuffer = fs.readFileSync(absolutePath);
  const base64Contents = fileBuffer.toString("base64");

  // Base64 strings contain only [A-Za-z0-9+/=], so escapeJSString is safe
  // but not strictly required. We pass through it for defensive consistency.
  const body = `
var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}
var fileData = Data.fromBase64("${escapeJSString(base64Contents)}");
var wrapper = FileWrapper.withContents("${escapeJSString(fileName)}", fileData);
task.addAttachment(wrapper);
return JSON.stringify({
  taskId: task.id.primaryKey,
  taskName: task.name,
  fileName: "${escapeJSString(fileName)}",
  attached: true
});`;

  const result = await runOmniJSWrapped<AddAttachmentResult>(body);

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

  // OmniJS FileWrapper does not expose a stable opaque id property.
  // We use the preferredFilename as the attachment id so that callers
  // can pass the returned id to removeAttachment (which looks up by name).
  const body = `
var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}
var atts = task.attachments.map(function(a) {
  var name = a.preferredFilename || a.filename || "";
  return {
    id: name,
    name: name,
    size: null,
    type: null
  };
});
return JSON.stringify({
  taskId: task.id.primaryKey,
  taskName: task.name,
  attachments: atts
});`;

  const result = await runOmniJSWrapped<ListAttachmentsResult>(body);

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
 * @param attachmentIdOrName - Attachment name (as returned by listAttachments) or filename
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

  // OmniJS exposes task.removeAttachmentAtIndex(index) for removal.
  // We find the attachment by matching preferredFilename or filename
  // against the provided identifier (which may be an id or a name —
  // listAttachments sets id === name, so both lookups are equivalent).
  const body = `
var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}
var identifier = "${escapeJSString(attachmentIdOrName)}";
var atts = task.attachments;
var foundIndex = -1;
var foundName = "";
for (var i = 0; i < atts.length; i++) {
  var name = atts[i].preferredFilename || atts[i].filename || "";
  if (name === identifier) {
    foundIndex = i;
    foundName = name;
    break;
  }
}
if (foundIndex === -1) {
  throw new Error("Attachment not found: " + identifier);
}
task.removeAttachmentAtIndex(foundIndex);
return JSON.stringify({
  taskId: task.id.primaryKey,
  attachmentName: foundName,
  removed: true
});`;

  const result = await runOmniJSWrapped<RemoveAttachmentResult>(body);

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

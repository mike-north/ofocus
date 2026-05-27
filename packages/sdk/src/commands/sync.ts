import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runOmniJSWrapped } from "../omnijs.js";

/**
 * Sync status information.
 */
export interface SyncStatus {
  /** Whether sync is currently in progress */
  syncing: boolean;
  /** Last sync date (ISO 8601 format) */
  lastSync: string | null;
  /** Sync account name if configured */
  accountName: string | null;
  /** Whether sync is enabled */
  syncEnabled: boolean;
}

/**
 * Result of sync operation.
 */
export interface SyncResult {
  /** Whether sync was triggered */
  triggered: boolean;
  /** Message about the operation */
  message: string;
}

/**
 * Get the current sync status.
 *
 * OmniJS does not expose a `syncing` flag or account name directly.
 * `document.lastSyncDate` is available for the last sync timestamp.
 * `syncing` and `accountName` are returned as `false`/`null` because
 * OmniJS provides no API to read them — this matches the AppleScript
 * behaviour which also could not reliably determine these values.
 *
 * @see https://omni-automation.com/omnifocus/sync.html
 */
export async function getSyncStatus(): Promise<CliOutput<SyncStatus>> {
  const body = `
var lastSyncDate = document.lastSyncDate;
var lastSync = lastSyncDate ? lastSyncDate.toISOString() : null;

return JSON.stringify({
  syncing: false,
  lastSync: lastSync,
  accountName: null,
  syncEnabled: false
});`;

  const result = await runOmniJSWrapped<SyncStatus>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to get sync status")
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
 * Trigger a sync operation.
 *
 * `document.sync()` fires sync in the background and returns immediately.
 * There is no OmniJS primitive to await completion.
 *
 * @see https://omni-automation.com/omnifocus/sync.html
 */
export async function triggerSync(): Promise<CliOutput<SyncResult>> {
  const body = `
document.sync();

return JSON.stringify({
  triggered: true,
  message: "Synchronization started"
});`;

  const result = await runOmniJSWrapped<SyncResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to trigger sync")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No result data returned")
    );
  }

  return success(result.data);
}

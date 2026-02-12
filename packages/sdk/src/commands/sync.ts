import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

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
 */
export async function getSyncStatus(): Promise<CliOutput<SyncStatus>> {
  const script = `
    set syncEnabled to false
    set lastSyncStr to "null"
    set accountStr to "null"
    set isSyncing to false

    try
      -- Check if synchronizing
      set isSyncing to synchronizing
    end try

    -- OmniFocus doesn't expose detailed sync info via AppleScript
    -- We can only check basic sync state; syncEnabled is always reported as false
    -- because there's no reliable way to determine this via AppleScript

    return "{" & ¬
      "\\"syncing\\": " & (isSyncing as string) & "," & ¬
      "\\"lastSync\\": " & lastSyncStr & "," & ¬
      "\\"accountName\\": " & accountStr & "," & ¬
      "\\"syncEnabled\\": " & (syncEnabled as string) & ¬
      "}"
  `;

  const result = await runAppleScript<SyncStatus>(
    omniFocusScriptWithHelpers(script)
  );

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
 */
export async function triggerSync(): Promise<CliOutput<SyncResult>> {
  const script = `
    -- Trigger synchronization
    synchronize

    return "{" & ¬
      "\\"triggered\\": true," & ¬
      "\\"message\\": \\"Synchronization started\\"" & ¬
      "}"
  `;

  const result = await runAppleScript<SyncResult>(
    omniFocusScriptWithHelpers(script)
  );

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

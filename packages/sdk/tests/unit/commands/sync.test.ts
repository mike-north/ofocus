import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { AppleScriptResult } from "../../../src/applescript.js";
import type { SyncStatus, SyncResult } from "../../../src/commands/sync.js";

// Mock the applescript module
vi.mock("../../../src/applescript.js", () => ({
  runAppleScript: vi.fn(),
  omniFocusScriptWithHelpers: vi.fn((body: string) => body),
}));

// Import after mocking
import { getSyncStatus, triggerSync } from "../../../src/commands/sync.js";
import { runAppleScript } from "../../../src/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("getSyncStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful status retrieval", () => {
    it("should return sync status when not syncing", async () => {
      const mockResult: SyncStatus = {
        syncing: false,
        lastSync: null,
        accountName: null,
        syncEnabled: false,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(true);
      expect(result.data?.syncing).toBe(false);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });

    it("should return sync status when syncing", async () => {
      const mockResult: SyncStatus = {
        syncing: true,
        lastSync: null,
        accountName: null,
        syncEnabled: false,
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(true);
      expect(result.data?.syncing).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

describe("triggerSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful sync trigger", () => {
    it("should trigger synchronization", async () => {
      const mockResult: SyncResult = {
        triggered: true,
        message: "Synchronization started",
      };

      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: mockResult,
      } as AppleScriptResult<SyncResult>);

      const result = await triggerSync();

      expect(result.success).toBe(true);
      expect(result.data?.triggered).toBe(true);
      expect(result.data?.message).toBe("Synchronization started");
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as AppleScriptResult<SyncResult>);

      const result = await triggerSync();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: true,
        data: undefined,
      } as AppleScriptResult<SyncResult>);

      const result = await triggerSync();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunAppleScript.mockResolvedValue({
        success: false,
        error: undefined,
      } as AppleScriptResult<SyncResult>);

      const result = await triggerSync();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

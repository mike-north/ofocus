import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "../../../src/errors.js";
import type { OmniJSResult } from "../../../src/omnijs.js";
import type { SyncStatus, SyncResult } from "../../../src/commands/sync.js";

// Mock the omnijs module
vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
}));

// Import after mocking
import { getSyncStatus, triggerSync } from "../../../src/commands/sync.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRunOmniJS = vi.mocked(runOmniJSWrapped);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(true);
      expect(result.data?.syncing).toBe(false);
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });

    it("should return sync status when syncing", async () => {
      const mockResult: SyncStatus = {
        syncing: true,
        lastSync: null,
        accountName: null,
        syncEnabled: false,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(true);
      expect(result.data?.syncing).toBe(true);
    });

    it("should return lastSync date when available", async () => {
      const mockResult: SyncStatus = {
        syncing: false,
        lastSync: "2026-05-27T10:00:00.000Z",
        accountName: null,
        syncEnabled: false,
      };

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(true);
      expect(result.data?.lastSync).toBe("2026-05-27T10:00:00.000Z");
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<SyncStatus>);

      const result = await getSyncStatus();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<SyncStatus>);

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

      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: mockResult,
      } as OmniJSResult<SyncResult>);

      const result = await triggerSync();

      expect(result.success).toBe(true);
      expect(result.data?.triggered).toBe(true);
      expect(result.data?.message).toBe("Synchronization started");
      expect(mockRunOmniJS).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should handle OmniFocus not running", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: {
          code: ErrorCode.OMNIFOCUS_NOT_RUNNING,
          message: "OmniFocus is not running",
        },
      } as OmniJSResult<SyncResult>);

      const result = await triggerSync();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.OMNIFOCUS_NOT_RUNNING);
    });

    it("should handle undefined data response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: true,
        data: undefined,
      } as OmniJSResult<SyncResult>);

      const result = await triggerSync();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it("should handle null error in failure response", async () => {
      mockRunOmniJS.mockResolvedValue({
        success: false,
        error: undefined,
      } as OmniJSResult<SyncResult>);

      const result = await triggerSync();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});

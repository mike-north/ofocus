/**
 * Tests for MCP formatResult utility.
 *
 * @see https://toonformat.dev/ TOON format specification
 * @see https://www.npmjs.com/package/@toon-format/toon @toon-format/toon package
 */
import { describe, it, expect } from "vitest";
import { decode } from "@toon-format/toon";
import { formatResult } from "../src/utils.js";

describe("formatResult", () => {
  // -------------------------------------------------------------------------
  // JSON format (explicit format: 'json')
  // -------------------------------------------------------------------------

  describe("JSON format (format='json')", () => {
    it("should format successful result with data", () => {
      const result = formatResult(
        {
          success: true,
          data: { id: "123", name: "Test Task" },
        },
        "json"
      );

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text as string)).toEqual({
        id: "123",
        name: "Test Task",
      });
    });

    it("should format successful result with array data", () => {
      const result = formatResult(
        {
          success: true,
          data: [{ id: "1" }, { id: "2" }],
        },
        "json"
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed).toHaveLength(2);
    });

    it("should format successful result with null data", () => {
      const result = formatResult(
        {
          success: true,
          data: null,
        },
        "json"
      );

      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text as string)).toBeNull();
    });

    it("should format error result with error object", () => {
      const result = formatResult(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Task not found",
          },
        },
        "json"
      );

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(JSON.parse(result.content[0].text as string)).toEqual({
        code: "NOT_FOUND",
        message: "Task not found",
      });
    });

    it("should provide fallback error when error is undefined", () => {
      const result = formatResult(
        {
          success: false,
          error: undefined,
        },
        "json"
      );

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.code).toBe("UNKNOWN_ERROR");
      expect(parsed.message).toBe("An unknown error occurred");
    });

    it("should provide fallback error when error is null", () => {
      const result = formatResult(
        {
          success: false,
          error: null as unknown as undefined,
        },
        "json"
      );

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.code).toBe("UNKNOWN_ERROR");
    });
  });

  // -------------------------------------------------------------------------
  // TOON format (explicit format: 'toon')
  // -------------------------------------------------------------------------

  /**
   * TOON structural invariants tested below:
   *
   * For a uniform array of N objects with the same fields F1,F2,...:
   *   [N]{F1,F2,...}:
   *     val1,val2,...
   *
   * @see https://toonformat.dev/ §3 "Tabular arrays"
   */
  describe("TOON format (format='toon')", () => {
    it("should serialize successful array-of-objects result to TOON tabular form", () => {
      // TOON tabular format for uniform arrays:
      // [N]{field1,field2,...}:
      //   val1,val2,...
      // @see https://toonformat.dev/ §3 "Tabular arrays"
      const result = formatResult(
        {
          success: true,
          data: [
            { id: "1", name: "Alpha" },
            { id: "2", name: "Beta" },
          ],
        },
        "toon"
      );

      expect(result.isError).toBeUndefined();
      const toonText = result.content[0].text as string;

      // The output is TOON, not JSON: no leading `{` or `[` (would be JSON)
      expect(toonText).not.toMatch(/^\{/);

      // Tabular array header: [2]{...}:
      // @see https://toonformat.dev/ §3.1 "Tabular array header"
      expect(toonText).toMatch(/\[2\]\{[^}]+\}:/);

      // Round-trip via decode should recover the original data array.
      // formatResult encodes only result.data (not the CliOutput wrapper),
      // so decoded is the array directly.
      const decoded = decode(toonText) as Array<{ id: string; name: string }>;
      expect(decoded).toHaveLength(2);
      expect(decoded[0]).toMatchObject({ id: "1", name: "Alpha" });
    });

    it("should serialize successful single-object result to TOON key:value form", () => {
      // @see https://toonformat.dev/ §2 "Objects"
      const result = formatResult(
        {
          success: true,
          data: { id: "123", name: "Test Task" },
        },
        "toon"
      );

      const toonText = result.content[0].text as string;
      // TOON objects use `key: value` lines, not JSON braces
      expect(toonText).not.toMatch(/^\{/);
      // String values in TOON are quoted when they look like numbers or contain
      // special characters — "123" is a string, so it appears as `id: "123"`.
      // @see https://toonformat.dev/ §1.3 "String quoting rules"
      expect(toonText).toContain('id: "123"');
      expect(toonText).toContain("name: Test Task");
    });

    it("should serialize error result to TOON (not JSON)", () => {
      const result = formatResult(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Task not found",
          },
        },
        "toon"
      );

      expect(result.isError).toBe(true);
      const toonText = result.content[0].text as string;
      // TOON output, not JSON
      expect(toonText).not.toMatch(/^\{/);
      expect(toonText).toContain("code: NOT_FOUND");
      expect(toonText).toContain("message: Task not found");
    });

    it("should provide fallback error in TOON when error is undefined", () => {
      const result = formatResult(
        {
          success: false,
          error: undefined,
        },
        "toon"
      );

      expect(result.isError).toBe(true);
      const toonText = result.content[0].text as string;
      expect(toonText).toContain("UNKNOWN_ERROR");
      expect(toonText).toContain("An unknown error occurred");
    });
  });

  // -------------------------------------------------------------------------
  // Default format (no format arg → 'json')
  // -------------------------------------------------------------------------

  /**
   * Regression guard for PR #39 Copilot finding:
   * Changing formatResult's default to 'toon' silently flipped all direct
   * server.registerTool(...) call sites (tasks.ts, projects.ts, folders.ts,
   * tags.ts, advanced.ts) from JSON to TOON without any way for callers to
   * opt back into JSON — because those registrations do not inject a `format`
   * input parameter. The default is 'json' to preserve backward compatibility
   * for direct registrations. Descriptor-routed tools (via registerMcpTool)
   * receive TOON via the adapter's explicit `format ?? "toon"` default.
   */
  describe("Default format (omit format arg → defaults to json)", () => {
    it("should default to JSON format when no format is specified", () => {
      // Default is 'json' to avoid silently flipping direct registrations.
      // Direct server.registerTool(...) callers do not inject a format param,
      // so they must rely on this default. See PR #39 Copilot finding.
      const result = formatResult({
        success: true,
        data: { id: "123", name: "Default Test" },
      });

      const text = result.content[0].text as string;
      // JSON output: parseable and starts with `{`
      const parsed = JSON.parse(text) as { id: string; name: string };
      expect(parsed.id).toBe("123");
      expect(parsed.name).toBe("Default Test");
    });

    it("should default to JSON for error results when no format is specified", () => {
      // Regression: error path must also produce JSON by default.
      const result = formatResult({
        success: false,
        error: { code: "ERR", message: "fail" },
      });

      const text = result.content[0].text as string;
      const parsed = JSON.parse(text) as { code: string; message: string };
      expect(parsed.code).toBe("ERR");
      expect(result.isError).toBe(true);
    });

    it("TOON output is smaller than JSON for array results (explicit format args)", () => {
      // Validate the token-efficiency claim holds for explicit format usage.
      // @see https://toonformat.dev/ — ~40% smaller for uniform arrays
      const data = [
        { id: "1", name: "Alpha", flagged: false, completed: false },
        { id: "2", name: "Beta", flagged: true, completed: false },
        { id: "3", name: "Gamma", flagged: false, completed: true },
      ];
      const toonResult = formatResult({ success: true, data }, "toon");
      const jsonResult = formatResult({ success: true, data }, "json");

      const toonSize = (toonResult.content[0].text as string).length;
      const jsonSize = (jsonResult.content[0].text as string).length;
      expect(toonSize).toBeLessThan(jsonSize);
    });
  });
});

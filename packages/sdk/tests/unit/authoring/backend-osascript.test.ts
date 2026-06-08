import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OmniJSResult } from "../../../src/omnijs.js";

vi.mock("../../../src/omnijs.js", () => ({
  runOmniJSWrapped: vi.fn(),
}));

import { runOmniScript } from "../../../src/authoring/backend-osascript.js";
import { defineOmniScript } from "../../../src/authoring/define.js";
import { runOmniJSWrapped } from "../../../src/omnijs.js";

const mockRun = vi.mocked(runOmniJSWrapped);

describe("runOmniScript", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits a composed body and returns the decoded result on success", async () => {
    mockRun.mockResolvedValue({
      success: true,
      data: 42,
    } as OmniJSResult<number>);
    const script = defineOmniScript((args: { n: number }) => args.n + 1);

    const result = await runOmniScript(script, { n: 41 });

    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
    const body = mockRun.mock.calls[0]![0] as string;
    expect(body).toContain("JSON.parse");
    expect(body).toContain("return JSON.stringify(");
  });

  it("propagates a structured failure", async () => {
    mockRun.mockResolvedValue({
      success: false,
      error: { code: "SCRIPT_ERROR", message: "boom" },
    } as unknown as OmniJSResult<number>);
    const script = defineOmniScript(() => 1);

    const result = await runOmniScript(script, {});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("SCRIPT_ERROR");
  });
});

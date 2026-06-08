import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runOmniJSWrapped } from "../omnijs.js";
import { composeScriptBody } from "./serialize.js";
import type { OmniScript } from "./types.js";

/**
 * Run an {@link OmniScript} via osascript (macOS, headless). The script's
 * declared return type flows through to `data`.
 *
 * @public
 */
export async function runOmniScript<Args extends Record<string, unknown>, T>(
  script: OmniScript<Args, T>,
  args: Args
): Promise<CliOutput<T>> {
  const body = composeScriptBody(script.source, args);
  const result = await runOmniJSWrapped<T>(body);
  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.SCRIPT_ERROR, "OmniScript execution failed")
    );
  }
  return success(result.data as T);
}

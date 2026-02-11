import type { CliOutput, CliError } from "./types.js";
import { ErrorCode, createError } from "./errors.js";

/**
 * Create a successful CLI output.
 */
export function success<T>(data: T): CliOutput<T> {
  return {
    success: true,
    data,
    error: null,
  };
}

/**
 * Create a failed CLI output with a structured error.
 */
export function failure<T = null>(error: CliError): CliOutput<T> {
  return {
    success: false,
    data: null,
    error,
  };
}

/**
 * Create a failed CLI output with a simple string message.
 * This is a convenience function that wraps the message in an UNKNOWN_ERROR.
 */
export function failureMessage<T = null>(message: string): CliOutput<T> {
  return failure<T>(createError(ErrorCode.UNKNOWN_ERROR, message));
}

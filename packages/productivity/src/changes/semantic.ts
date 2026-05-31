import { spawn } from "node:child_process";

export interface SummaryResult {
  summary?: string;
  note?: string;
}

/**
 * Summarize a diff packet by piping it (JSON, on stdin) to a user-configured
 * command and capturing stdout. Fail-open: any problem yields a note, never a
 * throw (spec §8). `command` runs via the shell so users can configure flags.
 */
export async function summarize(
  packet: unknown,
  command: string | undefined,
  timeoutMs = 20_000,
): Promise<SummaryResult> {
  if (command === undefined || command.trim().length === 0) {
    return { note: "Semantic summary not configured (set OFOCUS_SUMMARY_CMD)." };
  }
  return new Promise<SummaryResult>((resolve) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ note: "Semantic summary timed out." });
    }, timeoutMs);
    timer.unref();
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ note: `Semantic summary command failed: ${e.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim().length > 0) {
        resolve({ summary: out.trim() });
      } else {
        resolve({
          note: `Semantic summary command exited ${String(code)}: ${err.trim()}`.trim(),
        });
      }
    });
    child.stdin.end(JSON.stringify(packet));
  });
}

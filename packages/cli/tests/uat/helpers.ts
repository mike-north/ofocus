/**
 * UAT subprocess harness for @ofocus/cli.
 *
 * Spawns the real CLI binary (`dist/index.js`) as a child process and captures
 * stdout, stderr, and exit code. Tests that use this harness exercise the
 * assembled CLI exactly as a user or agent would.
 *
 * How to run:
 *   pnpm -F @ofocus/cli build && OFOCUS_UAT=1 pnpm -F @ofocus/cli test
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the compiled CLI entry point. */
const CLI_PATH = resolve(__dirname, "..", "..", "dist", "index.js");

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn `node <cli-path> [...args]` and return the captured output.
 *
 * Throws immediately with a helpful message if the dist file is absent —
 * run `pnpm -F @ofocus/cli build` first.
 *
 * @param args  Arguments to pass to the CLI (e.g. `["list-commands", "--json"]`).
 * @param timeoutMs  Maximum time to wait for the process to exit (default 10 s).
 */
export function runCli(args: string[], timeoutMs = 10_000): Promise<CliResult> {
  if (!existsSync(CLI_PATH)) {
    throw new Error(
      `CLI dist not found at ${CLI_PATH}.\n` +
        `Run \`pnpm -F @ofocus/cli build\` first, then re-run with OFOCUS_UAT=1.`
    );
  }

  return new Promise((resolve_fn, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `CLI process timed out after ${timeoutMs} ms.\n` +
            `Command: node ${CLI_PATH} ${args.join(" ")}`
        )
      );
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve_fn({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code ?? 1,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

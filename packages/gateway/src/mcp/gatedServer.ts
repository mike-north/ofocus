import {
  McpServer,
  type RegisteredTool,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "@ofocus/mcp";

/**
 * Build an OmniFocus MCP server whose exposed tool set is filtered by `exposed`.
 *
 * When `exposed` is `"all"`, all tools are registered normally.
 *
 * When `exposed` is a `Set<string>`, all tools are still registered (so
 * `@ofocus/mcp` stays untouched), but tools whose names are NOT in the set are
 * immediately disabled via `RegisteredTool.disable()`. Disabled tools are
 * hidden from `tools/list` AND cause an error on invocation — both verified
 * SDK v1.26.0 behaviours.
 */
export function createGatedServer(
  exposed: "all" | Set<string>,
  version: string
): McpServer {
  const server = new McpServer({ name: "ofocus", version });

  if (exposed === "all") {
    registerAllTools(server);
    return server;
  }

  const allow = exposed;

  // Wrap the server in a Proxy that intercepts `registerTool` calls so we can
  // capture the returned RegisteredTool handle and call `.disable()` for any
  // tool that is not in the allowlist.  All other property accesses and method
  // calls are forwarded transparently to the real server instance.
  const gated = new Proxy(server, {
    get(target, prop, receiver): unknown {
      if (prop === "registerTool") {
        // Return a wrapper that delegates to the real registerTool then
        // conditionally disables the resulting handle.
        return (name: string, ...rest: unknown[]): RegisteredTool => {
          // We must forward the full variadic call to the original method.
          // The cast is necessary because the Proxy `get` trap loses the
          // precise overloaded signature; we know the shape matches because
          // `registerMcpTool` (in @ofocus/mcp) always calls the same overload:
          //   registerTool(name, config, cb)
          const originalRegisterTool = Reflect.get(
            target,
            "registerTool",
            receiver
          ) as (n: string, ...r: unknown[]) => RegisteredTool;

          const handle = originalRegisterTool.call(target, name, ...rest);

          if (!allow.has(name)) {
            handle.disable();
          }

          return handle;
        };
      }

      const value = Reflect.get(target, prop, receiver) as unknown;
      // Preserve `this` binding for any method retrieved from the target.
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });

  registerAllTools(gated);
  return server;
}

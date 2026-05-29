import { z } from "zod";
import type { CliOutput, OFPerspective, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateSearchQuery } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

/**
 * Options for querying a perspective.
 */
export interface PerspectiveQueryOptions {
  limit?: number | undefined;
}

/**
 * Options for creating a perspective from an archive payload.
 *
 * Note: OmniJS does not expose a public `Perspective.Custom.fromArchive()`
 * factory. createPerspective() will return a structured unsupported-operation
 * failure if called. This interface is defined so callers can forward-declare
 * their intent and the SDK can surface a clear error rather than throwing.
 */
export interface CreatePerspectiveOptions {
  /**
   * The Perspective archive payload (base-64 encoded plist produced by
   * OmniFocus's built-in export). Reserved for future use once OmniJS
   * exposes a public factory method.
   */
  archivePayload: string;
}

/**
 * Result from creating a perspective.
 */
export interface CreatePerspectiveResult {
  perspective: OFPerspective;
}

/**
 * Result from renaming a perspective.
 */
export interface RenamePerspectiveResult {
  perspective: OFPerspective;
}

/**
 * Result from deleting a perspective.
 */
export interface DeletePerspectiveResult {
  deleted: true;
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Internal OmniJS script fragments
// ---------------------------------------------------------------------------

/**
 * OmniJS snippet that serialises a single task node object to a plain object
 * matching the OFTask wire shape.
 */
function taskSerializerSnippet(taskVar: string): string {
  return `(function(t) {
  var projId = null;
  var projName = null;
  if (t.containingProject) {
    projId = t.containingProject.id.primaryKey;
    projName = t.containingProject.name;
  }
  return {
    id: t.id.primaryKey,
    name: t.name,
    note: t.note || null,
    flagged: t.flagged,
    completed: t.completed,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    deferDate: t.deferDate ? t.deferDate.toISOString() : null,
    completionDate: t.completionDate ? t.completionDate.toISOString() : null,
    projectId: projId,
    projectName: projName,
    tags: t.tags.map(function(tg) { return tg.name; }),
    estimatedMinutes: t.estimatedMinutes != null ? t.estimatedMinutes : null
  };
})(${taskVar})`;
}

// ---------------------------------------------------------------------------
// listPerspectives
// ---------------------------------------------------------------------------

/**
 * List all perspectives in OmniFocus (both built-in and custom).
 *
 * Each entry includes:
 * - `id`   — for built-in perspectives this is the localized name used as a
 *            stable string key; for custom perspectives this is the UUID
 *            string returned by `Perspective.Custom#identifier`.
 * - `name` — the display name shown in OmniFocus.
 * - `kind` — `"builtin"` or `"custom"`.
 *
 * OmniJS API used:
 * - `Perspective.BuiltIn.all` — array of all built-in perspective singletons.
 * - `Perspective.Custom.all`  — array of all user-created custom perspectives.
 */
export async function listPerspectives(): Promise<CliOutput<OFPerspective[]>> {
  const body = `
var results = [];

// Built-in perspectives — identifier is the localized name (no .identifier property)
Perspective.BuiltIn.all.forEach(function(p) {
  results.push({ id: p.name, name: p.name, kind: "builtin" });
});

// Custom perspectives — have a stable UUID-style .identifier property
Perspective.Custom.all.forEach(function(p) {
  results.push({ id: p.identifier, name: p.name, kind: "custom" });
});

return JSON.stringify(results);`;

  const result = await runOmniJSWrapped<OFPerspective[]>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to list perspectives")
    );
  }

  return success(result.data ?? []);
}

// ---------------------------------------------------------------------------
// queryPerspective
// ---------------------------------------------------------------------------

/**
 * Query the tasks visible in a named OmniFocus perspective.
 *
 * Unlike the legacy AppleScript implementation — which was limited to
 * hard-coded filters for Flagged/Forecast/Inbox — this implementation uses
 * the OmniJS `Window.perspective` setter to switch the active window into the
 * requested perspective and then reads `window.content.rootNode` to collect
 * the actual leaf tasks that OmniFocus itself would display. The prior
 * perspective is restored in a `try/finally` so the user's window state is
 * preserved regardless of errors.
 *
 * OmniJS API used:
 * - `Perspective.BuiltIn.all`       — look up built-in by name.
 * - `Perspective.Custom.byName()`   — look up custom perspective by name.
 * - `document.windows[0].perspective` — getter/setter.
 * - `document.windows[0].content.rootNode.apply()` — traverse visible tasks.
 * - `node.object instanceof Task`   — discriminate task nodes from group/project nodes.
 */
export async function queryPerspective(
  name: string,
  options: PerspectiveQueryOptions = {}
): Promise<CliOutput<OFTask[]>> {
  const nameError = validateSearchQuery(name);
  if (nameError) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "Perspective name cannot be empty"
      )
    );
  }

  const limit = options.limit ?? 100;
  const escapedName = escapeJSString(name);

  const body = `
var win = document.windows[0];
var priorPerspective = win.perspective;
var found = false;
var tasks = [];

// Look up the perspective by name — check built-in first, then custom
var targetPerspective = null;

Perspective.BuiltIn.all.forEach(function(p) {
  if (p.name === "${escapedName}") {
    targetPerspective = p;
    found = true;
  }
});

if (!found) {
  var custom = Perspective.Custom.byName("${escapedName}");
  if (custom) {
    targetPerspective = custom;
    found = true;
  }
}

if (!found) {
  return JSON.stringify({ __not_found: true, name: "${escapedName}" });
}

// Switch window to the requested perspective, collect tasks, then restore
try {
  win.perspective = targetPerspective;
  var maxResults = ${String(limit)};
  var count = 0;

  win.content.rootNode.apply(function(node) {
    if (count >= maxResults) { return; }
    if (node.object instanceof Task) {
      tasks.push(${taskSerializerSnippet("node.object")});
      count++;
    }
  });
} finally {
  // Always restore the prior perspective — even on errors
  if (priorPerspective) {
    win.perspective = priorPerspective;
  }
}

return JSON.stringify(tasks);`;

  const result = await runOmniJSWrapped<
    OFTask[] | { __not_found: boolean; name: string }
  >(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query perspective")
    );
  }

  if (result.data === undefined) {
    return success([]);
  }

  // Check for structured "not found" sentinel
  if (
    !Array.isArray(result.data) &&
    "__not_found" in result.data &&
    result.data.__not_found
  ) {
    return failure(
      createError(
        ErrorCode.PERSPECTIVE_NOT_FOUND,
        `Perspective not found: ${name}`
      )
    );
  }

  return success(result.data as OFTask[]);
}

// ---------------------------------------------------------------------------
// createPerspective
// ---------------------------------------------------------------------------

/**
 * Create a custom perspective from an archive payload.
 *
 * **Current limitation**: OmniJS (as of OmniFocus 4) does not expose a public
 * `Perspective.Custom.fromArchive()` factory method. This function returns a
 * structured failure with `ErrorCode.VALIDATION_ERROR` and a clear message
 * describing the limitation. It is included in the public API so that callers
 * can write forward-compatible code and the SDK can surface a clear error
 * rather than throwing.
 *
 * If Omni Group adds this capability to OmniJS in the future, only this
 * function body needs to be updated.
 */
export function createPerspective(
  _name: string,
  _options: CreatePerspectiveOptions
): Promise<CliOutput<CreatePerspectiveResult>> {
  return Promise.resolve(
    failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "createPerspective is not supported: OmniJS does not expose a " +
          "Perspective.Custom.fromArchive() factory. Use OmniFocus's built-in " +
          "perspective import instead."
      )
    )
  );
}

// ---------------------------------------------------------------------------
// renamePerspective
// ---------------------------------------------------------------------------

/**
 * Rename a custom perspective.
 *
 * **Current limitation**: The `name` property of `Perspective.Custom` is
 * read-only in the OmniJS API (as of OmniFocus 4). This function returns a
 * structured failure with `ErrorCode.VALIDATION_ERROR` and a clear message
 * describing the limitation rather than silently failing or throwing.
 *
 * Built-in perspectives are also rejected since they cannot be renamed.
 */
export function renamePerspective(
  idOrName: string,
  _newName: string
): Promise<CliOutput<RenamePerspectiveResult>> {
  if (!idOrName || idOrName.trim() === "") {
    return Promise.resolve(
      failure(
        createError(
          ErrorCode.VALIDATION_ERROR,
          "Perspective identifier or name cannot be empty"
        )
      )
    );
  }

  return Promise.resolve(
    failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "renamePerspective is not supported: the Perspective.Custom.name " +
          "property is read-only in OmniJS. Rename perspectives through the " +
          "OmniFocus UI instead."
      )
    )
  );
}

// ---------------------------------------------------------------------------
// deletePerspective
// ---------------------------------------------------------------------------

/**
 * Delete a custom perspective.
 *
 * **Current limitation**: OmniJS (as of OmniFocus 4) does not support
 * programmatic deletion of custom perspectives. The `deleteObject()` function
 * does not accept perspective objects, and `Perspective.Custom` exposes no
 * delete method. This function returns a structured failure rather than
 * silently failing or throwing.
 *
 * Built-in perspectives are also rejected since they cannot be deleted.
 */
export async function deletePerspective(
  idOrName: string
): Promise<CliOutput<DeletePerspectiveResult>> {
  if (!idOrName || idOrName.trim() === "") {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "Perspective identifier or name cannot be empty"
      )
    );
  }

  const escapedIdOrName = escapeJSString(idOrName);

  // Verify the perspective exists and is not built-in before reporting the
  // limitation — surface a more specific error for built-ins and not-found.
  const body = `
var found = false;
var isBuiltIn = false;
var perspName = null;
var perspId = null;

Perspective.BuiltIn.all.forEach(function(p) {
  if (p.name === "${escapedIdOrName}") {
    found = true;
    isBuiltIn = true;
    perspName = p.name;
    perspId = p.name;
  }
});

if (!found) {
  var custom = Perspective.Custom.byName("${escapedIdOrName}");
  if (!custom) {
    custom = Perspective.Custom.byIdentifier("${escapedIdOrName}");
  }
  if (custom) {
    found = true;
    isBuiltIn = false;
    perspName = custom.name;
    perspId = custom.identifier;
  }
}

return JSON.stringify({ found: found, isBuiltIn: isBuiltIn, name: perspName, id: perspId });`;

  const result = await runOmniJSWrapped<{
    found: boolean;
    isBuiltIn: boolean;
    name: string | null;
    id: string | null;
  }>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to look up perspective")
    );
  }

  if (!result.data?.found) {
    return failure(
      createError(
        ErrorCode.PERSPECTIVE_NOT_FOUND,
        `Perspective not found: ${idOrName}`
      )
    );
  }

  if (result.data.isBuiltIn) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        `Cannot delete built-in perspective: ${idOrName}`
      )
    );
  }

  // Custom perspective found but deletion is not supported by OmniJS
  return failure(
    createError(
      ErrorCode.VALIDATION_ERROR,
      "deletePerspective is not supported: OmniJS does not expose a method " +
        "to delete custom perspectives programmatically. Delete perspectives " +
        "through the OmniFocus UI instead."
    )
  );
}

// ---------------------------------------------------------------------------
// Centralized descriptors
// ---------------------------------------------------------------------------

/**
 * Centralized descriptor for the `perspectives` command.
 *
 * Drives CLI subcommand `perspectives` and MCP tool `perspectives_list`.
 *
 * @public
 */
export const listPerspectivesDescriptor = defineCommand({
  name: "listPerspectives",
  cliName: "perspectives",
  mcpName: "perspectives_list",
  description: "List all perspectives in OmniFocus",
  inputSchema: z.object({}),
  handler: async (_input) => listPerspectives(),
});

/**
 * Centralized descriptor for the `perspective` command.
 *
 * Drives CLI subcommand `perspective` and MCP tool `perspective_query`.
 *
 * @public
 */
export const queryPerspectiveDescriptor = defineCommand({
  name: "queryPerspective",
  cliName: "perspective",
  mcpName: "perspective_query",
  description: "Query tasks from a specific perspective",
  cliPositional: ["name"] as const,
  inputSchema: z.object({
    name: z.string().describe("Perspective name"),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Maximum number of results to return"),
  }),
  handler: async (input) =>
    queryPerspective(input.name, { limit: input.limit }),
});

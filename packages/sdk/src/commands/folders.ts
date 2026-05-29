import { z } from "zod";
import type { CliOutput, CreateFolderOptions, OFFolder } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateFolderName,
  validateId,
  validatePaginationParams,
  validateAllFlag,
} from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";
import {
  buildListQueryBody,
  compileAggregate,
  compileFolderPredicates,
  compileProjection,
  compileSort,
  folderFieldSpec,
  folderGroupKeys,
  type FolderQueryOptions,
  type QueryResult,
} from "../query/index.js";
import { defineCommand } from "../registry/define.js";

/**
 * Centralized descriptor for the `folders` command.
 *
 * Drives the CLI subcommand `folders` and the MCP tool `folders_list`.
 *
 * @public
 */
export const listFoldersDescriptor = defineCommand({
  name: "listFolders",
  cliName: "folders",
  mcpName: "folders_list",
  description: "List folders from OmniFocus",
  inputSchema: z.object({
    parent: z
      .string()
      .optional()
      .describe("Filter by parent folder name or ID"),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Maximum number of results to return"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Number of results to skip for pagination"),
    all: z
      .boolean()
      .optional()
      .describe(
        "When true, return every matching item ignoring --limit/--offset. Mutually exclusive with --limit and --offset."
      ),
  }),
  handler: async (input) =>
    queryFolders({
      parent: input.parent,
      limit: input.limit,
      offset: input.offset,
      all: input.all,
    }),
});

/**
 * Centralized descriptor for the `create-folder` command.
 *
 * Drives the CLI subcommand `create-folder` and the MCP tool `folder_create`.
 *
 * @public
 */
export const createFolderDescriptor = defineCommand({
  name: "createFolder",
  cliName: "create-folder",
  mcpName: "folder_create",
  description: "Create a new folder in OmniFocus",
  cliPositional: ["name"],
  inputSchema: z.object({
    name: z.string().describe("Folder name"),
    parentFolderId: z.string().optional().describe("Parent folder ID"),
    parentFolderName: z.string().optional().describe("Parent folder name"),
  }),
  handler: async (input) =>
    createFolder(input.name, {
      parentFolderId: input.parentFolderId,
      parentFolderName: input.parentFolderName,
    }),
});

/**
 * Create a new folder in OmniFocus.
 */
export async function createFolder(
  name: string,
  options: CreateFolderOptions = {}
): Promise<CliOutput<OFFolder>> {
  // Validate folder name (required for create)
  if (!name || name.trim() === "") {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Folder name cannot be empty")
    );
  }

  const nameError = validateFolderName(name);
  if (nameError) return failure(nameError);

  // Validate optional inputs
  if (options.parentFolderId !== undefined) {
    const parentIdError = validateId(options.parentFolderId, "project");
    if (parentIdError) return failure(parentIdError);
  }

  const parentNameError = validateFolderName(options.parentFolderName);
  if (parentNameError) return failure(parentNameError);

  // Build script body based on whether we're placing in a parent folder
  let findParentAndCreate: string;

  if (options.parentFolderId) {
    findParentAndCreate = `
var parentFolder = flattenedFolders.filter(function(f) {
  return f.id.primaryKey === "${escapeJSString(options.parentFolderId)}";
})[0];
if (!parentFolder) {
  throw new Error("Parent folder not found: ${escapeJSString(options.parentFolderId)}");
}
var newFolder = new Folder("${escapeJSString(name)}", parentFolder);`;
  } else if (options.parentFolderName) {
    findParentAndCreate = `
var parentFolder = flattenedFolders.filter(function(f) {
  return f.name === "${escapeJSString(options.parentFolderName)}";
})[0];
if (!parentFolder) {
  throw new Error("Parent folder not found: ${escapeJSString(options.parentFolderName)}");
}
var newFolder = new Folder("${escapeJSString(name)}", parentFolder);`;
  } else {
    findParentAndCreate = `var newFolder = new Folder("${escapeJSString(name)}");`;
  }

  const body = `
${findParentAndCreate}

var parentId = null;
var parentName = null;
if (newFolder.parent) {
  parentId = newFolder.parent.id.primaryKey;
  parentName = newFolder.parent.name;
}

return JSON.stringify({
  id: newFolder.id.primaryKey,
  name: newFolder.name,
  parentId: parentId,
  parentName: parentName,
  projectCount: newFolder.projects.length,
  folderCount: newFolder.folders.length
});`;

  const result = await runOmniJSWrapped<OFFolder>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to create folder")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No folder data returned")
    );
  }

  return success(result.data);
}

/**
 * Query folders from OmniFocus with the full shared-query vocabulary.
 *
 * Returns a discriminated {@link QueryResult} — the `kind` field tells the
 * caller whether the response is a paged list, a count, an ID list, a single
 * item, or grouped buckets.
 *
 * @public
 */
export async function queryFolders(
  options: FolderQueryOptions = {}
): Promise<CliOutput<QueryResult<OFFolder>>> {
  // Validate the --all flag (must not be combined with --limit or --offset).
  const allFlagError = validateAllFlag(
    options.all,
    options.limit,
    options.offset
  );
  if (allFlagError) return failure(allFlagError);

  // Pagination validation — invalid limits/offsets would produce nonsense in
  // the result envelope.
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

  // Compile each phase. Collect ALL validation errors before returning so the
  // first one we report is the highest-priority.
  const pred = compileFolderPredicates(options);
  const proj = compileProjection(folderFieldSpec, options);
  const sort = compileSort(folderFieldSpec, options);
  const agg = compileAggregate(options, folderGroupKeys);

  const errors = [
    ...pred.validationErrors,
    ...proj.validationErrors,
    ...sort.validationErrors,
    ...agg.validationErrors,
  ];
  if (errors.length > 0) {
    const first = errors[0];
    if (first) return failure(first);
  }

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const body = buildListQueryBody({
    source: "flattenedFolders",
    itemVar: "t",
    conditions: pred.conditions,
    comparator: sort.comparator,
    mapExpression: proj.mapExpression,
    aggregate: agg,
    limit,
    offset,
    all: options.all,
    groupKey: agg.groupKey,
  });

  const result = await runOmniJSWrapped<QueryResult<OFFolder>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query folders")
    );
  }

  if (result.data === undefined) {
    return success(makeEmptyResult(agg.shape, limit, offset));
  }

  return success(result.data);
}

function makeEmptyResult(
  shape: ReturnType<typeof compileAggregate>["shape"],
  limit: number,
  offset: number
): QueryResult<OFFolder> {
  switch (shape) {
    case "count":
      return { kind: "count", count: 0 };
    case "ids":
      return { kind: "ids", ids: [] };
    case "single-first":
    case "single-last":
      return { kind: "single", item: null };
    case "groups":
      return { kind: "groups", groups: [], totalCount: 0 };
    case "list":
      return {
        kind: "list",
        items: [],
        totalCount: 0,
        returnedCount: 0,
        hasMore: false,
        offset,
        limit,
      };
    default: {
      const exhaustive: never = shape;
      throw new Error(`Unknown shape: ${String(exhaustive)}`);
    }
  }
}

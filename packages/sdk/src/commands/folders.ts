import type {
  CliOutput,
  CreateFolderOptions,
  FolderQueryOptions,
  OFFolder,
  PaginatedResult,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateFolderName,
  validateId,
  validatePaginationParams,
} from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";

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
 * Query folders from OmniFocus with optional filters and pagination.
 */
export async function queryFolders(
  options: FolderQueryOptions = {}
): Promise<CliOutput<PaginatedResult<OFFolder>>> {
  // Validate parent filter
  const parentError = validateFolderName(options.parent);
  if (parentError) return failure(parentError);

  // Validate pagination parameters
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

  // Pagination defaults
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  // Build filter condition
  let filterExpr: string;
  if (options.parent !== undefined) {
    filterExpr = `(f.parent && f.parent.name === "${escapeJSString(options.parent)}")`;
  } else {
    filterExpr = "true";
  }

  const body = `
var allFolders = flattenedFolders.filter(function(f) {
  return ${filterExpr};
});

var totalCount = allFolders.length;
var pageOffset = ${String(offset)};
var pageLimit = ${String(limit)};
var paged = allFolders.slice(pageOffset, pageOffset + pageLimit);

var items = paged.map(function(f) {
  var parentId = null;
  var parentName = null;
  if (f.parent) {
    parentId = f.parent.id.primaryKey;
    parentName = f.parent.name;
  }
  return {
    id: f.id.primaryKey,
    name: f.name,
    parentId: parentId,
    parentName: parentName,
    projectCount: f.projects.length,
    folderCount: f.folders.length
  };
});

return JSON.stringify({
  items: items,
  totalCount: totalCount,
  returnedCount: paged.length,
  hasMore: totalCount > (pageOffset + paged.length),
  offset: pageOffset,
  limit: pageLimit
});`;

  const result = await runOmniJSWrapped<PaginatedResult<OFFolder>>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query folders")
    );
  }

  return success(
    result.data ?? {
      items: [],
      totalCount: 0,
      returnedCount: 0,
      hasMore: false,
      offset,
      limit,
    }
  );
}

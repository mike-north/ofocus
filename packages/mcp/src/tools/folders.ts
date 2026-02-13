import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  queryFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from "@ofocus/sdk";
import { formatResult } from "../utils.js";

export function registerFolderTools(server: McpServer): void {
  // folders_list - Query folders
  server.registerTool(
    "folders_list",
    {
      description: "List folders from OmniFocus",
      inputSchema: {
        parent: z
          .string()
          .optional()
          .describe("Filter by parent folder name or ID"),
      },
    },
    async (params) => {
      const result = await queryFolders({
        parent: params.parent,
      });
      return formatResult(result);
    }
  );

  // folder_create - Create a new folder
  server.registerTool(
    "folder_create",
    {
      description: "Create a new folder in OmniFocus",
      inputSchema: {
        name: z.string().describe("Folder name"),
        parentFolderId: z.string().optional().describe("Parent folder ID"),
        parentFolderName: z.string().optional().describe("Parent folder name"),
      },
    },
    async (params) => {
      const result = await createFolder(params.name, {
        parentFolderId: params.parentFolderId,
        parentFolderName: params.parentFolderName,
      });
      return formatResult(result);
    }
  );

  // folder_update - Update folder properties
  server.registerTool(
    "folder_update",
    {
      description: "Update properties of an existing folder",
      inputSchema: {
        folderId: z.string().describe("The ID of the folder to update"),
        name: z.string().optional().describe("New folder name"),
        parentFolderId: z
          .string()
          .optional()
          .describe("Move to parent folder by ID"),
        parentFolderName: z
          .string()
          .optional()
          .describe("Move to parent folder by name"),
      },
    },
    async (params) => {
      const result = await updateFolder(params.folderId, {
        name: params.name,
        parentFolderId: params.parentFolderId,
        parentFolderName: params.parentFolderName,
      });
      return formatResult(result);
    }
  );

  // folder_delete - Delete a folder permanently
  server.registerTool(
    "folder_delete",
    {
      description: "Permanently delete a folder from OmniFocus",
      inputSchema: {
        folderId: z.string().describe("The ID of the folder to delete"),
      },
    },
    async (params) => {
      const result = await deleteFolder(params.folderId);
      return formatResult(result);
    }
  );
}

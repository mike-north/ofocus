import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { queryFolders, createFolder } from "@ofocus/sdk";
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
}

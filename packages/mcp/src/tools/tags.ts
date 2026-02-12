import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { queryTags, createTag, updateTag, deleteTag } from "@ofocus/sdk";
import { formatResult } from "../utils.js";

export function registerTagTools(server: McpServer): void {
  // tags_list - Query tags
  server.registerTool(
    "tags_list",
    {
      description: "List tags from OmniFocus",
      inputSchema: {
        parent: z
          .string()
          .optional()
          .describe("Filter by parent tag name or ID"),
      },
    },
    async (params) => {
      const result = await queryTags({
        parent: params.parent,
      });
      return formatResult(result);
    }
  );

  // tag_create - Create a new tag
  server.registerTool(
    "tag_create",
    {
      description: "Create a new tag in OmniFocus",
      inputSchema: {
        name: z.string().describe("Tag name"),
        parentTagId: z.string().optional().describe("Parent tag ID"),
        parentTagName: z.string().optional().describe("Parent tag name"),
      },
    },
    async (params) => {
      const result = await createTag(params.name, {
        parentTagId: params.parentTagId,
        parentTagName: params.parentTagName,
      });
      return formatResult(result);
    }
  );

  // tag_update - Update a tag
  server.registerTool(
    "tag_update",
    {
      description: "Update an existing tag in OmniFocus",
      inputSchema: {
        tagId: z.string().describe("The ID of the tag to update"),
        name: z.string().optional().describe("New tag name"),
        parentTagId: z.string().optional().describe("New parent tag ID"),
        parentTagName: z.string().optional().describe("New parent tag name"),
      },
    },
    async (params) => {
      const result = await updateTag(params.tagId, {
        name: params.name,
        parentTagId: params.parentTagId,
        parentTagName: params.parentTagName,
      });
      return formatResult(result);
    }
  );

  // tag_delete - Delete a tag
  server.registerTool(
    "tag_delete",
    {
      description: "Delete a tag from OmniFocus",
      inputSchema: {
        tagId: z.string().describe("The ID of the tag to delete"),
      },
    },
    async (params) => {
      const result = await deleteTag(params.tagId);
      return formatResult(result);
    }
  );
}

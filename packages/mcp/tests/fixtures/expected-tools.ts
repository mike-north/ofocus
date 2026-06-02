/**
 * Canonical tool-name lists for the MCP server.
 *
 * This is the single source of truth for expected tool names. Both
 * `smoke.test.ts` and `tools.test.ts` import from here so that adding or
 * renaming a tool only requires updating one place.
 */

export const TASK_TOOLS = [
  "inbox_add",
  "tasks_list",
  "task_complete",
  "task_update",
  "task_drop",
  "task_delete",
  "task_defer",
  "search",
  "tasks_complete_batch",
  "tasks_update_batch",
  "tasks_delete_batch",
  "tasks_defer_batch",
  "task_duplicate",
  "task_apply_repetition",
  "task_clear_repetition",
  "open",
] as const;

export const PROJECT_TOOLS = [
  "projects_list",
  "project_create",
  "project_review",
  "projects_for_review",
  "project_update",
  "project_delete",
  "project_drop",
  "project_review_interval_get",
  "project_review_interval_set",
] as const;

export const TAG_TOOLS = [
  "tags_list",
  "tag_create",
  "tag_update",
  "tag_delete",
] as const;

export const FOLDER_TOOLS = [
  "folders_list",
  "folder_create",
  "folder_update",
  "folder_delete",
] as const;

export const ADVANCED_TOOLS = [
  "subtask_create",
  "subtasks_list",
  "task_move",
  "perspectives_list",
  "perspective_query",
  "forecast",
  "focus_set",
  "focus_clear",
  "focus_get",
  "deferred_list",
  "quick_add",
  "stats",
  "sync_status",
  "sync_trigger",
  "template_save",
  "templates_list",
  "template_get",
  "template_create_project",
  "template_delete",
  "attachment_add",
  "attachments_list",
  "attachment_remove",
  "archive",
  "compact_database",
  "export_taskpaper",
  "import_taskpaper",
  "generate_url",
  "omnifocus_eval",
] as const;

export const PRODUCTIVITY_TOOLS = [
  "changes",
  "next_occurrences",
  "occurrences",
  "today",
  "this_week",
  "resolve",
  "link",
  "unlink",
  "links",
  "readiness",
] as const;

export const ALL_TOOLS = [
  ...TASK_TOOLS,
  ...PROJECT_TOOLS,
  ...TAG_TOOLS,
  ...FOLDER_TOOLS,
  ...ADVANCED_TOOLS,
  ...PRODUCTIVITY_TOOLS,
] as const;

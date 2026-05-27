/**
 * An OmniJS field accessor for a single field on an entity.
 *
 * `omnijsExpr` is a JavaScript expression where `t` is the bound entity
 * variable. The expression should produce a JSON-serializable value.
 *
 * @public
 */
export interface FieldGetter {
  omnijsExpr: string;
}

/**
 * Allowlist of fields the agent may request from a list endpoint,
 * paired with the entity's compact default projection.
 *
 * @public
 */
export interface EntityFieldSpec {
  /** All fields that may be requested. */
  fields: Record<string, FieldGetter>;
  /** Compact default field set when `fields` is not specified. */
  defaultFields: string[];
}

/**
 * Field specification for {@link OFTask}-shaped queries.
 *
 * Field names matching the existing `OFTask` interface map to the same
 * OmniJS expressions used by the legacy projection so default output
 * is byte-for-byte compatible for the canonical default set.
 *
 * @public
 */
export const taskFieldSpec: EntityFieldSpec = {
  fields: {
    id: { omnijsExpr: "t.id.primaryKey" },
    name: { omnijsExpr: "t.name" },
    note: { omnijsExpr: "(t.note || null)" },
    flagged: { omnijsExpr: "t.flagged" },
    completed: { omnijsExpr: "t.completed" },
    dropped: { omnijsExpr: "t.dropped" },
    effectivelyCompleted: { omnijsExpr: "t.effectivelyCompleted" },
    effectivelyDropped: { omnijsExpr: "t.effectivelyDropped" },
    blocked: { omnijsExpr: "t.blocked" },
    dueDate: { omnijsExpr: "(t.dueDate ? t.dueDate.toISOString() : null)" },
    deferDate: { omnijsExpr: "(t.deferDate ? t.deferDate.toISOString() : null)" },
    completionDate: {
      omnijsExpr: "(t.completionDate ? t.completionDate.toISOString() : null)",
    },
    estimatedMinutes: {
      omnijsExpr: "(t.estimatedMinutes != null ? t.estimatedMinutes : null)",
    },
    projectId: {
      omnijsExpr:
        "(t.containingProject ? t.containingProject.id.primaryKey : null)",
    },
    projectName: {
      omnijsExpr: "(t.containingProject ? t.containingProject.name : null)",
    },
    tags: {
      omnijsExpr: "t.tags.map(function(tg) { return tg.name; })",
    },
    parentTaskId: {
      omnijsExpr:
        "((t.parent instanceof Task) ? t.parent.id.primaryKey : null)",
    },
    parentTaskName: {
      omnijsExpr: "((t.parent instanceof Task) ? t.parent.name : null)",
    },
    childTaskCount: { omnijsExpr: "t.children.length" },
    hasAttachments: { omnijsExpr: "(t.attachments.length > 0)" },
    hasRepetition: { omnijsExpr: "(t.repetitionRule != null)" },
    inInbox: { omnijsExpr: "(t.containingProject == null)" },
  },
  defaultFields: ["id", "name", "flagged", "dueDate", "projectName"],
};

/**
 * Field specification for {@link OFProject}-shaped queries.
 *
 * The default field set is compact; extended fields (dates, review metadata,
 * etc.) are available via opt-in `--fields`.
 *
 * @public
 */
export const projectFieldSpec: EntityFieldSpec = {
  fields: {
    id: { omnijsExpr: "t.id.primaryKey" },
    name: { omnijsExpr: "t.name" },
    note: { omnijsExpr: "(t.note || null)" },
    flagged: { omnijsExpr: "t.flagged" },
    sequential: { omnijsExpr: "t.sequential" },
    containsSingletonActions: { omnijsExpr: "t.containsSingletonActions" },
    status: {
      omnijsExpr:
        '(t.status === Project.Status.Active ? "active" : t.status === Project.Status.OnHold ? "on-hold" : t.status === Project.Status.Done ? "completed" : "dropped")',
    },
    dueDate: {
      omnijsExpr: "(t.dueDate ? t.dueDate.toISOString() : null)",
    },
    effectiveDueDate: {
      omnijsExpr: "(t.effectiveDueDate ? t.effectiveDueDate.toISOString() : null)",
    },
    deferDate: {
      omnijsExpr: "(t.deferDate ? t.deferDate.toISOString() : null)",
    },
    effectiveDeferDate: {
      omnijsExpr: "(t.effectiveDeferDate ? t.effectiveDeferDate.toISOString() : null)",
    },
    completionDate: {
      omnijsExpr: "(t.completionDate ? t.completionDate.toISOString() : null)",
    },
    nextReviewDate: {
      omnijsExpr: "(t.nextReviewDate ? t.nextReviewDate.toISOString() : null)",
    },
    lastReviewDate: {
      omnijsExpr: "(t.lastReviewDate ? t.lastReviewDate.toISOString() : null)",
    },
    folderId: {
      omnijsExpr: "(t.parentFolder ? t.parentFolder.id.primaryKey : null)",
    },
    folderName: {
      omnijsExpr: "(t.parentFolder ? t.parentFolder.name : null)",
    },
    taskCount: {
      omnijsExpr: "t.task.flattenedTasks.length",
    },
    remainingTaskCount: {
      omnijsExpr:
        "t.task.flattenedTasks.filter(function(s){ return !s.completed && !s.effectivelyDropped; }).length",
    },
  },
  defaultFields: ["id", "name", "status", "folderName", "remainingTaskCount"],
};

/**
 * Field specification for {@link OFFolder}-shaped queries.
 *
 * Default fields match the mandatory wire shape of OFFolder exactly. Additional
 * fields (flattenedProjectCount, flattenedFolderCount, status) are available
 * via opt-in `--fields` but are NOT part of the default projection.
 *
 * OmniJS API: each Folder has `id.primaryKey`, `name`, `parent` (Folder|null),
 * `folders` (direct children), `projects` (direct child projects),
 * `flattenedFolders`, `flattenedProjects`, `status` (Folder.Status enum).
 *
 * @public
 */
export const folderFieldSpec: EntityFieldSpec = {
  fields: {
    id: { omnijsExpr: "t.id.primaryKey" },
    name: { omnijsExpr: "t.name" },
    parentId: { omnijsExpr: "(t.parent ? t.parent.id.primaryKey : null)" },
    parentName: { omnijsExpr: "(t.parent ? t.parent.name : null)" },
    projectCount: { omnijsExpr: "t.projects.length" },
    folderCount: { omnijsExpr: "t.folders.length" },
    flattenedProjectCount: { omnijsExpr: "t.flattenedProjects.length" },
    flattenedFolderCount: { omnijsExpr: "t.flattenedFolders.length" },
    status: {
      omnijsExpr:
        '(t.status === Folder.Status.Active ? "active" : "dropped")',
    },
  },
  defaultFields: ["id", "name", "parentName", "projectCount"],
};

/**
 * Field specification for {@link OFTag}-shaped queries.
 *
 * The default field set (`id`, `name`, `availableTaskCount`) matches the
 * existing `OFTag` wire shape exactly so default output is byte-for-byte
 * compatible. Additional fields are opt-in via the `fields` option.
 *
 * @public
 */
export const tagFieldSpec: EntityFieldSpec = {
  fields: {
    id: { omnijsExpr: "t.id.primaryKey" },
    name: { omnijsExpr: "t.name" },
    note: { omnijsExpr: "(t.note || null)" },
    parentId: {
      omnijsExpr: "(t.parent ? t.parent.id.primaryKey : null)",
    },
    parentName: {
      omnijsExpr: "(t.parent ? t.parent.name : null)",
    },
    availableTaskCount: { omnijsExpr: "t.availableTaskCount" },
    remainingTaskCount: { omnijsExpr: "t.remainingTaskCount" },
    childTagCount: { omnijsExpr: "t.tags.length" },
    flattenedTagCount: { omnijsExpr: "t.flattenedTags.length" },
    status: {
      omnijsExpr:
        '(t.status === Tag.Status.Active ? "active" : t.status === Tag.Status.OnHold ? "on-hold" : "dropped")',
    },
    allowsNextAction: { omnijsExpr: "t.allowsNextAction" },
  },
  defaultFields: ["id", "name", "availableTaskCount"],
};

/**
 * Valid group keys per entity. The OmniJS expression returns the bucket name
 * (string). Synthetic buckets (e.g., `dueBucket`) compute a coarse label.
 *
 * @public
 */
export interface GroupKeySpec {
  omnijsExpr: string;
}

/**
 * Group keys supported by `projects --group-by`.
 *
 * @public
 */
export const projectGroupKeys: Record<string, GroupKeySpec> = {
  folder: {
    omnijsExpr: '(t.parentFolder ? t.parentFolder.name : "(No Folder)")',
  },
  status: {
    omnijsExpr: `(t.status === Project.Status.Active ? "active" : t.status === Project.Status.OnHold ? "on-hold" : t.status === Project.Status.Done ? "completed" : "dropped")`,
  },
  flagged: {
    omnijsExpr: '(t.flagged ? "flagged" : "not flagged")',
  },
  dueBucket: {
    omnijsExpr: `(function() {
      if (!t.dueDate) return "none";
      var now = new Date();
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var tomorrowStart = new Date(todayStart.getTime() + 86400000);
      var weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
      if (t.dueDate < todayStart) return "overdue";
      if (t.dueDate < tomorrowStart) return "today";
      if (t.dueDate < weekEnd) return "this-week";
      return "later";
    })()`,
  },
  nextReviewBucket: {
    omnijsExpr: `(function() {
      if (!t.nextReviewDate) return "none";
      var now = new Date();
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var tomorrowStart = new Date(todayStart.getTime() + 86400000);
      var weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
      if (t.nextReviewDate < todayStart) return "overdue";
      if (t.nextReviewDate < tomorrowStart) return "today";
      if (t.nextReviewDate < weekEnd) return "this-week";
      return "later";
    })()`,
  },
};

/**
 * Group keys supported by `tasks --group-by`.
 *
 * @public
 */
export const taskGroupKeys: Record<string, GroupKeySpec> = {
  project: {
    omnijsExpr:
      '(t.containingProject ? t.containingProject.name : "(Inbox)")',
  },
  folder: {
    omnijsExpr: `(function() {
      if (!t.containingProject) return "(Inbox)";
      var f = t.containingProject.parentFolder;
      return f ? f.name : "(No Folder)";
    })()`,
  },
  tag: {
    // First tag is the canonical bucket; if multiple, the task still groups once.
    omnijsExpr:
      '(t.tags.length > 0 ? t.tags[0].name : "(No Tag)")',
  },
  flagged: {
    omnijsExpr: '(t.flagged ? "flagged" : "unflagged")',
  },
  status: {
    omnijsExpr: `(function() {
      if (t.completed) return "completed";
      if (t.dropped) return "dropped";
      if (t.blocked) return "blocked";
      return "active";
    })()`,
  },
  dueBucket: {
    omnijsExpr: `(function() {
      if (!t.dueDate) return "none";
      var now = new Date();
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var tomorrowStart = new Date(todayStart.getTime() + 86400000);
      var weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
      if (t.dueDate < todayStart) return "overdue";
      if (t.dueDate < tomorrowStart) return "today";
      if (t.dueDate < weekEnd) return "this-week";
      return "later";
    })()`,
  },
};

/**
 * Group keys supported by `tags --group-by`.
 *
 * @public
 */
export const tagGroupKeys: Record<string, GroupKeySpec> = {
  parent: {
    omnijsExpr: '(t.parent ? t.parent.name : "(Root)")',
  },
  status: {
    omnijsExpr:
      '(t.status === Tag.Status.Active ? "active" : t.status === Tag.Status.OnHold ? "on-hold" : "dropped")',
  },
  isRoot: {
    omnijsExpr: '(t.parent == null ? "root" : "child")',
  },
  hasAvailableTasks: {
    omnijsExpr: '(t.availableTaskCount > 0 ? "active" : "empty")',
  },
};

/**
 * Group keys supported by `folders --group-by`.
 *
 * @public
 */
export const folderGroupKeys: Record<string, GroupKeySpec> = {
  parent: {
    omnijsExpr: '(t.parent ? t.parent.name : "(Root)")',
  },
  status: {
    omnijsExpr:
      '(t.status === Folder.Status.Active ? "active" : "dropped")',
  },
  isRoot: {
    omnijsExpr: '(t.parent == null ? "root" : "child")',
  },
  hasProjects: {
    omnijsExpr: '(t.projects.length > 0 ? "has projects" : "empty")',
  },
};

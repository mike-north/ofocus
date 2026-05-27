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
 * Stub field spec for projects. Filled out in a follow-up phase.
 *
 * @public
 */
export const projectFieldSpec: EntityFieldSpec = {
  fields: {},
  defaultFields: [],
};

/**
 * Stub field spec for folders. Filled out in a follow-up phase.
 *
 * @public
 */
export const folderFieldSpec: EntityFieldSpec = {
  fields: {},
  defaultFields: [],
};

/**
 * Stub field spec for tags. Filled out in a follow-up phase.
 *
 * @public
 */
export const tagFieldSpec: EntityFieldSpec = {
  fields: {},
  defaultFields: [],
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

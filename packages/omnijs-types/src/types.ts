/**
 * Hand-authored TypeScript types for the OmniFocus OmniJS (Omni Automation) API.
 *
 * These types are verified against OmniFocus build 185.15 and derived from
 * https://omni-automation.com/omnifocus/. No machine-readable schema exists for
 * this API; extend the slice as consumers need more.
 *
 * @packageDocumentation
 */

/**
 * The completion/availability status of a {@link Task}.
 * @public
 */
export type TaskStatus =
  | "Available"
  | "Blocked"
  | "Next"
  | "DueSoon"
  | "Overdue"
  | "Completed"
  | "Dropped";

/**
 * The status of a {@link Project}.
 * @public
 */
export type ProjectStatus = "Active" | "OnHold" | "Done" | "Dropped";

/**
 * An opaque database object identifier.
 * @public
 */
export interface DatabaseObjectId {
  readonly primaryKey: string;
}

/**
 * A tag in the OmniFocus database.
 * @public
 */
export interface Tag {
  name: string;
  readonly id: DatabaseObjectId;
  readonly availableTasks: readonly Task[];
}

/**
 * A project in the OmniFocus database.
 * @public
 */
export interface Project {
  name: string;
  readonly id: DatabaseObjectId;
  readonly task: Task;
  sequential: boolean;
  readonly status: ProjectStatus;
}

/**
 * A task in the OmniFocus database.
 * @public
 */
export interface Task {
  name: string;
  note: string;
  flagged: boolean;
  readonly id: DatabaseObjectId;
  completed: boolean;
  dropped: boolean;
  blocked: boolean;
  readonly taskStatus: TaskStatus;
  dueDate: Date | null;
  deferDate: Date | null;
  readonly effectiveDueDate: Date | null;
  readonly effectiveDeferDate: Date | null;
  estimatedMinutes: number | null;
  readonly containingProject: Project | null;
  readonly children: readonly Task[];
  readonly tags: readonly Tag[];
  addTag(tag: Tag): void;
  markComplete(): void;
}

/**
 * A {@link Selection} represents the currently selected objects in OmniFocus.
 * @public
 */
export interface Selection {
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
}

/**
 * A collection of tasks, providing array access and lookup by ID.
 * @public
 */
export type TaskCollection = readonly Task[] & {
  byId(id: string): Task | null;
};

/**
 * A collection of projects, providing array access and lookup by ID.
 * @public
 */
export type ProjectCollection = readonly Project[] & {
  byId(id: string): Project | null;
};

/**
 * An action defined inside an OmniFocus plug-in.
 * @public
 */
export interface PlugInAction {
  validate:
    | ((
        selection: Selection,
        sender: unknown // untyped at the v1 slice boundary; tighten when consumers need it
      ) => boolean)
    | null;
}

/**
 * Constructor type for {@link PlugInAction}.
 * @public
 */
export type PlugInActionConstructor = new (
  perform: (
    selection: Selection,
    sender: unknown // untyped at the v1 slice boundary; tighten when consumers need it
  ) => void
) => PlugInAction;

/**
 * A loaded OmniFocus plug-in instance.
 * @public
 */
export interface PlugInInstance {
  readonly identifier: string;
  library(identifier: string): Record<string, unknown> | null;
}

/**
 * The static `PlugIn` global available in OmniJS script bodies.
 * @public
 */
export interface PlugInStatic {
  find(
    identifier: string,
    minimumVersion?: unknown // untyped at the v1 slice boundary; tighten when consumers need it
  ): PlugInInstance | null;
  readonly all: readonly PlugInInstance[];
  readonly Action: PlugInActionConstructor;
}

/**
 * An alert dialog instance returned by `new Alert(title, message)`.
 * @public
 */
export interface AlertInstance {
  show(): Promise<number>;
}

/**
 * Constructor type for {@link AlertInstance}.
 * @public
 */
export type AlertConstructor = new (
  title: string,
  message: string
) => AlertInstance;

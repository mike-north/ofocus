import type {
  Task as TaskType,
  Project as ProjectType,
  Tag as TagType,
  Selection as SelectionType,
  TaskStatus as TaskStatusType,
  TaskCollection,
  ProjectCollection,
  PlugInStatic,
  AlertConstructor,
} from "./types.js";

declare global {
  // Unqualified type aliases — OmniJS script bodies use bare `Task`, `Project`, etc.
  type Task = TaskType;
  type Project = ProjectType;
  type Tag = TagType;
  type Selection = SelectionType;
  type TaskStatus = TaskStatusType;

  // Runtime globals available in every OmniJS automation script body.
  const flattenedTasks: TaskCollection;
  const flattenedProjects: ProjectCollection;

  function moveTasks(
    tasks: readonly TaskType[],
    target: unknown // untyped at the v1 slice boundary; tighten when consumers need it
  ): void;

  function deleteObject(object: {
    readonly id: { readonly primaryKey: string };
  }): void;

  const Alert: AlertConstructor;
  const PlugIn: PlugInStatic;
}

export {};
